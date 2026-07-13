// ============================================================
// M5 — QUOTATION SYSTEM (builder)  ·  panel: 'sales'
// ------------------------------------------------------------
// A rich quotation BUILDER that layers on top of the existing sales quotation flow
// (modules/sales/sales.routes.js keeps create→send→customer-accept→sales-order + approval rules).
// This router owns: create-with-lines, per-line CRUD, EOS spec/technical/image SNAPSHOTTING,
// commercial terms, revision history, and discount application (respecting the max_discount cap).
//
// KEY GUARANTEES
//  • Every line SNAPSHOTS the engineering data (brand/model/uom/description/specifications/
//    image_url/datasheet_url) off the Item Master at add-time — a later EOS change can never
//    silently rewrite a quotation the customer already holds.
//  • rate defaults to the item's selling_price (THE pricing chain, core/pricing.js); cost = the
//    item's landed_cost, stored for Management GP but redacted for Sales/Engineering.
//  • VAT comes from the vat_settings table (never hardcoded); nothing invents numbers.
//  • A quotation's discount can never exceed the item's max_discount cap (discount_rules + the
//    item's own max_discount column).
//  • Only the CUSTOMER may accept/reject — this router adds NO accept route (that stays in
//    sales.routes.js, customer-portal-driven).
// ============================================================
import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize, redactFinancials } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'
import { logAudit } from '../../core/audit.js'
import { nextNumber } from '../../core/numbering.js'
import { priceItem, discountFor, baseCurrency } from '../../core/pricing.js'
import { discountSource, evaluateApproval, effectiveDiscountPct, RULES } from './quotation.rules.js'
import { ensureLeadAndOpportunity, advanceOpportunity } from '../../core/crmflow.js'
import { notifyManagementApproval } from '../../core/notify.js'
import { allocateLines, allocationSummary, allocationColumns } from '../../core/availability.js'

// CEO rule R1 — STOCK FIRST. Every quotation is allocated against live stock BEFORE it is saved:
// each line records how much is served from stock we already own and how much is a shortfall that
// must be purchased. Only the shortfall may ever reach Procurement. Allocation runs over the WHOLE
// line set at once so the same unit of stock can never be promised to two lines.
async function allocateBuilt(built = []) {
  const alloc = await allocateLines(built.map((l) => ({ item_id: l.item_id, item_name: l.item_name, qty: l.qty })))
  const lines = built.map((l, i) => ({ ...l, ...allocationColumns(alloc[i] || {}) }))
  return { lines, alloc, summary: allocationSummary(alloc) }
}

// The builder must obey EXACTLY the same discount rules as the legacy create route — otherwise a
// salesperson could route around their own limit simply by using the newer screen. Two gates apply:
//   1. the ITEM cap  (discount_rules + the item's own max_discount column)
//   2. the ROLE gate (per-role direct limit → approval; above RULES.MAX_DISCOUNT → blocked outright)
// Returns { blocked, reason, needsApproval, status, approval_status }.
function approvalFor({ net, discount_pct, discount_fixed, role }) {
  const discount_amount = (n0(net) * n0(discount_pct)) / 100 + n0(discount_fixed)
  const decision = evaluateApproval({ net_amount: n0(net), discount_amount }, role)
  if (decision.blocked) return decision
  return {
    ...decision,
    status: decision.needsApproval ? 'Pending Approval' : 'Draft',
    approval_status: decision.needsApproval ? 'Pending' : 'Not Required',
  }
}

// ── coercion helpers (blank string must NEVER reach a numeric/uuid/date column → 22P02) ──
const round = (n) => Math.round((Number(n) || 0) * 100) / 100
// '' / null / undefined → null; anything non-finite (e.g. "abc" → NaN) → null too,
// so NaN can never reach a numeric column (it would 22P02 or store garbage).
const num = (v) => { if (v === '' || v === null || v === undefined) return null; const n = Number(v); return Number.isFinite(n) ? n : null }
const n0 = (v) => Number(v) || 0
const clean = (v) => (v === '' || v === undefined ? null : v) // '' → null, keep real values
const validTillFrom = (days) => new Date(Date.now() + (Number(days) || 30) * 86400000).toISOString().slice(0, 10)

