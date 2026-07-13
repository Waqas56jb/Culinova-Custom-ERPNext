// M8 — Project Equipment Management  ·  panel: 'projects'
// Assign Item-Master (incl. EOS-linked) equipment to a project, track quantities, project cost, and
// the three site lifecycle dimensions: delivery → installation → commissioning. Unit cost/price are
// snapshotted from the item (via THE pricing chain in core/pricing.js when not stored) and every
// money-bearing response is passed through redactFinancials so Sales / Engineering never see cost or
// margin. Stock is NOT moved here — Delivery Notes (stock.routes.js) own the real goods movement; this
// module only records the delivery/installation/commissioning state of each assigned line.
import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize, redactFinancials } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'
import { logAudit } from '../../core/audit.js'
import { priceItem } from '../../core/pricing.js'
import { canSeeFinancials } from '../../rbac/permissions.js'
import { recomputeProject } from '../../core/projectcost.js'

const round = (n) => Math.round((Number(n) || 0) * 100) / 100
const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v))
const uuid = (v) => (v === '' || v === undefined ? null : v) // never send '' to a uuid column (22P02)
const nowIso = () => new Date().toISOString()
const str = (v) => (v === '' || v === undefined ? null : v)

// ── status workflow (free-text columns; this module is the single source of the vocabulary) ─────────
// Each dimension has an ordered set of states. The LAST state is "complete" for the roll-up.
export const STATUS = {
  delivery: ['Pending', 'In Transit', 'Delivered'],
  installation: ['Not Started', 'In Progress', 'Completed'],
  commissioning: ['Not Started', 'In Progress', 'Completed'],
}
const DONE = { delivery: 'Delivered', installation: 'Completed', commissioning: 'Completed' }
const COL = { delivery: 'delivery_status', installation: 'installation_status', commissioning: 'commissioning_status' }
const DEFAULTS = { delivery_status: 'Pending', installation_status: 'Not Started', commissioning_status: 'Not Started' }

// Resolve an item's cost & sell rate: prefer stored chain output; else run THE pricing chain; else 0.
async function ratesForItem(item) {
  let cost = num(item.landed_cost) ?? num(item.cost) ?? num(item.avg_cost)
  let sell = num(item.selling_price) ?? num(item.selling_rate)
  if (cost == null || sell == null) {
    const chain = await priceItem(item).catch(() => null)
    if (chain?.priced) {
      if (cost == null) cost = chain.landed_cost
      if (sell == null) sell = chain.selling_price
    }
  }
  return { unit_cost: round(cost || 0), unit_price: round(sell || 0) }
}

// The project's equipment roll-up, computed straight from the real rows.
function summarize(rows = []) {
  const total = rows.length
  const total_qty = round(rows.reduce((s, r) => s + (Number(r.qty) || 0), 0))
  const total_cost = round(rows.reduce((s, r) => s + (Number(r.total_cost) || 0), 0))
  const total_price = round(rows.reduce((s, r) => s + (Number(r.total_price) || 0), 0))
  const margin = round(total_price - total_cost)
  const gp_percent = total_price > 0 ? round((margin / total_price) * 100) : 0
  const pctDone = (dim) => {
    if (!total) return 0
    const done = rows.filter((r) => String(r[COL[dim]] || '') === DONE[dim]).length
    return round((done / total) * 100)
  }
  return {
    item_count: total,
    total_qty,
    total_cost,
    total_price,
    margin,
    gp_percent,
    delivery_pct: pctDone('delivery'),
    installation_pct: pctDone('installation'),
    commissioning_pct: pctDone('commissioning'),
  }
}

