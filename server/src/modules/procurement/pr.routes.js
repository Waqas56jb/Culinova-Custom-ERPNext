// ── PROCUREMENT (M7) ──────────────────────────────────────────────────────────
// Purchase Requisitions (create with items, submit, approve) · Supplier Allocation
// (split an approved PR into POs, one per supplier) · Supplier suggestion from REAL
// history · Delivery Tracking (open POs vs goods received) · Supplier Performance
// (on-time %, lead time, outstanding — all computed from real rows, never invented).
//
// Receiving stock is NOT re-implemented here — the warehouse module owns
// POST /goods-receipt/receive-po/:id (moves stock into stock_balances + stock_ledger
// and mints the GRN). Delivery Tracking & Supplier Performance read the goods_receipts
// those receipts create, so the two modules stay in sync.
import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize, redactFinancials } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'
import { nextNumber } from '../../core/numbering.js'
import { logAudit } from '../../core/audit.js'

// '' from a form control must never reach a uuid/numeric/date column (Postgres 22P02) — coerce to null.
const clean = (v) => (v === '' || v === undefined ? null : v)
const numOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v))
const numDef = (v, d) => { const n = numOrNull(v); return n == null || Number.isNaN(n) ? d : n }
const round = (n) => Math.round((Number(n) || 0) * 100) / 100
const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const nowIso = () => new Date().toISOString()
const dayMs = 24 * 60 * 60 * 1000

// Normalise a raw requisition line from the request into an insertable row.
function lineFrom(i, master) {
  const m = isUuid(i.item_id) ? master[i.item_id] : null
  return {
    item_id: isUuid(i.item_id) ? i.item_id : null,
    item_name: (i.item_name || m?.item_name || m?.name || '').trim() || null,
    qty: numDef(i.qty, 1),
    uom: clean(i.uom) || m?.uom || m?.stock_uom || null,
    est_rate: numOrNull(i.est_rate),
    notes: clean(i.notes),
  }
}

// Resolve the referenced Item Master rows so we can copy name/uom onto each line.
async function masterMap(rawItems) {
  const ids = [...new Set((rawItems || []).map((i) => i.item_id).filter(isUuid))]
  const byId = {}
  if (ids.length) {
    const { data } = await supabase.from('items').select('id, item_name, name, uom, stock_uom').in('id', ids)
    for (const m of data || []) byId[m.id] = m
  }
  return byId
}

// id → project { number, name } for enrichment (PRs & POs carry only project_id).
async function projectMap(ids) {
  const uniq = [...new Set((ids || []).filter(isUuid))]
  const map = {}
  if (uniq.length) {
    const { data } = await supabase.from('projects').select('id, number, name').in('id', uniq)
    for (const p of data || []) map[p.id] = { number: p.number, name: p.name }
  }
  return map
}