// The active/default VAT rate (%) from the DB — no hardcoded 15.
async function vatRatePct() {
  const { data: def } = await supabase.from('vat_settings').select('rate').eq('is_active', true).eq('is_default', true).maybeSingle()
  if (def?.rate != null) return Number(def.rate)
  const { data: any } = await supabase.from('vat_settings').select('rate').eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return any?.rate != null ? Number(any.rate) : 15 // last-resort only if the table is empty
}

// Resolve an item's quotation rate (selling) + cost (landed) through THE pricing chain.
// Prefer the value already persisted on the item; fall back to a live chain (discount excluded —
// the quotation applies its own discount). Never invents a number: falls back to 0.
async function priceOf(item) {
  let selling = num(item.selling_price)
  let landed = num(item.landed_cost)
  if (selling == null || selling === 0 || landed == null) {
    try {
      const chain = await priceItem(item, { applyDiscount: false })
      if (chain?.priced) {
        if (selling == null || selling === 0) selling = num(chain.selling_price)
        if (landed == null) landed = num(chain.landed_cost)
      }
    } catch { /* item not priceable — fall through to legacy columns */ }
  }
  if (selling == null || selling === 0) selling = num(item.selling_rate) ?? num(item.standard_rate) ?? 0
  if (landed == null) landed = num(item.cost) ?? 0
  return { selling: n0(selling), landed: n0(landed) }
}

// Build ONE quotation_items row: snapshot engineering data + resolve rate/cost.
// `input` may override any snapshot field / the rate (used on edit so an existing snapshot is kept).
async function buildLine(input = {}, idx = 0) {
  const itemId = clean(input.item_id)
  let itemRow = null
  if (itemId) {
    const { data } = await supabase.from('items').select('*').eq('id', itemId).maybeSingle()
    itemRow = data || null
  }
  const priced = itemRow ? await priceOf(itemRow) : { selling: 0, landed: 0 }
  const qtyRaw = num(input.qty)
  const qty = qtyRaw == null ? 1 : qtyRaw
  const rateOverride = num(input.rate)
  const rate = rateOverride != null ? rateOverride : n0(priced.selling)
  const cost = itemRow ? n0(priced.landed) : n0(input.cost)
  const disc = Math.max(0, Math.min(100, n0(input.discount_pct)))
  // provided field wins (keeps a prior snapshot intact on edit); else snapshot from the item
  const pref = (field, fallback) => (input[field] !== undefined && input[field] !== null && input[field] !== '' ? input[field] : fallback)
  return {
    item_id: itemId,
    item_name: pref('item_name', itemRow?.item_name || itemRow?.name || 'Item'),
    brand: pref('brand', itemRow?.brand ?? null),
    model: pref('model', itemRow?.model ?? null),
    uom: pref('uom', itemRow?.uom || itemRow?.stock_uom || itemRow?.sales_uom || null),
    description: pref('description', itemRow?.description ?? null),
    specifications: pref('specifications', itemRow?.specifications ?? null),
    image_url: pref('image_url', itemRow?.image_url ?? null),
    datasheet_url: pref('datasheet_url', itemRow?.datasheet_url ?? null),
    qty, rate, cost, discount_pct: disc,
    amount: round(qty * rate * (1 - disc / 100)),
    sort_order: num(input.sort_order) ?? idx,
  }
}

const lineAmount = (l) => round(n0(l.qty) * n0(l.rate) * (1 - n0(l.discount_pct) / 100))

