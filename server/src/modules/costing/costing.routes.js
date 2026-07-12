// M3 — Cost Engine. A cost sheet is the profitability model for a project (or a winning quotation):
// five real cost buckets (Material · Manufacturing · Purchase · Labor · Installation) + a project
// overhead allocation (% of direct cost) rolled into total cost, gross profit and net profit.
// ALL the maths lives in core/costing.js — this module only validates input, persists lines and
// re-rolls the sheet after every change. Totals are never trusted from the client; they are DERIVED.
import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize, redactFinancials } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'
import { logAudit } from '../../core/audit.js'
import { nextNumber } from '../../core/numbering.js'
import { CATEGORY_KEYS, recalcSheet, breakdown } from '../../core/costing.js'

// '' must never reach a numeric / uuid / date column (Postgres 22P02) — coerce it to null.
const uuidOrNull = (v) => (v === '' || v == null ? null : v)
const numOr = (v, dflt = 0) => (v === '' || v == null ? dflt : Number(v) || 0)

// Resolve the client's category to the canonical bucket key (case-insensitive). null → invalid.
const canonicalCategory = (raw) =>
  CATEGORY_KEYS.find((k) => k.toLowerCase() === String(raw || '').trim().toLowerCase()) || null

// A sheet the UI can render directly: header + its lines + the cost breakdown (each bucket's share).
async function sheetFull(id) {
  const { data: sheet } = await supabase.from('cost_sheets').select('*').eq('id', id).maybeSingle()
  if (!sheet) return null
  const { data: lines } = await supabase
    .from('cost_sheet_lines').select('*').eq('cost_sheet_id', id).order('created_at', { ascending: true })
  return { ...sheet, lines: lines || [], breakdown: breakdown(sheet) }
}