// ════════════════════════════════════════════════════════════════════════════
// PURCHASE REQUISITIONS  (mount at /purchase-requisitions)
// ════════════════════════════════════════════════════════════════════════════
export function prRouter() {
  const r = Router()

  // GET / — all requisitions, newest first, each with its line items + project + linked-PO count.
  r.get('/', authRequired, authorize('procurement', 'read'), asyncWrap(async (req, res) => {
    const { data: prs, error } = await supabase.from('purchase_requisitions').select('*').order('created_at', { ascending: false })
    if (error) throw error
    const ids = (prs || []).map((p) => p.id)
    const [{ data: items }, { data: pos }, projMap] = await Promise.all([
      ids.length ? supabase.from('purchase_requisition_items').select('*').in('pr_id', ids) : Promise.resolve({ data: [] }),
      ids.length ? supabase.from('purchase_orders').select('id, pr_id').in('pr_id', ids) : Promise.resolve({ data: [] }),
      projectMap((prs || []).map((p) => p.project_id)),
    ])
    const byPr = {}
    for (const it of items || []) (byPr[it.pr_id] = byPr[it.pr_id] || []).push(it)
    const poCount = {}
    for (const po of pos || []) poCount[po.pr_id] = (poCount[po.pr_id] || 0) + 1
    const rows = (prs || []).map((p) => ({
      ...p,
      project_name: projMap[p.project_id]?.name || null,
      project_number: projMap[p.project_id]?.number || null,
      items: byPr[p.id] || [],
      item_count: (byPr[p.id] || []).length,
      po_count: poCount[p.id] || 0,
    }))
    res.json(redactFinancials(req.user.role, rows))
  }))

  // GET /:id — one requisition with its items, project and the POs it was split into.
  r.get('/:id', authRequired, authorize('procurement', 'read'), asyncWrap(async (req, res) => {
    const { id } = req.params
    if (!isUuid(id)) return res.status(404).json({ error: 'Requisition not found' })
    const { data: pr } = await supabase.from('purchase_requisitions').select('*').eq('id', id).maybeSingle()
    if (!pr) return res.status(404).json({ error: 'Requisition not found' })
    const [{ data: items }, { data: pos }, projMap] = await Promise.all([
      supabase.from('purchase_requisition_items').select('*').eq('pr_id', id).order('created_at', { ascending: true }),
      supabase.from('purchase_orders').select('*').eq('pr_id', id).order('created_at', { ascending: true }),
      projectMap([pr.project_id]),
    ])
    res.json(redactFinancials(req.user.role, {
      ...pr,
      project_name: projMap[pr.project_id]?.name || null,
      project_number: projMap[pr.project_id]?.number || null,
      items: items || [],
      purchase_orders: pos || [],
    }))
  }))

  // POST / — create a requisition together with its line items in one call.
  r.post('/', authRequired, authorize('procurement', 'create'), asyncWrap(async (req, res) => {
    const b = req.body || {}
    const rawItems = Array.isArray(b.items) ? b.items : []
    const master = await masterMap(rawItems)
    const lines = rawItems.map((i) => lineFrom(i, master)).filter((li) => li.item_name)
    if (!lines.length) return res.status(422).json({ error: 'A requisition needs at least one item — pick from the Item Master.' })

    const number = await nextNumber('purchase_requisitions', 'PR')
    const { data: pr, error } = await supabase.from('purchase_requisitions').insert({
      number,
      project_id: clean(b.project_id),
      department: clean(b.department),
      requested_by: req.user.id,
      requester_name: req.user.name || null,
      required_by: clean(b.required_by),
      priority: b.priority || 'Medium',
      status: 'Draft',
      notes: clean(b.notes),
    }).select().single()
    if (error) throw error

    const { data: insItems, error: e2 } = await supabase
      .from('purchase_requisition_items').insert(lines.map((li) => ({ ...li, pr_id: pr.id }))).select()
    if (e2) throw e2

    await logAudit(req.user, 'purchase_requisition', pr.id, 'create', { number, items: lines.length })
    res.status(201).json(redactFinancials(req.user.role, { ...pr, items: insItems || [] }))
  }))

  // PATCH /:id — edit the header (and optionally replace items while still a draft).
  r.patch('/:id', authRequired, authorize('procurement', 'update'), asyncWrap(async (req, res) => {
    const { id } = req.params
    const b = req.body || {}
    const { data: pr } = await supabase.from('purchase_requisitions').select('*').eq('id', id).maybeSingle()
    if (!pr) return res.status(404).json({ error: 'Requisition not found' })
    if (pr.status === 'Ordered') return res.status(422).json({ error: 'This requisition is already ordered and can no longer be edited.' })

    const patch = {}
    if ('project_id' in b) patch.project_id = clean(b.project_id)
    if ('department' in b) patch.department = clean(b.department)
    if ('required_by' in b) patch.required_by = clean(b.required_by)
    if ('priority' in b) patch.priority = b.priority || 'Medium'
    if ('notes' in b) patch.notes = clean(b.notes)
    // status transitions go through submit/approve/to-po only — never a blind PATCH (would bypass the approval gate)
    if (Object.keys(patch).length) {
      const { error } = await supabase.from('purchase_requisitions').update(patch).eq('id', id)
      if (error) throw error
    }

    // optional full replacement of line items (only meaningful before it becomes a PO)
    if (Array.isArray(b.items)) {
      const master = await masterMap(b.items)
      const lines = b.items.map((i) => lineFrom(i, master)).filter((li) => li.item_name)
      if (!lines.length) return res.status(422).json({ error: 'A requisition needs at least one item.' })
      await supabase.from('purchase_requisition_items').delete().eq('pr_id', id)
      const { error: e2 } = await supabase.from('purchase_requisition_items').insert(lines.map((li) => ({ ...li, pr_id: id })))
      if (e2) throw e2
    }

    const { data: updated } = await supabase.from('purchase_requisitions').select('*').eq('id', id).maybeSingle()
    const { data: items } = await supabase.from('purchase_requisition_items').select('*').eq('pr_id', id).order('created_at', { ascending: true })
    await logAudit(req.user, 'purchase_requisition', id, 'update', patch)
    res.json(redactFinancials(req.user.role, { ...updated, items: items || [] }))
  }))

  // DELETE /:id — remove a requisition and its lines (Full Admin only).
  r.delete('/:id', authRequired, authorize('procurement', 'delete'), asyncWrap(async (req, res) => {
    const { id } = req.params
    const { data: pr } = await supabase.from('purchase_requisitions').select('id, status').eq('id', id).maybeSingle()
    if (!pr) return res.status(404).json({ error: 'Requisition not found' })
    if (pr.status === 'Ordered') return res.status(422).json({ error: 'Ordered requisitions cannot be deleted — cancel the linked POs first.' })
    await supabase.from('purchase_requisition_items').delete().eq('pr_id', id)
    await supabase.from('purchase_requisitions').delete().eq('id', id)
    await logAudit(req.user, 'purchase_requisition', id, 'delete', {})
    res.json({ ok: true })
  }))

  // POST /:id/submit — Draft → Submitted (ready for approval).
  r.post('/:id/submit', authRequired, authorize('procurement', 'update'), asyncWrap(async (req, res) => {
    const { id } = req.params
    const { data: pr } = await supabase.from('purchase_requisitions').select('*').eq('id', id).maybeSingle()
    if (!pr) return res.status(404).json({ error: 'Requisition not found' })
    if (['Approved', 'Ordered'].includes(pr.status)) return res.status(422).json({ error: `Cannot submit a ${pr.status.toLowerCase()} requisition.` })
    const { data, error } = await supabase.from('purchase_requisitions').update({ status: 'Submitted' }).eq('id', id).select().single()
    if (error) throw error
    await logAudit(req.user, 'purchase_requisition', id, 'submit', { number: pr.number })
    res.json(redactFinancials(req.user.role, data))
  }))

  // POST /:id/approve — approver only. Marks Approved + stamps approver.
  r.post('/:id/approve', authRequired, authorize('procurement', 'approve'), asyncWrap(async (req, res) => {
    const { id } = req.params
    const { data: pr } = await supabase.from('purchase_requisitions').select('*').eq('id', id).maybeSingle()
    if (!pr) return res.status(404).json({ error: 'Requisition not found' })
    if (pr.status === 'Ordered') return res.status(422).json({ error: 'This requisition is already ordered.' })
    if (pr.status === 'Approved') return res.status(422).json({ error: 'This requisition is already approved.' })
    const { data, error } = await supabase.from('purchase_requisitions')
      .update({ status: 'Approved', approved_by: req.user.id, approved_at: nowIso() }).eq('id', id).select().single()
    if (error) throw error
    await logAudit(req.user, 'purchase_requisition', id, 'approve', { number: pr.number })
    res.json(redactFinancials(req.user.role, data))
  }))

  // GET /:id/suggest-suppliers — for every line, the suppliers that have ACTUALLY supplied that
  // item before (item_suppliers link + past purchase_orders for the same item_name), with their
  // most recent rate and the on-time % from the suppliers master. Real history only — empty if none.
  r.get('/:id/suggest-suppliers', authRequired, authorize('procurement', 'read'), asyncWrap(async (req, res) => {
    const { id } = req.params
    const { data: pr } = await supabase.from('purchase_requisitions').select('id').eq('id', id).maybeSingle()
    if (!pr) return res.status(404).json({ error: 'Requisition not found' })
    const { data: items } = await supabase.from('purchase_requisition_items').select('*').eq('pr_id', id).order('created_at', { ascending: true })

    // suppliers master (for on-time % + id resolution)
    const { data: supRows } = await supabase.from('suppliers').select('id, name, on_time, rating, category')
    const supByName = {}
    for (const s of supRows || []) supByName[(s.name || '').toLowerCase()] = s

    const out = []
    for (const li of items || []) {
      const found = {}  // name(lower) → { supplier, supplier_id, last_rate, last_date, times_supplied, on_time_pct }
      const bump = (name, { rate, date, part_no } = {}) => {
        if (!name) return
        const key = name.toLowerCase()
        const master = supByName[key]
        const e = found[key] || (found[key] = {
          supplier: master?.name || name,
          supplier_id: master?.id || null,
          category: master?.category || null,
          on_time_pct: master?.on_time != null ? Number(master.on_time) : null,
          last_rate: null, last_date: null, times_supplied: 0, supplier_part_no: null,
        })
        if (part_no && !e.supplier_part_no) e.supplier_part_no = part_no
        if (rate != null || date) {
          e.times_supplied += 1
          if (rate != null && (e.last_date == null || (date && date > e.last_date))) { e.last_rate = round(rate); e.last_date = date || e.last_date }
          else if (rate != null && e.last_rate == null) e.last_rate = round(rate)
        }
      }

      // 1) explicit item↔supplier links (needs the master item id)
      if (isUuid(li.item_id)) {
        const { data: links } = await supabase.from('item_suppliers').select('supplier, supplier_part_no').eq('item_id', li.item_id)
        for (const l of links || []) bump(l.supplier, { part_no: l.supplier_part_no })
      }
      // 2) real purchase history for the same item name
      if (li.item_name) {
        const { data: hist } = await supabase.from('purchase_orders')
          .select('supplier, rate, amount, qty, created_at').ilike('item_name', li.item_name).order('created_at', { ascending: true })
        for (const h of hist || []) {
          const rate = h.rate != null ? Number(h.rate) : (Number(h.qty) ? Number(h.amount) / Number(h.qty) : null)
          bump(h.supplier, { rate, date: h.created_at })
        }
      }
      out.push({ pr_item_id: li.id, item_id: li.item_id, item_name: li.item_name, uom: li.uom, qty: li.qty, est_rate: li.est_rate, suppliers: Object.values(found) })
    }
    res.json(redactFinancials(req.user.role, { pr_id: id, items: out }))
  }))

  // POST /:id/to-po — SUPPLIER ALLOCATION. Body: { allocations: [{ item_name|pr_item_id, supplier, rate, currency? }] }.
  // Splits an APPROVED requisition into purchase orders (one PO row per allocated line, linked via pr_id),
  // then flips the requisition to 'Ordered'. 422 if the PR is not Approved.
  r.post('/:id/to-po', authRequired, authorize('procurement', 'create'), asyncWrap(async (req, res) => {
    const { id } = req.params
    const allocations = Array.isArray(req.body?.allocations) ? req.body.allocations : []
    const { data: pr } = await supabase.from('purchase_requisitions').select('*').eq('id', id).maybeSingle()
    if (!pr) return res.status(404).json({ error: 'Requisition not found' })
    if (pr.status !== 'Approved') return res.status(422).json({ error: 'Only an approved requisition can be split into purchase orders.' })
    if (!allocations.length) return res.status(422).json({ error: 'Provide at least one supplier allocation.' })

    const { data: prItems } = await supabase.from('purchase_requisition_items').select('*').eq('pr_id', id)
    const itemById = {}, itemByName = {}
    for (const it of prItems || []) { itemById[it.id] = it; itemByName[(it.item_name || '').toLowerCase()] = it }

    // resolve every allocation to a real PR line first (fail loudly rather than insert garbage)
    const resolved = []
    for (const a of allocations) {
      const supplier = String(a.supplier || '').trim()
      if (!supplier) return res.status(422).json({ error: 'Every allocation needs a supplier.' })
      const li = (isUuid(a.pr_item_id) && itemById[a.pr_item_id]) || itemByName[String(a.item_name || '').toLowerCase()]
      if (!li) return res.status(422).json({ error: `Allocation references an item that is not on this requisition: "${a.item_name || a.pr_item_id}".` })
      const rate = numDef(a.rate, li.est_rate != null ? Number(li.est_rate) : 0)
      if (rate == null || Number.isNaN(rate) || rate < 0) return res.status(422).json({ error: `A valid rate is required for "${li.item_name}".` })
      resolved.push({ li, supplier, rate, currency: a.currency || 'SAR' })
    }

    // resolve supplier ids once
    const names = [...new Set(resolved.map((x) => x.supplier.toLowerCase()))]
    const { data: supRows } = await supabase.from('suppliers').select('id, name')
    const supIdByName = {}
    for (const s of supRows || []) supIdByName[(s.name || '').toLowerCase()] = s.id

    const created = []
    for (const x of resolved) {
      const qty = Number(x.li.qty) || 1
      const amount = round(qty * x.rate)
      const number = await nextNumber('purchase_orders', 'PO')
      const { data: po, error } = await supabase.from('purchase_orders').insert({
        number,
        supplier: x.supplier,
        supplier_id: supIdByName[x.supplier.toLowerCase()] || null,
        item_name: x.li.item_name,
        project_id: pr.project_id || null,
        qty,
        rate: round(x.rate),
        amount,
        currency: x.currency,
        status: 'Pending',
        expected_date: pr.required_by || null,
        pr_id: id,
        received_qty: 0,
      }).select().single()
      if (error) throw error
      created.push(po)
    }

    const { data: updated } = await supabase.from('purchase_requisitions').update({ status: 'Ordered' }).eq('id', id).select().single()
    await logAudit(req.user, 'purchase_requisition', id, 'to-po', { number: pr.number, pos: created.map((p) => p.number), suppliers: names })

    // group for the caller: suppliers → their POs
    const bySupplier = {}
    for (const po of created) (bySupplier[po.supplier] = bySupplier[po.supplier] || []).push(po)
    res.status(201).json(redactFinancials(req.user.role, {
      requisition: updated,
      purchase_orders: created,
      by_supplier: Object.entries(bySupplier).map(([supplier, pos]) => ({ supplier, count: pos.length, value: round(pos.reduce((s, p) => s + (Number(p.amount) || 0), 0)), pos })),
    }))
  }))

  return r
}