// Recompute all header money from the stored lines + header discount + DB VAT. Single source of truth.
async function recomputeTotals(qid) {
  const { data: q } = await supabase.from('quotations').select('*').eq('id', qid).single()
  const { data: lines } = await supabase.from('quotation_items').select('*').eq('quotation_id', qid)
  const rows = lines || []
  const net = round(rows.reduce((s, l) => s + lineAmount(l), 0))
  const cost = round(rows.reduce((s, l) => s + n0(l.qty) * n0(l.cost), 0))
  const dPct = Math.max(0, n0(q.discount_pct))
  const dFixed = Math.max(0, n0(q.discount_fixed))
  const discountAmount = round(Math.min(net, (net * dPct) / 100 + dFixed))
  const netAfter = net - discountAmount
  const vatRate = await vatRatePct()
  const vat = round((netAfter * vatRate) / 100)
  const total = round(netAfter + vat)
  const gp = netAfter > 0 ? round(((netAfter - cost) / netAfter) * 100) : 0
  const patch = { net_amount: net, discount_amount: discountAmount, vat_amount: vat, total_amount: total, cost_amount: cost, gp_percent: gp, updated_at: new Date().toISOString() }
  const { data: updated } = await supabase.from('quotations').update(patch).eq('id', qid).select('*, quotation_items(*)').single()
  return updated
}

// The strictest discount ceiling (%) implied by the quotation's line items: each item's own
// max_discount column AND the discount_rules engine (via discountFor). null = uncapped.
async function discountCapFor(itemIds = []) {
  let cap = null
  const ids = [...new Set(itemIds.filter(Boolean))]
  for (const id of ids) {
    const { data: it } = await supabase.from('items').select('*').eq('id', id).maybeSingle()
    if (!it) continue
    const caps = []
    const own = Number(it.max_discount) || 0
    if (own > 0) caps.push(own)
    const { pct } = await discountFor(it)
    if (pct > 0) caps.push(pct)
    if (caps.length) { const c = Math.min(...caps); cap = cap == null ? c : Math.min(cap, c) }
  }
  return cap
}

// effective combined discount % against a net (handles % + fixed together)
const effectivePct = (net, dPct, dFixed) => {
  const n = n0(net)
  if (n <= 0) return 0
  const amt = Math.min(n, (n * Math.max(0, n0(dPct))) / 100 + Math.max(0, n0(dFixed)))
  return round((amt / n) * 100)
}

// snapshot of the whole quotation (for revision history + diffing)
const snapshotOf = (q, lines) => ({
  header: {
    customer: q.customer, contact_person: q.contact_person, project_name: q.project_name,
    customer_email: q.customer_email, validity_days: q.validity_days, valid_till: q.valid_till,
    payment_terms: q.payment_terms, terms_text: q.terms_text, currency: q.currency,
    discount_pct: q.discount_pct, discount_fixed: q.discount_fixed, net_amount: q.net_amount,
    discount_amount: q.discount_amount, vat_amount: q.vat_amount, total_amount: q.total_amount,
    cost_amount: q.cost_amount, gp_percent: q.gp_percent, notes: q.notes,
  },
  items: (lines || []).map((l) => ({ item_name: l.item_name, qty: l.qty, rate: l.rate, discount_pct: l.discount_pct, amount: l.amount })),
})

// the changed fields between two snapshots (drives "what changed" in revision history)
function diffSnap(prev, cur) {
  const out = []
  if (!prev) return out
  for (const k of Object.keys(cur.header || {})) {
    const a = prev.header?.[k], b = cur.header?.[k]
    if (String(a ?? '') !== String(b ?? '')) out.push({ field: k, from: a ?? null, to: b ?? null })
  }
  const pn = (prev.items || []).length, cn = (cur.items || []).length
  if (pn !== cn) out.push({ field: 'items', from: `${pn} line(s)`, to: `${cn} line(s)` })
  return out
}

const notEditable = (q) => (q.status === 'Ordered' ? 'An ordered quotation cannot be edited' : q.status === 'Lost' ? 'A lost quotation cannot be edited' : null)

