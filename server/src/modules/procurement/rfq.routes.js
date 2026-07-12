// ── RFQ MANAGEMENT (M4) ───────────────────────────────────────────────────────
// Create RFQs, link them to EOS-backed Item Master items, send to suppliers, receive supplier
// quotations, compare them in the base currency (multi-currency aware via the pricing FX chain),
// and award the winner — which mints a Purchase Order from the winning quote (the RFQ → PO link).
//
// Mounted at /rfqs BEFORE the generic CRUD, so the routes defined here win and every verb we do NOT
// define (GET list, PATCH, DELETE) falls through to the generic CRUD untouched. The enriched staff
// list lives at /procurement/rfqs (procurement.routes.js) — we don't redefine it here.
import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize, redactFinancials } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'
import { nextNumber } from '../../core/numbering.js'
import { fxRate, baseCurrency } from '../../core/pricing.js'
import { logAudit } from '../../core/audit.js'

// '' from a form control must never reach a uuid/numeric/date column (Postgres 22P02) — coerce to null.
const clean = (v) => (v === '' || v === undefined ? null : v)
const numOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v))
const numDef = (v, d) => { const n = numOrNull(v); return n == null || Number.isNaN(n) ? d : n }
const round = (n) => Math.round((Number(n) || 0) * 100) / 100
const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const nowIso = () => new Date().toISOString()

// Build the supplier-comparison block for one RFQ. Every quote is converted to the base currency so a
// EUR quote and a USD quote are compared apples-to-apples. Returns { base_currency, rows[], recommended }
// with rows sorted cheapest-first and is_lowest / is_fastest flags. Empty rows when nobody has quoted.
async function buildComparison(rfqId) {
  const base = await baseCurrency()
  const { data: quotes } = await supabase.from('rfq_quotes').select('*').eq('rfq_id', rfqId)
  if (!quotes || !quotes.length) return { base_currency: base, rows: [], recommended: null }

  // resolve FX once per distinct currency (not once per row)
  const currencies = [...new Set(quotes.map((q) => q.currency || base))]
  const fxMap = {}
  await Promise.all(currencies.map(async (c) => { fxMap[c] = await fxRate(c, base) }))

  const rows = quotes.map((q) => {
    const currency = q.currency || base
    const quote = Number(q.quote) || 0
    const fx = fxMap[currency] || 1
    return {
      supplier: q.supplier,
      quote: round(quote),
      currency,
      fx_rate: round(fx),
      base_quote: round(quote * fx),
      base_currency: base,
      lead_time_days: q.lead_time_days ?? null,
      validity_days: q.validity_days ?? null,
      notes: q.notes || null,
      is_awarded: !!q.is_awarded,
      received_at: q.received_at || null,
    }
  })

  const minBase = Math.min(...rows.map((r) => r.base_quote))
  const leadRows = rows.filter((r) => r.lead_time_days != null && Number(r.lead_time_days) > 0)
  const minLead = leadRows.length ? Math.min(...leadRows.map((r) => Number(r.lead_time_days))) : null
  for (const r of rows) {
    r.is_lowest = r.base_quote === minBase
    r.is_fastest = minLead != null && Number(r.lead_time_days) === minLead
  }
  rows.sort((a, b) => a.base_quote - b.base_quote)
  // recommend the cheapest in base currency among those who actually responded
  const recommended = rows.find((r) => r.is_lowest)?.supplier || null
  return { base_currency: base, rows, recommended }
}