export function equipmentRouter() {
  const r = Router()

  // The status vocabulary — the client loads this instead of hardcoding dropdown options.
  r.get('/meta/status-options', authRequired, authorize('projects', 'read'), asyncWrap(async (req, res) => {
    res.json(STATUS)
  }))

  // LIST — optionally scoped to one project. Financials redacted for Sales/Engineering.
  r.get('/', authRequired, authorize('projects', 'read'), asyncWrap(async (req, res) => {
    let q = supabase.from('project_equipment').select('*')
    if (uuid(req.query.project_id)) q = q.eq('project_id', req.query.project_id)
    const { data, error } = await q.order('created_at', { ascending: true })
    if (error) throw error
    res.json(redactFinancials(req.user.role, data || []))
  }))

  // SUMMARY — the project's equipment roll-up (count, qty, cost, price, margin, % complete per dimension)
  r.get('/summary/:projectId', authRequired, authorize('projects', 'read'), asyncWrap(async (req, res) => {
    const projectId = uuid(req.params.projectId)
    if (!projectId) return res.status(422).json({ error: 'A project is required.' })
    const { data: project } = await supabase.from('projects').select('id, number, name').eq('id', projectId).maybeSingle()
    if (!project) return res.status(404).json({ error: 'Project not found' })
    const { data: rows, error } = await supabase.from('project_equipment').select('*').eq('project_id', projectId)
    if (error) throw error
    const summary = summarize(rows || [])
    res.json(redactFinancials(req.user.role, { project: { id: project.id, number: project.number, name: project.name }, ...summary }))
  }))

  // ASSIGN an item to a project — snapshot code/name + resolve cost/price from the pricing chain.
  r.post('/', authRequired, authorize('projects', 'create'), asyncWrap(async (req, res) => {
    const b = req.body || {}
    const projectId = uuid(b.project_id)
    if (!projectId) return res.status(422).json({ error: 'Select a project to assign equipment to.' })
    const { data: project } = await supabase.from('projects').select('id').eq('id', projectId).maybeSingle()
    if (!project) return res.status(422).json({ error: 'That project does not exist.' })

    // resolve the item from the Item Master (by id, then code, then name)
    let item = null
    if (uuid(b.item_id)) { const { data } = await supabase.from('items').select('*').eq('id', b.item_id).maybeSingle(); item = data }
    if (!item && b.item_code) { const { data } = await supabase.from('items').select('*').ilike('item_code', b.item_code).maybeSingle(); item = data }
    if (!item && b.item_name) { const { data } = await supabase.from('items').select('*').ilike('item_name', b.item_name).maybeSingle(); item = data }
    if (!item) return res.status(422).json({ error: 'Select a valid item from the Item Master.' })

    const qty = num(b.qty) ?? 1
    if (qty <= 0) return res.status(422).json({ error: 'Quantity must be greater than zero.' })

    const rates = await ratesForItem(item)
    const fin = canSeeFinancials(req.user.role)
    // financial users may override the snapshotted cost; anyone may set the price they will bill at
    const unit_cost = fin && num(b.unit_cost) != null ? round(num(b.unit_cost)) : rates.unit_cost
    const unit_price = num(b.unit_price) != null ? round(num(b.unit_price)) : rates.unit_price

    const row = {
      project_id: projectId,
      item_id: item.id,
      item_code: item.item_code || item.code || null,
      item_name: item.item_name || item.name || null,
      boq_item_id: uuid(b.boq_item_id),
      area: str(b.area),
      position: str(b.position),
      qty,
      unit_cost,
      unit_price,
      total_cost: round(qty * unit_cost),
      total_price: round(qty * unit_price),
      delivery_status: DEFAULTS.delivery_status,
      installation_status: DEFAULTS.installation_status,
      commissioning_status: DEFAULTS.commissioning_status,
      warehouse: str(b.warehouse),
      notes: str(b.notes),
    }
    const { data, error } = await supabase.from('project_equipment').insert(row).select().single()
    if (error) return res.status(400).json({ error: error.message })
    await logAudit(req.user, 'project_equipment', data.id, 'assign', { project_id: projectId, item: row.item_name, qty })
    // assigned equipment IS a committed project cost — roll it into the project's P&L
    await recomputeProject(projectId).catch(() => {})
    res.status(201).json(redactFinancials(req.user.role, data))
  }))

  // UPDATE qty / area / position (and cost/price for financial roles) → recompute totals.
  r.patch('/:id', authRequired, authorize('projects', 'update'), asyncWrap(async (req, res) => {
    const b = req.body || {}
    const { data: row } = await supabase.from('project_equipment').select('*').eq('id', req.params.id).maybeSingle()
    if (!row) return res.status(404).json({ error: 'Equipment line not found' })
    const fin = canSeeFinancials(req.user.role)
    const patch = {}
    if ('area' in b) patch.area = str(b.area)
    if ('position' in b) patch.position = str(b.position)
    if ('warehouse' in b) patch.warehouse = str(b.warehouse)
    if ('notes' in b) patch.notes = str(b.notes)
    if ('boq_item_id' in b) patch.boq_item_id = uuid(b.boq_item_id)

    let qty = Number(row.qty) || 0
    if ('qty' in b) {
      const q = num(b.qty)
      if (q == null || q <= 0) return res.status(422).json({ error: 'Quantity must be greater than zero.' })
      qty = q; patch.qty = q
    }
    if ('unit_cost' in b && fin && num(b.unit_cost) != null) patch.unit_cost = round(num(b.unit_cost))
    if ('unit_price' in b && num(b.unit_price) != null) patch.unit_price = round(num(b.unit_price))

    const uCost = patch.unit_cost != null ? patch.unit_cost : Number(row.unit_cost) || 0
    const uPrice = patch.unit_price != null ? patch.unit_price : Number(row.unit_price) || 0
    patch.total_cost = round(qty * uCost)
    patch.total_price = round(qty * uPrice)
    patch.updated_at = nowIso()

    const { data, error } = await supabase.from('project_equipment').update(patch).eq('id', row.id).select().single()
    if (error) return res.status(400).json({ error: error.message })
    await logAudit(req.user, 'project_equipment', row.id, 'update', patch)
    await recomputeProject(row.project_id).catch(() => {})   // a qty/cost change moves the project's committed cost
    res.json(redactFinancials(req.user.role, data))
  }))

  // DELETE an assigned line (Full-Admin action).
  r.delete('/:id', authRequired, authorize('projects', 'delete'), asyncWrap(async (req, res) => {
    const { data: row } = await supabase.from('project_equipment').select('id, project_id').eq('id', req.params.id).maybeSingle()
    if (!row) return res.status(404).json({ error: 'Equipment line not found' })
    const { error } = await supabase.from('project_equipment').delete().eq('id', req.params.id)
    if (error) return res.status(400).json({ error: error.message })
    await logAudit(req.user, 'project_equipment', req.params.id, 'delete', null)
    await recomputeProject(row.project_id).catch(() => {})   // removing equipment lowers committed cost
    res.json({ ok: true })
  }))

  // ADVANCE a lifecycle dimension. Enforces the site workflow:
  //   installation → Completed  requires delivery = Delivered
  //   commissioning → Completed requires installation = Completed
  // Delivered is a real goods movement but stock is owned by Delivery Notes — here we only record it.
  r.post('/:id/status', authRequired, authorize('projects', 'update'), asyncWrap(async (req, res) => {
    const field = String(req.body?.field || '').toLowerCase()
    const value = str(req.body?.value)
    if (!COL[field]) return res.status(422).json({ error: "field must be one of 'delivery', 'installation' or 'commissioning'." })
    if (!value || !STATUS[field].includes(value)) {
      return res.status(422).json({ error: `Invalid ${field} status. Allowed: ${STATUS[field].join(', ')}.` })
    }
    const { data: row } = await supabase.from('project_equipment').select('*').eq('id', req.params.id).maybeSingle()
    if (!row) return res.status(404).json({ error: 'Equipment line not found' })

    if (field === 'installation' && value === 'Completed' && row.delivery_status !== 'Delivered') {
      return res.status(422).json({ error: 'Installation cannot be completed before the equipment is Delivered.' })
    }
    if (field === 'commissioning' && value === 'Completed' && row.installation_status !== 'Completed') {
      return res.status(422).json({ error: 'Commissioning cannot be completed before installation is Completed.' })
    }

    const patch = { [COL[field]]: value, updated_at: nowIso() }
    const { data, error } = await supabase.from('project_equipment').update(patch).eq('id', row.id).select().single()
    if (error) return res.status(400).json({ error: error.message })
    await logAudit(req.user, 'project_equipment', row.id, `${field}-status`, { value })
    res.json(redactFinancials(req.user.role, data))
  }))

  return r
}

export default equipmentRouter