export function quotationRouter() {
  const r = Router()

  // ── CREATE a quotation WITH its lines in one call (snapshots specs/technical/images) ──
  r.post('/', authRequired, authorize('sales', 'create'), asyncWrap(async (req, res) => {
    const p = req.body || {}
    if (!p.customer || !String(p.customer).trim()) return res.status(422).json({ error: 'Customer is required' })

    const rawLines = Array.isArray(p.items) ? p.items : []
    const rawBuilt = []
    for (let i = 0; i < rawLines.length; i++) {
      const li = rawLines[i]
      if (!clean(li.item_id) && !clean(li.item_name)) continue // skip empty lines
      rawBuilt.push(await buildLine(li, i))
    }
    // STOCK FIRST (CEO rule R1) — consume what we already own before anything is bought
    const { lines: built, summary: stock } = await allocateBuilt(rawBuilt)

    // GATE 1 — the item cap: the header discount must not exceed the items' max_discount cap
    const cap = await discountCapFor(built.map((l) => l.item_id))
    const net = round(built.reduce((s, l) => s + lineAmount(l), 0))
    const eff = effectivePct(net, p.discount_pct, p.discount_fixed)
    if (cap != null && eff > cap + 0.001) {
      return res.status(422).json({ error: `Discount ${eff}% exceeds the maximum ${cap}% allowed for the items on this quotation` })
    }
    // GATE 2 — the role gate: over the role's own limit → Management approval; over the absolute
    // ceiling → refused. Without this the builder would let a salesperson issue any discount they liked.
    const decision = approvalFor({ net, discount_pct: p.discount_pct, discount_fixed: p.discount_fixed, role: req.user.role })
    if (decision.blocked) return res.status(422).json({ error: decision.reason })

    const validity = num(p.validity_days) ?? 30
    const header = {
      number: await nextNumber('quotations', 'QTN'),
      customer: String(p.customer).trim(),
      contact_person: clean(p.contact_person),
      project_name: clean(p.project_name),
      project_id: clean(p.project_id),
      project_location: clean(p.project_location),
      customer_email: clean(p.customer_email),
      validity_days: validity,
      valid_till: clean(p.valid_till) || validTillFrom(validity),
      payment_terms: clean(p.payment_terms),
      terms_text: clean(p.terms_text),
      currency: clean(p.currency) || (await baseCurrency()),
      discount_pct: Math.max(0, n0(p.discount_pct)),
      discount_fixed: Math.max(0, n0(p.discount_fixed)),
      discount_source: discountSource(req.user.role),
      notes: clean(p.notes),
      status: decision.status,                 // 'Pending Approval' when over the role's limit
      approval_status: decision.approval_status,
      revision: 0,
      owner_id: req.user.id,
      created_by: req.user.id,
      net_amount: 0, discount_amount: 0, vat_amount: 0, total_amount: 0, cost_amount: 0, gp_percent: 0,
    }
    const { data: q, error } = await supabase.from('quotations').insert(header).select().single()
    if (error) return res.status(422).json({ error: error.message })

    if (built.length) {
      const { error: le } = await supabase.from('quotation_items').insert(built.map((l) => ({ ...l, quotation_id: q.id })))
      if (le) { await supabase.from('quotations').delete().eq('id', q.id); return res.status(422).json({ error: le.message }) }
    }
    const full = await recomputeTotals(q.id)
    await supabase.from('quotation_revisions').insert({
      quotation_id: q.id, revision: 0, changed_by: req.user.id,
      changes: { action: 'created', by: req.user.name, snapshot: snapshotOf(full, full.quotation_items) },
    })
    // CRM automation — the same chain the legacy route runs: make sure the customer has a lead +
    // opportunity, then move that opportunity to the Quotation stage. Best-effort: a CRM hiccup must
    // never lose the quotation the salesperson just built.
    try {
      await ensureLeadAndOpportunity({ name: full.customer, email: full.customer_email })
      await advanceOpportunity(full.customer, 'Quotation')
    } catch { /* CRM automation is best-effort */ }
    // over the role's limit → tell Management there is something to approve
    if (decision.needsApproval) { try { await notifyManagementApproval(full, req.user.name) } catch { /* notify is best-effort */ } }

    await logAudit(req.user, 'quotation', q.id, 'created', {
      number: q.number, lines: built.length, status: decision.status,
      from_stock: stock.from_stock, to_purchase: stock.to_purchase,
    })
    // the stock split travels back to the UI so the salesperson SEES what is covered by stock and what
    // will have to be bought — the purchase is only legitimate once the stock has been utilised
    res.status(201).json({
      ...redactFinancials(req.user.role, full),
      _approval: { needsApproval: !!decision.needsApproval },
      stock,
    })
  }))

  // ── active commercial terms (for the terms picker) — registered BEFORE '/:id' ──
  r.get('/terms', authRequired, authorize('sales', 'read'), asyncWrap(async (req, res) => {
    const { data, error } = await supabase.from('commercial_terms').select('*').eq('is_active', true).order('category', { ascending: true }).order('name', { ascending: true })
    if (error) throw error
    res.json(data || [])
  }))

  // ── READ one quotation + items + revisions + resolved commercial terms ──
  r.get('/:id', authRequired, authorize('sales', 'read'), asyncWrap(async (req, res) => {
    const { data: q, error } = await supabase.from('quotations').select('*, quotation_items(*)').eq('id', req.params.id).single()
    if (error || !q) return res.status(404).json({ error: 'Not found' })
    if (Array.isArray(q.quotation_items)) q.quotation_items.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const { data: revisions } = await supabase.from('quotation_revisions').select('*').eq('quotation_id', q.id).order('created_at', { ascending: false })
    const { data: terms } = await supabase.from('commercial_terms').select('*').eq('is_active', true).order('category', { ascending: true })
    // the stock split stored on the lines, rolled up — what we already own vs what must be bought
    const stock = allocationSummary((q.quotation_items || []).map((l) => ({
      item_id: l.item_id, item_name: l.item_name, qty: l.qty,
      from_stock: l.from_stock, to_purchase: l.to_purchase, available: l.available_qty,
    })))
    res.json(redactFinancials(req.user.role, { ...q, revisions: revisions || [], terms: terms || [], stock }))
  }))

  // ── LIVE AVAILABILITY for the builder ──
  // The salesperson must SEE the stock position before committing a line. Given the lines they are
  // composing, this returns the stock-first split WITHOUT saving anything (a what-if).
  r.post('/check-stock', authRequired, authorize('sales', 'read'), asyncWrap(async (req, res) => {
    const lines = Array.isArray(req.body?.items) ? req.body.items : []
    const alloc = await allocateLines(lines.map((l) => ({ item_id: clean(l.item_id), item_name: clean(l.item_name), qty: num(l.qty) ?? 1 })))
    res.json({ lines: alloc, summary: allocationSummary(alloc) })
  }))

  // ── revision history ──
  r.get('/:id/revisions', authRequired, authorize('sales', 'read'), asyncWrap(async (req, res) => {
    const { data, error } = await supabase.from('quotation_revisions').select('*').eq('quotation_id', req.params.id).order('created_at', { ascending: false })
    if (error) throw error
    res.json(redactFinancials(req.user.role, data || []))
  }))

  // ── UPDATE header (+ optional full line replacement) → recompute ──
  r.patch('/:id', authRequired, authorize('sales', 'update'), asyncWrap(async (req, res) => {
    const { data: existing } = await supabase.from('quotations').select('*, quotation_items(*)').eq('id', req.params.id).single()
    if (!existing) return res.status(404).json({ error: 'Not found' })
    const blocked = notEditable(existing)
    if (blocked) return res.status(422).json({ error: blocked })

    const p = req.body || {}
    const patch = {}
    for (const f of ['customer', 'contact_person', 'project_name', 'customer_email', 'payment_terms', 'terms_text', 'currency', 'notes', 'project_location']) {
      if (p[f] !== undefined) patch[f] = clean(p[f])
    }
    if (p.project_id !== undefined) patch.project_id = clean(p.project_id)
    if (p.validity_days !== undefined) {
      const v = num(p.validity_days)
      if (v == null || v <= 0) return res.status(422).json({ error: 'validity_days must be a positive number' })
      patch.validity_days = v
      patch.valid_till = validTillFrom(v)
    }
    if (p.valid_till !== undefined) patch.valid_till = clean(p.valid_till)
    if (p.discount_pct !== undefined) patch.discount_pct = Math.max(0, n0(p.discount_pct))
    if (p.discount_fixed !== undefined) patch.discount_fixed = Math.max(0, n0(p.discount_fixed))

    // optional full replacement of the lines (re-snapshotting; keeps any snapshot the client sends)
    let replaced = false
    let needsApproval = false
    if (Array.isArray(p.items)) {
      const rawBuilt = []
      for (let i = 0; i < p.items.length; i++) {
        const li = p.items[i]
        if (!clean(li.item_id) && !clean(li.item_name)) continue
        rawBuilt.push(await buildLine(li, i))
      }
      // STOCK FIRST — re-allocate against live stock whenever the lines change
      const { lines: built } = await allocateBuilt(rawBuilt)

      // cap check against the resulting lines + resulting discount
      const cap = await discountCapFor(built.map((l) => l.item_id))
      const net = round(built.reduce((s, l) => s + lineAmount(l), 0))
      const dPct = patch.discount_pct != null ? patch.discount_pct : existing.discount_pct
      const dFixed = patch.discount_fixed != null ? patch.discount_fixed : existing.discount_fixed
      const eff = effectivePct(net, dPct, dFixed)
      if (cap != null && eff > cap + 0.001) return res.status(422).json({ error: `Discount ${eff}% exceeds the maximum ${cap}% allowed for the items on this quotation` })
      // role gate on the resulting discount
      const d = approvalFor({ net, discount_pct: dPct, discount_fixed: dFixed, role: req.user.role })
      if (d.blocked) return res.status(422).json({ error: d.reason })
      patch.status = d.status; patch.approval_status = d.approval_status; needsApproval = d.needsApproval

      await supabase.from('quotation_items').delete().eq('quotation_id', existing.id)
      if (built.length) {
        const { error: le } = await supabase.from('quotation_items').insert(built.map((l) => ({ ...l, quotation_id: existing.id })))
        if (le) return res.status(422).json({ error: le.message })
      }
      replaced = true
    }

    // header discount cap + role gate (when the discount changed without replacing lines)
    if (!replaced && (p.discount_pct !== undefined || p.discount_fixed !== undefined)) {
      const ids = (existing.quotation_items || []).map((l) => l.item_id)
      const cap = await discountCapFor(ids)
      const net = round((existing.quotation_items || []).reduce((s, l) => s + lineAmount(l), 0))
      const dPct = patch.discount_pct != null ? patch.discount_pct : existing.discount_pct
      const dFixed = patch.discount_fixed != null ? patch.discount_fixed : existing.discount_fixed
      const eff = effectivePct(net, dPct, dFixed)
      if (cap != null && eff > cap + 0.001) return res.status(422).json({ error: `Discount ${eff}% exceeds the maximum ${cap}% allowed for the items on this quotation` })
      const d = approvalFor({ net, discount_pct: dPct, discount_fixed: dFixed, role: req.user.role })
      if (d.blocked) return res.status(422).json({ error: d.reason })
      patch.status = d.status; patch.approval_status = d.approval_status; needsApproval = d.needsApproval
    }

    if (Object.keys(patch).length) {
      const { error } = await supabase.from('quotations').update(patch).eq('id', existing.id)
      if (error) return res.status(422).json({ error: error.message })
    }
    const full = await recomputeTotals(existing.id)
    if (needsApproval) { try { await notifyManagementApproval(full, req.user.name) } catch { /* best-effort */ } }
    await logAudit(req.user, 'quotation', existing.id, 'edited', { fields: Object.keys(patch), replaced_lines: replaced })
    res.json({ ...redactFinancials(req.user.role, full), _approval: { needsApproval: !!needsApproval } })
  }))

  // ── add ONE line (snapshot specs) → recompute ──
  r.post('/:id/items', authRequired, authorize('sales', 'update'), asyncWrap(async (req, res) => {
    const { data: q } = await supabase.from('quotations').select('*, quotation_items(*)').eq('id', req.params.id).single()
    if (!q) return res.status(404).json({ error: 'Not found' })
    const blocked = notEditable(q)
    if (blocked) return res.status(422).json({ error: blocked })
    const p = req.body || {}
    if (!clean(p.item_id) && !clean(p.item_name)) return res.status(422).json({ error: 'item_id or item_name is required' })
    const idx = (q.quotation_items || []).length
    const line = await buildLine(p, idx)
    const { error } = await supabase.from('quotation_items').insert({ ...line, quotation_id: q.id })
    if (error) return res.status(422).json({ error: error.message })
    const full = await recomputeTotals(q.id)
    await logAudit(req.user, 'quotation', q.id, 'line-added', { item: line.item_name })
    res.status(201).json(redactFinancials(req.user.role, full))
  }))

  // ── update ONE line → recompute ──
  r.patch('/:id/items/:lineId', authRequired, authorize('sales', 'update'), asyncWrap(async (req, res) => {
    const { data: q } = await supabase.from('quotations').select('*').eq('id', req.params.id).single()
    if (!q) return res.status(404).json({ error: 'Not found' })
    const blocked = notEditable(q)
    if (blocked) return res.status(422).json({ error: blocked })
    const { data: line } = await supabase.from('quotation_items').select('*').eq('id', req.params.lineId).eq('quotation_id', q.id).maybeSingle()
    if (!line) return res.status(404).json({ error: 'Line not found' })
    const p = req.body || {}
    const patch = {}
    if (p.qty !== undefined) { const v = num(p.qty); patch.qty = v == null ? line.qty : v }
    if (p.rate !== undefined) { const v = num(p.rate); patch.rate = v == null ? line.rate : v }
    if (p.discount_pct !== undefined) patch.discount_pct = Math.max(0, Math.min(100, n0(p.discount_pct)))
    for (const f of ['item_name', 'brand', 'model', 'uom', 'description', 'specifications', 'image_url', 'datasheet_url']) {
      if (p[f] !== undefined) patch[f] = clean(p[f])
    }
    const merged = { ...line, ...patch }
    patch.amount = round(n0(merged.qty) * n0(merged.rate) * (1 - n0(merged.discount_pct) / 100))
    const { error } = await supabase.from('quotation_items').update(patch).eq('id', line.id)
    if (error) return res.status(422).json({ error: error.message })
    const full = await recomputeTotals(q.id)
    await logAudit(req.user, 'quotation', q.id, 'line-updated', { line: line.id })
    res.json(redactFinancials(req.user.role, full))
  }))

  // ── delete ONE line → recompute ──
  r.delete('/:id/items/:lineId', authRequired, authorize('sales', 'update'), asyncWrap(async (req, res) => {
    const { data: q } = await supabase.from('quotations').select('status').eq('id', req.params.id).single()
    if (!q) return res.status(404).json({ error: 'Not found' })
    const blocked = notEditable(q)
    if (blocked) return res.status(422).json({ error: blocked })
    const { error } = await supabase.from('quotation_items').delete().eq('id', req.params.lineId).eq('quotation_id', req.params.id)
    if (error) return res.status(422).json({ error: error.message })
    const full = await recomputeTotals(req.params.id)
    await logAudit(req.user, 'quotation', req.params.id, 'line-deleted', { line: req.params.lineId })
    res.json(redactFinancials(req.user.role, full))
  }))

  // ── apply a discount (respects the item max_discount cap) ──
  r.post('/:id/apply-discount', authRequired, authorize('sales', 'update'), asyncWrap(async (req, res) => {
    const { data: q } = await supabase.from('quotations').select('*, quotation_items(*)').eq('id', req.params.id).single()
    if (!q) return res.status(404).json({ error: 'Not found' })
    const blocked = notEditable(q)
    if (blocked) return res.status(422).json({ error: blocked })
    const p = req.body || {}
    const hasPct = p.pct !== undefined && p.pct !== null && p.pct !== ''
    const hasFixed = p.fixed !== undefined && p.fixed !== null && p.fixed !== ''
    if (!hasPct && !hasFixed) return res.status(422).json({ error: 'Provide a discount as { pct } or { fixed }' })
    const dPct = hasPct ? Math.max(0, n0(p.pct)) : 0
    const dFixed = hasFixed ? Math.max(0, n0(p.fixed)) : 0

    const net = round((q.quotation_items || []).reduce((s, l) => s + lineAmount(l), 0))
    if (net <= 0) return res.status(422).json({ error: 'Add line items before applying a discount' })
    const eff = effectivePct(net, dPct, dFixed)
    const cap = await discountCapFor((q.quotation_items || []).map((l) => l.item_id))
    if (cap != null && eff > cap + 0.001) {
      return res.status(422).json({ error: `Discount ${eff}% exceeds the maximum ${cap}% allowed for the items on this quotation` })
    }
    // the role gate applies here too — a salesperson must not be able to raise the discount past their
    // own limit by applying it after the quotation was created
    const decision = approvalFor({ net, discount_pct: dPct, discount_fixed: dFixed, role: req.user.role })
    if (decision.blocked) return res.status(422).json({ error: decision.reason })

    const { error } = await supabase.from('quotations').update({
      discount_pct: dPct, discount_fixed: dFixed, discount_source: discountSource(req.user.role),
      status: decision.status, approval_status: decision.approval_status,
    }).eq('id', q.id)
    if (error) return res.status(422).json({ error: error.message })
    const full = await recomputeTotals(q.id)
    if (decision.needsApproval) { try { await notifyManagementApproval(full, req.user.name) } catch { /* best-effort */ } }
    await logAudit(req.user, 'quotation', q.id, 'discount-applied', { effective_pct: eff, cap, needs_approval: !!decision.needsApproval })
    res.json({ ...redactFinancials(req.user.role, full), _approval: { needsApproval: !!decision.needsApproval } })
  }))

  // ── bump the revision, capture the diff, keep the quotation editable ──
  r.post('/:id/revise', authRequired, authorize('sales', 'update'), asyncWrap(async (req, res) => {
    const { data: q } = await supabase.from('quotations').select('*, quotation_items(*)').eq('id', req.params.id).single()
    if (!q) return res.status(404).json({ error: 'Not found' })
    if (q.status === 'Ordered') return res.status(422).json({ error: 'An ordered quotation cannot be revised' })
    const note = (req.body?.note || '').trim() || null

    // find the previous stored snapshot to diff against
    const { data: last } = await supabase.from('quotation_revisions').select('changes').eq('quotation_id', q.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
    const prevSnap = last?.changes?.snapshot || null
    const curSnap = snapshotOf(q, q.quotation_items)
    const diff = diffSnap(prevSnap, curSnap)

    const newRev = (Number(q.revision) || 0) + 1
    await supabase.from('quotations').update({ revision: newRev, updated_at: new Date().toISOString() }).eq('id', q.id)
    await supabase.from('quotation_revisions').insert({
      quotation_id: q.id, revision: newRev, changed_by: req.user.id,
      changes: { action: 'revised', by: req.user.name, note, diff, snapshot: curSnap },
    })
    await logAudit(req.user, 'quotation', q.id, 'revised', { revision: newRev, changed: diff.length })
    const { data: full } = await supabase.from('quotations').select('*, quotation_items(*)').eq('id', q.id).single()
    res.json(redactFinancials(req.user.role, { ...full, revision: newRev }))
  }))

  return r
}

export default quotationRouter