export function rfqRouter() {
  const r = Router()

  // POST /rfqs — create an RFQ + its line items in one call. item_id links to the ERP Item Master
  // (where approved EOS items live), so "link RFQ to EOS items" = pick items that carry an eos_entry_id.
  // The item's spec is copied onto the rfq_item so the supplier quotes against the real specification.
  r.post('/', authRequired, authorize('procurement', 'create'), asyncWrap(async (req, res) => {
    const b = req.body || {}
    const rawItems = Array.isArray(b.items) ? b.items : []
    if (!rawItems.length && !b.item_name) {
      return res.status(422).json({ error: 'An RFQ needs at least one item — pick from the Item Master.' })
    }

    // pull the referenced master items so we can copy name / uom / specifications
    const ids = [...new Set(rawItems.map((i) => i.item_id).filter(isUuid))]
    const masterById = {}
    if (ids.length) {
      const { data: master } = await supabase
        .from('items').select('id, item_name, uom, stock_uom, specifications, eos_entry_id').in('id', ids)
      for (const m of master || []) masterById[m.id] = m
    }

    const lineItems = rawItems.map((i) => {
      const m = isUuid(i.item_id) ? masterById[i.item_id] : null
      return {
        item_id: clean(i.item_id),
        item_name: i.item_name || m?.item_name || null,
        qty: numDef(i.qty, 1),
        uom: i.uom || m?.uom || m?.stock_uom || null,
        specifications: i.specifications || m?.specifications || null,
      }
    }).filter((li) => li.item_name || li.item_id)

    const firstName = b.item_name || lineItems[0]?.item_name || null
    const totalQty = numOrNull(b.qty) != null
      ? Number(b.qty)
      : (lineItems.length ? lineItems.reduce((s, x) => s + (Number(x.qty) || 0), 0) : 1)

    const number = await nextNumber('rfqs', 'RFQ')
    const { data: rfq, error } = await supabase.from('rfqs').insert({
      number,
      item_name: firstName,
      project_id: clean(b.project_id),
      project_name: clean(b.project_name),
      qty: totalQty,
      status: 'Open',
      due_date: clean(b.due_date),
      notes: clean(b.notes),
      created_by: req.user.id,
    }).select().single()
    if (error) throw error

    let items = []
    if (lineItems.length) {
      const { data: ins, error: e2 } = await supabase
        .from('rfq_items').insert(lineItems.map((li) => ({ ...li, rfq_id: rfq.id }))).select()
      if (e2) throw e2
      items = ins || []
    }
    await logAudit(req.user, 'rfq', rfq.id, 'create', { number, items: lineItems.length })
    res.status(201).json(redactFinancials(req.user.role, { ...rfq, items }))
  }))

  // GET /rfqs/:id — the RFQ with its items, suppliers, quotes and the live comparison block.
  r.get('/:id', authRequired, authorize('procurement', 'read'), asyncWrap(async (req, res) => {
    const { id } = req.params
    const { data: rfq, error } = await supabase.from('rfqs').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    if (!rfq) return res.status(404).json({ error: 'RFQ not found' })

    const [{ data: items }, { data: suppliers }, { data: quotes }, comparison] = await Promise.all([
      supabase.from('rfq_items').select('*').eq('rfq_id', id).order('created_at', { ascending: true }),
      supabase.from('rfq_suppliers').select('*').eq('rfq_id', id).order('created_at', { ascending: true }),
      supabase.from('rfq_quotes').select('*').eq('rfq_id', id).order('received_at', { ascending: true }),
      buildComparison(id),
    ])
    res.json(redactFinancials(req.user.role, {
      ...rfq,
      items: items || [],
      suppliers: suppliers || [],
      quotes: quotes || [],
      comparison,
    }))
  }))

  // POST /rfqs/:id/suppliers — { suppliers: [name | id | {supplier_id,supplier,email}] }.
  // Records who the RFQ was sent to (status 'Sent'), stamps the RFQ sent_at + status 'Sent'.
  // Idempotent: the unique index (rfq_id, supplier) means re-sending the same supplier is a no-op.
  r.post('/:id/suppliers', authRequired, authorize('procurement', 'update'), asyncWrap(async (req, res) => {
    const { id } = req.params
    const list = Array.isArray(req.body?.suppliers) ? req.body.suppliers : []
    if (!list.length) return res.status(422).json({ error: 'Select at least one supplier to send to.' })

    const { data: rfq } = await supabase.from('rfqs').select('id').eq('id', id).maybeSingle()
    if (!rfq) return res.status(404).json({ error: 'RFQ not found' })

    const rows = []
    for (const entry of list) {
      if (entry && typeof entry === 'object') {
        let sup = null
        if (isUuid(entry.supplier_id)) {
          const { data } = await supabase.from('suppliers').select('id, name').eq('id', entry.supplier_id).maybeSingle()
          sup = data
        }
        const name = entry.supplier || entry.name || sup?.name
        if (name) rows.push({ rfq_id: id, supplier_id: sup?.id || (isUuid(entry.supplier_id) ? entry.supplier_id : null), supplier: name, email: clean(entry.email) })
      } else if (isUuid(entry)) {
        const { data } = await supabase.from('suppliers').select('id, name').eq('id', entry).maybeSingle()
        if (data?.name) rows.push({ rfq_id: id, supplier_id: data.id, supplier: data.name, email: null })
      } else if (entry) {
        const { data } = await supabase.from('suppliers').select('id, name').ilike('name', String(entry)).maybeSingle()
        rows.push({ rfq_id: id, supplier_id: data?.id || null, supplier: String(entry), email: null })
      }
    }
    const toInsert = rows
      .filter((x) => x.supplier)
      .map((x) => ({ ...x, status: 'Sent', sent_at: nowIso() }))
    if (!toInsert.length) return res.status(422).json({ error: 'Could not resolve any supplier from the request.' })

    // idempotent — DO NOTHING on the (rfq_id, supplier) unique index
    const { error } = await supabase.from('rfq_suppliers').upsert(toInsert, { onConflict: 'rfq_id,supplier', ignoreDuplicates: true })
    if (error) throw error
    // always (re)stamp sent_at, but only PROMOTE Open → Sent — adding a supplier to an already
    // Quoted/Awarded/Ordered RFQ must never regress its status backward to 'Sent'.
    await supabase.from('rfqs').update({ sent_at: nowIso() }).eq('id', id)
    await supabase.from('rfqs').update({ status: 'Sent' }).eq('id', id).eq('status', 'Open')

    const { data: all } = await supabase.from('rfq_suppliers').select('*').eq('rfq_id', id).order('created_at', { ascending: true })
    await logAudit(req.user, 'rfq', id, 'send', { suppliers: toInsert.map((x) => x.supplier) })
    res.json(redactFinancials(req.user.role, all || []))
  }))

  // POST /rfqs/:id/quotes — record (or update) a supplier's quotation.
  // { supplier, quote, currency?, lead_time_days?, validity_days?, notes? }
  // Upserts into rfq_quotes (no DB unique index → manual find-then-update) and flips that supplier's
  // rfq_suppliers row to 'Responded'. Moves the RFQ to 'Quoted' unless it was already awarded.
  r.post('/:id/quotes', authRequired, authorize('procurement', 'update'), asyncWrap(async (req, res) => {
    const { id } = req.params
    const b = req.body || {}
    const supplier = String(b.supplier || '').trim()
    const quote = numOrNull(b.quote)
    if (!supplier) return res.status(422).json({ error: 'Supplier is required.' })
    if (quote == null || Number.isNaN(quote)) return res.status(422).json({ error: 'A numeric quote amount is required.' })

    const { data: rfq } = await supabase.from('rfqs').select('id, status').eq('id', id).maybeSingle()
    if (!rfq) return res.status(404).json({ error: 'RFQ not found' })

    const payload = {
      rfq_id: id,
      supplier,
      quote,
      currency: b.currency || (await baseCurrency()),
      lead_time_days: numOrNull(b.lead_time_days),
      validity_days: numOrNull(b.validity_days),
      notes: clean(b.notes),
      received_at: nowIso(),
    }
    const { data: existing } = await supabase.from('rfq_quotes').select('id').eq('rfq_id', id).ilike('supplier', supplier).maybeSingle()
    let saved
    if (existing) {
      const { data, error } = await supabase.from('rfq_quotes').update(payload).eq('id', existing.id).select().single()
      if (error) throw error
      saved = data
    } else {
      const { data, error } = await supabase.from('rfq_quotes').insert(payload).select().single()
      if (error) throw error
      saved = data
    }
    // the supplier responded (creates nothing if they weren't formally sent to)
    await supabase.from('rfq_suppliers').update({ status: 'Responded', responded_at: nowIso() }).eq('rfq_id', id).ilike('supplier', supplier)
    // advance the RFQ, but never overwrite an awarded/ordered one
    await supabase.from('rfqs').update({ status: 'Quoted' }).eq('id', id).neq('status', 'Awarded').neq('status', 'Ordered')

    await logAudit(req.user, 'rfq', id, 'quote', { supplier, quote, currency: payload.currency })
    res.json(redactFinancials(req.user.role, saved))
  }))

  // GET /rfqs/:id/compare — the side-by-side comparison (base-currency, is_lowest / is_fastest,
  // recommended supplier). Returns {} honestly when nobody has quoted yet.
  r.get('/:id/compare', authRequired, authorize('procurement', 'read'), asyncWrap(async (req, res) => {
    const { id } = req.params
    const { data: rfq } = await supabase.from('rfqs').select('id').eq('id', id).maybeSingle()
    if (!rfq) return res.status(404).json({ error: 'RFQ not found' })
    const cmp = await buildComparison(id)
    if (!cmp.rows.length) return res.json({})
    res.json(redactFinancials(req.user.role, cmp))
  }))

  // POST /rfqs/:id/award — { supplier }. Requires the 'approve' access level (a View/Create/Edit user
  // is blocked). The supplier must already have a quote (422 otherwise). Awards the RFQ, flags the
  // winning quote, then CREATES A PURCHASE ORDER from that quote — the RFQ → PO link the owner wants.
  r.post('/:id/award', authRequired, authorize('procurement', 'approve'), asyncWrap(async (req, res) => {
    const { id } = req.params
    const supplier = String(req.body?.supplier || '').trim()
    if (!supplier) return res.status(422).json({ error: 'Supplier is required to award.' })

    const { data: rfq } = await supabase.from('rfqs').select('*').eq('id', id).maybeSingle()
    if (!rfq) return res.status(404).json({ error: 'RFQ not found' })
    // guard against a double-award minting a duplicate PO (the UI hides re-award, but the API must enforce it)
    if (rfq.status === 'Awarded' || rfq.status === 'Ordered') {
      return res.status(409).json({ error: `RFQ already awarded to ${rfq.awarded_supplier || 'a supplier'} — cancel its Purchase Order before re-awarding.` })
    }

    const { data: quote } = await supabase.from('rfq_quotes').select('*').eq('rfq_id', id).ilike('supplier', supplier).maybeSingle()
    if (!quote) return res.status(422).json({ error: `No quote from "${supplier}" — record their quotation before awarding.` })

    const stamp = nowIso()
    const { data: updated, error: e1 } = await supabase.from('rfqs')
      .update({ awarded_supplier: supplier, awarded_at: stamp, status: 'Awarded' }).eq('id', id).select().single()
    if (e1) throw e1

    // flag the winner, clear any previously-flagged quote on this RFQ
    await supabase.from('rfq_quotes').update({ is_awarded: false }).eq('rfq_id', id)
    await supabase.from('rfq_quotes').update({ is_awarded: true }).eq('id', quote.id)

    // link the PO back to the supplier record when we know it
    const { data: supRow } = await supabase.from('rfq_suppliers').select('supplier_id').eq('rfq_id', id).ilike('supplier', supplier).maybeSingle()

    const qty = Number(rfq.qty) || 1
    const amount = Number(quote.quote) || 0
    const rate = qty > 0 ? round(amount / qty) : amount
    const poNumber = await nextNumber('purchase_orders', 'PO')
    const { data: po, error: e2 } = await supabase.from('purchase_orders').insert({
      number: poNumber,
      supplier,
      supplier_id: supRow?.supplier_id || null,
      item_name: rfq.item_name,
      qty,
      rate,
      amount,
      currency: quote.currency || 'SAR',
      rfq_id: id,
      project_id: rfq.project_id || null,
      status: 'Pending',
    }).select().single()
    if (e2) throw e2

    await logAudit(req.user, 'rfq', id, 'award', { supplier, po: poNumber, amount, currency: quote.currency || 'SAR' })
    res.status(201).json(redactFinancials(req.user.role, { rfq: updated, po }))
  }))

  return r
}

export default rfqRouter