// ════════════════════════════════════════════════════════════════════════════
// PROCUREMENT REPORTS  (mount at /procurement — layered next to procurement.routes.js)
// Delivery Tracking + Supplier Performance. Both computed from real POs + goods_receipts.
// ════════════════════════════════════════════════════════════════════════════
export function procurementReportsRouter() {
  const r = Router()

  // GET /procurement/delivery-tracking — every non-cancelled PO with ordered / received / outstanding
  // qty (received = Σ goods_receipts.qty for that PO) and a derived delivery status.
  r.get('/delivery-tracking', authRequired, authorize('procurement', 'read'), asyncWrap(async (req, res) => {
    const { data: pos } = await supabase.from('purchase_orders').select('*').order('created_at', { ascending: false })
    const open = (pos || []).filter((p) => (p.status || '') !== 'Cancelled')
    const ids = open.map((p) => p.id)
    const { data: grns } = ids.length
      ? await supabase.from('goods_receipts').select('po_id, qty, created_at').in('po_id', ids)
      : { data: [] }
    const recvByPo = {}
    for (const g of grns || []) {
      const e = recvByPo[g.po_id] || (recvByPo[g.po_id] = { qty: 0, last: null })
      e.qty += Number(g.qty) || 0
      if (!e.last || g.created_at > e.last) e.last = g.created_at
    }
    const projMap = await projectMap(open.map((p) => p.project_id))
    const todayMs = Date.now()

    const rows = open.map((p) => {
      const ordered = Number(p.qty) || 0
      const received = round((recvByPo[p.id]?.qty) || 0)
      const outstanding = round(Math.max(0, ordered - received))
      const expMs = p.expected_date ? new Date(p.expected_date).getTime() : null
      let status
      if (outstanding <= 0 && received > 0) status = 'Received'
      else if (expMs != null && expMs < todayMs && outstanding > 0) status = 'Overdue'
      else if (received > 0) status = 'Partially Received'
      else status = 'Pending'
      return {
        id: p.id, number: p.number, supplier: p.supplier, supplier_id: p.supplier_id,
        item_name: p.item_name, project_id: p.project_id, project_name: projMap[p.project_id]?.name || null,
        currency: p.currency || 'SAR', amount: Number(p.amount) || 0, rate: p.rate != null ? Number(p.rate) : null,
        ordered_qty: ordered, received_qty: received, outstanding_qty: outstanding,
        expected_date: p.expected_date || null, last_receipt_at: recvByPo[p.id]?.last || null,
        po_status: p.status, status,
      }
    })
    // overdue first, then soonest expected date, then newest
    const rank = { Overdue: 0, Pending: 1, 'Partially Received': 2, Received: 3 }
    rows.sort((a, b) => (rank[a.status] - rank[b.status]) || ((a.expected_date || '9999') < (b.expected_date || '9999') ? -1 : 1))
    res.json(redactFinancials(req.user.role, rows))
  }))

  // GET /procurement/supplier-performance — per supplier, computed from real POs + goods_receipts:
  // total POs, total value, received-on-time count/%, average lead time (GRN date − PO date),
  // outstanding value, and a derived score. Suppliers with no POs show honest zeros / no data.
  r.get('/supplier-performance', authRequired, authorize('procurement', 'read'), asyncWrap(async (req, res) => {
    const [{ data: suppliers }, { data: pos }] = await Promise.all([
      supabase.from('suppliers').select('id, name, category, status'),
      supabase.from('purchase_orders').select('*'),
    ])
    const poIds = (pos || []).map((p) => p.id)
    const { data: grns } = poIds.length
      ? await supabase.from('goods_receipts').select('po_id, qty, created_at').in('po_id', poIds)
      : { data: [] }
    const grnByPo = {}
    for (const g of grns || []) {
      const e = grnByPo[g.po_id] || (grnByPo[g.po_id] = { qty: 0, last: null })
      e.qty += Number(g.qty) || 0
      if (!e.last || g.created_at > e.last) e.last = g.created_at
    }

    // aggregate per supplier name (POs are the source of truth; ensure every master supplier appears)
    const agg = {}
    const ensure = (name, supplier_id, category) => {
      const key = (name || 'Unknown').toLowerCase()
      return agg[key] || (agg[key] = {
        supplier: name || 'Unknown', supplier_id: supplier_id || null, category: category || null,
        total_pos: 0, total_value: 0, received_pos: 0, on_time_count: 0, on_time_den: 0,
        lead_sum: 0, lead_n: 0, outstanding_value: 0,
      })
    }
    for (const s of suppliers || []) ensure(s.name, s.id, s.category)

    for (const p of pos || []) {
      if ((p.status || '') === 'Cancelled') continue
      const a = ensure(p.supplier, p.supplier_id)
      if (p.supplier_id && !a.supplier_id) a.supplier_id = p.supplier_id
      a.total_pos += 1
      a.total_value += Number(p.amount) || 0
      const g = grnByPo[p.id]
      const ordered = Number(p.qty) || 0
      const received = g ? g.qty : 0
      if (received < ordered) a.outstanding_value += round((Number(p.amount) || 0) * (ordered > 0 ? (ordered - received) / ordered : 1))
      if (g) {
        a.received_pos += 1
        // lead time = last GRN date − PO date (days)
        if (p.created_at && g.last) { a.lead_sum += Math.max(0, (new Date(g.last).getTime() - new Date(p.created_at).getTime()) / dayMs); a.lead_n += 1 }
        // on-time only judgeable when an expected date was set
        if (p.expected_date) { a.on_time_den += 1; if (new Date(g.last).getTime() <= new Date(p.expected_date).getTime() + dayMs - 1) a.on_time_count += 1 }
      }
    }

    const rows = Object.values(agg).map((a) => {
      const on_time_pct = a.on_time_den > 0 ? Math.round((a.on_time_count / a.on_time_den) * 100) : null
      const avg_lead_time_days = a.lead_n > 0 ? Math.round((a.lead_sum / a.lead_n) * 10) / 10 : null
      // Derived score (0–100) from real timeliness only; null when there is no delivery data yet.
      const score = on_time_pct != null ? on_time_pct : null
      return {
        supplier: a.supplier, supplier_id: a.supplier_id, category: a.category,
        total_pos: a.total_pos, total_value: round(a.total_value),
        received_pos: a.received_pos, on_time_count: a.on_time_count, on_time_pct,
        avg_lead_time_days, outstanding_value: round(a.outstanding_value),
        score, has_data: a.total_pos > 0,
      }
    })
    rows.sort((x, y) => y.total_value - x.total_value || y.total_pos - x.total_pos)
    res.json(redactFinancials(req.user.role, rows))
  }))

  return r
}

export default prRouter