export function costingRouter() {
  const r = Router()

  // ── PROFITABILITY (portfolio) — MUST be declared before '/:id' so it is not captured as an id ──
  r.get('/profitability', authRequired, authorize('projects', 'read'), asyncWrap(async (req, res) => {
    const { data: sheets } = await supabase.from('cost_sheets').select('*').order('created_at', { ascending: false })
    const rows = (sheets || []).map((s) => ({
      id: s.id, number: s.number, name: s.name, status: s.status,
      project_id: s.project_id, quotation_id: s.quotation_id, currency: s.currency,
      revenue: Number(s.revenue) || 0, total_cost: Number(s.total_cost) || 0,
      gross_profit: Number(s.gross_profit) || 0, net_profit: Number(s.net_profit) || 0,
      gp_percent: Number(s.gp_percent) || 0, np_percent: Number(s.np_percent) || 0,
    }))
    const sum = (k) => rows.reduce((a, x) => a + (Number(x[k]) || 0), 0)
    const revenue = sum('revenue')
    const totals = {
      count: rows.length,
      revenue: Math.round(revenue * 100) / 100,
      total_cost: Math.round(sum('total_cost') * 100) / 100,
      gross_profit: Math.round(sum('gross_profit') * 100) / 100,
      net_profit: Math.round(sum('net_profit') * 100) / 100,
      gp_percent: revenue > 0 ? Math.round((sum('gross_profit') / revenue) * 10000) / 100 : 0,
      np_percent: revenue > 0 ? Math.round((sum('net_profit') / revenue) * 10000) / 100 : 0,
    }
    res.json(redactFinancials(req.user.role, { rows, totals }))
  }))

  // ── LIST ──
  r.get('/', authRequired, authorize('projects', 'read'), asyncWrap(async (req, res) => {
    const { data, error } = await supabase.from('cost_sheets').select('*').order('created_at', { ascending: false })
    if (error) throw error
    res.json(redactFinancials(req.user.role, data || []))
  }))

  // ── READ one (sheet + lines + breakdown) ──
  r.get('/:id', authRequired, authorize('projects', 'read'), asyncWrap(async (req, res) => {
    const full = await sheetFull(req.params.id)
    if (!full) return res.status(404).json({ error: 'Cost sheet not found' })
    res.json(redactFinancials(req.user.role, full))
  }))

  // ── CREATE ── (number from the DB-driven series; accepts project_id and/or quotation_id) ──
  r.post('/', authRequired, authorize('projects', 'create'), asyncWrap(async (req, res) => {
    const b = req.body || {}
    const project_id = uuidOrNull(b.project_id)
    const quotation_id = uuidOrNull(b.quotation_id)
    const number = await nextNumber('cost_sheets', 'CS')

    // derive a readable name when none supplied — from the linked project/quotation, else the number
    let name = String(b.name || '').trim()
    if (!name && project_id) {
      const { data: p } = await supabase.from('projects').select('name, number').eq('id', project_id).maybeSingle()
      if (p) name = `Cost Sheet — ${p.name || p.number}`
    }
    if (!name && quotation_id) {
      const { data: q } = await supabase.from('quotations').select('number, project_name').eq('id', quotation_id).maybeSingle()
      if (q) name = `Cost Sheet — ${q.project_name || q.number}`
    }
    if (!name) name = number

    const { data, error } = await supabase.from('cost_sheets').insert({
      number, name, project_id, quotation_id,
      currency: b.currency || 'SAR',
      overhead_pct: numOr(b.overhead_pct, 0),
      revenue: numOr(b.revenue, 0),
      status: b.status || 'Draft',
      created_by: req.user.id || null,
    }).select().single()
    if (error) return res.status(422).json({ error: error.message })

    await recalcSheet(data.id)                            // derive totals from (currently zero) lines
    await logAudit(req.user, 'cost_sheet', data.id, 'create', { number, name })
    res.status(201).json(redactFinancials(req.user.role, await sheetFull(data.id)))
  }))

  // ── UPDATE header (name / overhead_pct / revenue / status) then re-roll ──
  r.patch('/:id', authRequired, authorize('projects', 'update'), asyncWrap(async (req, res) => {
    const { data: exists } = await supabase.from('cost_sheets').select('id').eq('id', req.params.id).maybeSingle()
    if (!exists) return res.status(404).json({ error: 'Cost sheet not found' })
    const b = req.body || {}
    const patch = {}
    if (b.name !== undefined) patch.name = String(b.name || '').trim() || null
    if (b.overhead_pct !== undefined) patch.overhead_pct = numOr(b.overhead_pct, 0)
    if (b.revenue !== undefined) patch.revenue = numOr(b.revenue, 0)
    if (b.status !== undefined) patch.status = b.status || 'Draft'
    if (Object.keys(patch).length) {
      const { error } = await supabase.from('cost_sheets').update(patch).eq('id', req.params.id)
      if (error) return res.status(422).json({ error: error.message })
    }
    await recalcSheet(req.params.id)                       // overhead_pct / revenue changed → re-derive profit
    await logAudit(req.user, 'cost_sheet', req.params.id, 'update', patch)
    res.json(redactFinancials(req.user.role, await sheetFull(req.params.id)))
  }))

  // ── DELETE sheet (cascade removes its lines) ──
  r.delete('/:id', authRequired, authorize('projects', 'delete'), asyncWrap(async (req, res) => {
    const { error } = await supabase.from('cost_sheets').delete().eq('id', req.params.id)
    if (error) throw error
    await logAudit(req.user, 'cost_sheet', req.params.id, 'delete', null)
    res.json({ ok: true })
  }))

  // ── ADD a cost line (category validated → 422; amount = qty×rate when omitted) then re-roll ──
  r.post('/:id/lines', authRequired, authorize('projects', 'create'), asyncWrap(async (req, res) => {
    const { data: sheet } = await supabase.from('cost_sheets').select('id').eq('id', req.params.id).maybeSingle()
    if (!sheet) return res.status(404).json({ error: 'Cost sheet not found' })
    const b = req.body || {}
    const category = canonicalCategory(b.category)
    if (!category) return res.status(422).json({ error: `category must be one of: ${CATEGORY_KEYS.join(', ')}` })

    const qty = numOr(b.qty, 1)
    const rate = numOr(b.rate, 0)
    const amount = b.amount === '' || b.amount == null ? qty * rate : Number(b.amount) || 0

    const { data, error } = await supabase.from('cost_sheet_lines').insert({
      cost_sheet_id: req.params.id, category,
      description: b.description || null,
      item_id: uuidOrNull(b.item_id),
      qty, rate, amount,
    }).select().single()
    if (error) return res.status(422).json({ error: error.message })

    await recalcSheet(req.params.id)
    await logAudit(req.user, 'cost_sheet_line', data.id, 'create', { cost_sheet_id: req.params.id, category, amount })
    res.status(201).json(redactFinancials(req.user.role, await sheetFull(req.params.id)))
  }))

  // ── UPDATE a line then re-roll ──
  r.patch('/:id/lines/:lineId', authRequired, authorize('projects', 'update'), asyncWrap(async (req, res) => {
    const { data: line } = await supabase
      .from('cost_sheet_lines').select('*').eq('id', req.params.lineId).eq('cost_sheet_id', req.params.id).maybeSingle()
    if (!line) return res.status(404).json({ error: 'Cost line not found on this sheet' })
    const b = req.body || {}
    const patch = {}
    if (b.category !== undefined) {
      const category = canonicalCategory(b.category)
      if (!category) return res.status(422).json({ error: `category must be one of: ${CATEGORY_KEYS.join(', ')}` })
      patch.category = category
    }
    if (b.description !== undefined) patch.description = b.description || null
    if (b.item_id !== undefined) patch.item_id = uuidOrNull(b.item_id)
    if (b.qty !== undefined) patch.qty = numOr(b.qty, 1)
    if (b.rate !== undefined) patch.rate = numOr(b.rate, 0)
    // amount follows qty×rate unless the client sets it explicitly
    const nextQty = patch.qty !== undefined ? patch.qty : Number(line.qty) || 0
    const nextRate = patch.rate !== undefined ? patch.rate : Number(line.rate) || 0
    if (b.amount !== undefined && b.amount !== '' && b.amount != null) patch.amount = Number(b.amount) || 0
    else if (patch.qty !== undefined || patch.rate !== undefined) patch.amount = nextQty * nextRate

    const { error } = await supabase.from('cost_sheet_lines').update(patch).eq('id', req.params.lineId)
    if (error) return res.status(422).json({ error: error.message })

    await recalcSheet(req.params.id)
    await logAudit(req.user, 'cost_sheet_line', req.params.lineId, 'update', patch)
    res.json(redactFinancials(req.user.role, await sheetFull(req.params.id)))
  }))

  // ── DELETE a line then re-roll (an Edit-level PM manages lines day to day → 'update') ──
  r.delete('/:id/lines/:lineId', authRequired, authorize('projects', 'update'), asyncWrap(async (req, res) => {
    const { error } = await supabase
      .from('cost_sheet_lines').delete().eq('id', req.params.lineId).eq('cost_sheet_id', req.params.id)
    if (error) throw error
    await recalcSheet(req.params.id)
    await logAudit(req.user, 'cost_sheet_line', req.params.lineId, 'delete', { cost_sheet_id: req.params.id })
    res.json(redactFinancials(req.user.role, await sheetFull(req.params.id)))
  }))

  // ── PULL FROM PROJECT — seed Material lines from project_equipment (real item / qty / unit_cost)
  //    and Purchase lines from the project's purchase_orders (real committed spend). Never invents
  //    numbers; if the project has none, honestly returns { added: 0 }. Idempotent by signature so a
  //    second pull does not duplicate the same equipment/PO lines. ──
  r.post('/:id/pull-from-project', authRequired, authorize('projects', 'create'), asyncWrap(async (req, res) => {
    const { data: sheet } = await supabase.from('cost_sheets').select('*').eq('id', req.params.id).maybeSingle()
    if (!sheet) return res.status(404).json({ error: 'Cost sheet not found' })
    if (!sheet.project_id) return res.status(422).json({ error: 'This cost sheet is not linked to a project' })

    const [{ data: equip }, { data: pos }, { data: existing }] = await Promise.all([
      supabase.from('project_equipment').select('*').eq('project_id', sheet.project_id),
      supabase.from('purchase_orders').select('*').eq('project_id', sheet.project_id),
      supabase.from('cost_sheet_lines').select('category, description').eq('cost_sheet_id', req.params.id),
    ])
    const seen = new Set((existing || []).map((l) => `${l.category}|${l.description || ''}`))
    const toInsert = []
    let skipped = 0

    for (const e of equip || []) {
      const qty = Number(e.qty) || 0
      const rate = Number(e.unit_cost) || 0
      const description = e.item_name || e.item_code || 'Equipment'
      const sig = `Material|${description}`
      if (seen.has(sig)) { skipped++; continue }
      seen.add(sig)
      toInsert.push({ cost_sheet_id: req.params.id, category: 'Material', description, item_id: e.item_id || null, qty: qty || 1, rate, amount: (qty || 1) * rate })
    }
    for (const po of pos || []) {
      const qty = Number(po.qty) || 1
      const amount = Number(po.amount) || 0
      const description = `PO ${po.number || ''} — ${po.item_name || po.supplier || ''}`.trim()
      const sig = `Purchase|${description}`
      if (seen.has(sig)) { skipped++; continue }
      seen.add(sig)
      toInsert.push({ cost_sheet_id: req.params.id, category: 'Purchase', description, qty, rate: qty ? amount / qty : amount, amount })
    }

    if (toInsert.length) {
      const { error } = await supabase.from('cost_sheet_lines').insert(toInsert)
      if (error) return res.status(422).json({ error: error.message })
      await recalcSheet(req.params.id)
      await logAudit(req.user, 'cost_sheet', req.params.id, 'pull-from-project', { added: toInsert.length, skipped })
    }
    res.json(redactFinancials(req.user.role, { added: toInsert.length, skipped, sheet: await sheetFull(req.params.id) }))
  }))

  return r
}

export default costingRouter
