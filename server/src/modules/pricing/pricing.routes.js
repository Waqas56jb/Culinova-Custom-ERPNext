// M2 — Pricing Engine routes (panel 'warehouse').
// ALL maths lives in core/pricing.js — this module only resolves inputs, persists results and
// manages the pricing masters (landed-cost templates + multi-currency FX). Nothing is re-derived here.
import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize, redactFinancials } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'
import { logAudit } from '../../core/audit.js'
import { priceItem, persistable, setFxRate, baseCurrency } from '../../core/pricing.js'

// '' / undefined → null so we never send a blank string to a numeric/uuid column (Postgres 22P02)
const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v))
const nOrNull = (v) => { const n = num(v); return n == null || Number.isNaN(n) ? null : n }
const toBool = (v) => v === true || v === 'true' || v === 1 || v === '1'

// Owner's rule: an item can only be priced with a REAL supplier cost or a REAL factory cost.
// The core chain treats factory_cost = 0 (a column default) as "has a cost" and would emit a fake
// 0 selling price — so priceability is decided here instead, and no-cost items are reported honestly.
const hasRealCost = (it) => {
  const sp = num(it?.supplier_price)
  const fc = num(it?.factory_cost)
  return (sp != null && sp !== 0) || (fc != null && fc > 0)
}
// Price an item only when it genuinely has a cost; otherwise return the honest unpriced reason.
async function pricedChain(item) {
  if (!hasRealCost(item)) return { priced: false, reason: 'No supplier price or factory cost — enter one to price this item.' }
  return priceItem(item)
}

// Columns that actually exist on landed_cost_templates (the DB has no opex_pct column — see notes).
const TEMPLATE_NUM = ['freight_pct', 'insurance_pct', 'customs_pct', 'transport_pct', 'other_pct', 'markup_factor']
// Item columns a user may override from the pricing panel; each is a real column on `items`.
const APPLY_INPUT_COLS = [
  'supplier_price', 'factory_cost', 'freight_cost', 'insurance_cost', 'customs_duty', 'local_transport',
  'other_landed_cost', 'markup_factor', 'add_margin_pct', 'special_offer_pct', 'exchange_factor', 'price_factor',
  'landed_template_id', 'currency',
]

// Build a clean template row from a request body (numbers coerced, blanks → null, only real columns).
function templatePayload(body, { partial = false } = {}) {
  const out = {}
  if (!partial || 'name' in body) out.name = (body.name ?? '').toString().trim() || null
  for (const k of TEMPLATE_NUM) if (!partial || k in body) out[k] = nOrNull(body[k])
  if (!partial || 'is_default' in body) out.is_default = toBool(body.is_default)
  if (!partial || 'is_active' in body) out.is_active = 'is_active' in body ? toBool(body.is_active) : true
  return out
}

// When a template is flagged default, no other template may keep that flag.
async function clearDefaultExcept(id) {
  await supabase.from('landed_cost_templates').update({ is_default: false }).neq('id', id)
}

export function pricingRouter() {
  const r = Router()

  // ── POST /pricing/preview { item } — live "what-if", never saved ──────────────
  r.post('/preview', authRequired, authorize('warehouse', 'read'), asyncWrap(async (req, res) => {
    const item = req.body?.item
    if (!item || typeof item !== 'object') return res.status(422).json({ error: 'An item object is required' })
    const chain = await pricedChain(item)
    res.json(redactFinancials(req.user.role, chain))
  }))

  // ── GET /pricing/breakdown/:itemId — the full chain for one saved item ────────
  r.get('/breakdown/:itemId', authRequired, authorize('warehouse', 'read'), asyncWrap(async (req, res) => {
    const { data: item } = await supabase.from('items').select('*').eq('id', req.params.itemId).maybeSingle()
    if (!item) return res.status(404).json({ error: 'Item not found' })
    const chain = await pricedChain(item)
    res.json(redactFinancials(req.user.role, { item_id: item.id, item_name: item.item_name, brand: item.brand, model: item.model, ...chain }))
  }))

  // ── POST /pricing/apply/:itemId — price the real item (+ any panel edits) and persist ──
  r.post('/apply/:itemId', authRequired, authorize('warehouse', 'update'), asyncWrap(async (req, res) => {
    const { data: item } = await supabase.from('items').select('*').eq('id', req.params.itemId).maybeSingle()
    if (!item) return res.status(404).json({ error: 'Item not found' })

    // merge panel overrides (only real item columns; blanks coerced to null)
    const overrides = {}
    const body = req.body || {}
    for (const k of APPLY_INPUT_COLS) {
      if (!(k in body)) continue
      overrides[k] = (k === 'currency' || k === 'landed_template_id') ? (body[k] || null) : nOrNull(body[k])
    }
    const merged = { ...item, ...overrides }
    if (!hasRealCost(merged)) return res.status(422).json({ error: 'This item cannot be priced — enter a supplier price or factory cost first.' })
    const chain = await priceItem(merged)
    if (!chain.priced) return res.status(422).json({ error: chain.reason || 'This item cannot be priced — enter a supplier price or factory cost.' })

    // persist the raw inputs the user changed + the computed chain fields
    const update = { ...overrides, ...persistable(chain), updated_at: new Date().toISOString() }
    const { data: saved, error } = await supabase.from('items').update(update).eq('id', item.id).select().single()
    if (error) return res.status(500).json({ error: error.message })

    // pricing history snapshot
    await supabase.from('item_pricing_history').insert({
      item_id: item.id, brand: merged.brand || null, model: merged.model || null,
      cost: chain.landed_cost, selling_price: chain.selling_price, source: 'pricing-apply', created_by: req.user.id,
    }).then(({ error: e }) => { if (e) console.error('pricing history insert failed:', e.message) })

    await logAudit(req.user, 'item_pricing', item.id, 'priced', {
      item: item.item_name, landed: chain.landed_cost, selling: chain.selling_price, gp_percent: chain.gp_percent,
    }).catch(() => {})

    res.json(redactFinancials(req.user.role, { ...chain, item_id: item.id, item_name: saved.item_name }))
  }))

  // ── POST /pricing/recalc { ids? } — re-price many items ───────────────────────
  r.post('/recalc', authRequired, authorize('warehouse', 'update'), asyncWrap(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : null
    let q = supabase.from('items').select('*')
    if (ids) q = q.in('id', ids)
    const { data: items, error } = await q
    if (error) return res.status(500).json({ error: error.message })

    let updated = 0, skipped = 0
    const unpriced = []
    for (const item of items || []) {
      if (!hasRealCost(item)) { unpriced.push(item.item_name || item.id); continue }
      const chain = await priceItem(item)
      if (!chain.priced) { unpriced.push(item.item_name || item.id); continue }
      const { error: e } = await supabase.from('items')
        .update({ ...persistable(chain), updated_at: new Date().toISOString() }).eq('id', item.id)
      if (e) { skipped++; continue }
      updated++
    }
    await logAudit(req.user, 'item_pricing', null, 'recalc', { updated, skipped, unpriced: unpriced.length }).catch(() => {})
    res.json({ updated, skipped, unpriced })
  }))

  // ── LANDED-COST TEMPLATES CRUD ────────────────────────────────────────────────
  r.get('/templates', authRequired, authorize('warehouse', 'read'), asyncWrap(async (req, res) => {
    const { data, error } = await supabase.from('landed_cost_templates').select('*').order('name', { ascending: true })
    if (error) return res.status(500).json({ error: error.message })
    res.json(redactFinancials(req.user.role, data || []))
  }))

  r.post('/templates', authRequired, authorize('warehouse', 'create'), asyncWrap(async (req, res) => {
    const payload = templatePayload(req.body || {})
    if (!payload.name) return res.status(422).json({ error: 'Template name is required' })
    const { data, error } = await supabase.from('landed_cost_templates').insert(payload).select().single()
    if (error) return res.status(500).json({ error: error.message })
    if (data.is_default) await clearDefaultExcept(data.id)
    await logAudit(req.user, 'landed_cost_template', data.id, 'created', { name: data.name }).catch(() => {})
    res.status(201).json(redactFinancials(req.user.role, data))
  }))

  r.patch('/templates/:id', authRequired, authorize('warehouse', 'update'), asyncWrap(async (req, res) => {
    const payload = templatePayload(req.body || {}, { partial: true })
    if ('name' in payload && !payload.name) return res.status(422).json({ error: 'Template name cannot be empty' })
    const { data, error } = await supabase.from('landed_cost_templates').update(payload).eq('id', req.params.id).select().single()
    if (error) return res.status(error.code === 'PGRST116' ? 404 : 500).json({ error: error.message })
    if (data.is_default) await clearDefaultExcept(data.id)
    await logAudit(req.user, 'landed_cost_template', data.id, 'updated', { name: data.name }).catch(() => {})
    res.json(redactFinancials(req.user.role, data))
  }))

  r.delete('/templates/:id', authRequired, authorize('warehouse', 'delete'), asyncWrap(async (req, res) => {
    const { error } = await supabase.from('landed_cost_templates').delete().eq('id', req.params.id)
    if (error) return res.status(409).json({ error: error.message })
    await logAudit(req.user, 'landed_cost_template', req.params.id, 'deleted', {}).catch(() => {})
    res.json({ ok: true })
  }))

  // ── MULTI-CURRENCY FX ─────────────────────────────────────────────────────────
  // GET /pricing/fx — every currency joined with its latest recorded rate to base
  r.get('/fx', authRequired, authorize('warehouse', 'read'), asyncWrap(async (req, res) => {
    const base = await baseCurrency()
    const [{ data: currencies }, { data: rates }] = await Promise.all([
      supabase.from('currencies').select('*').order('is_base', { ascending: false }).order('code', { ascending: true }),
      supabase.from('exchange_rates').select('*').eq('to_currency', base).order('valid_from', { ascending: false }).order('created_at', { ascending: false }),
    ])
    const latest = {}
    for (const row of rates || []) if (!latest[row.from_currency]) latest[row.from_currency] = row
    const out = (currencies || []).map((c) => {
      const lr = latest[c.code]
      return {
        id: c.id, code: c.code, name: c.name, symbol: c.symbol, is_base: c.is_base, is_active: c.is_active,
        base, exchange_rate: c.is_base ? 1 : Number(c.exchange_rate) || null,
        latest_rate: c.is_base ? 1 : (lr ? Number(lr.rate) : null),
        valid_from: lr?.valid_from || null, source: lr?.source || null,
      }
    })
    res.json(out)
  }))

  // POST /pricing/fx { from_currency, rate, valid_from } — records history AND updates the currency
  r.post('/fx', authRequired, authorize('warehouse', 'create'), asyncWrap(async (req, res) => {
    const from_currency = (req.body?.from_currency || '').toString().trim().toUpperCase()
    const rate = num(req.body?.rate)
    if (!from_currency) return res.status(422).json({ error: 'Currency is required' })
    if (rate == null || Number.isNaN(rate) || rate <= 0) return res.status(422).json({ error: 'A positive exchange rate is required' })
    const base = await baseCurrency()
    if (from_currency === base) return res.status(422).json({ error: `${base} is the base currency — its rate is always 1` })
    const { data: cur } = await supabase.from('currencies').select('code').eq('code', from_currency).maybeSingle()
    if (!cur) return res.status(422).json({ error: `Unknown currency "${from_currency}" — add it in Company Settings first` })
    const row = await setFxRate({ from_currency, rate, valid_from: req.body?.valid_from || null, source: 'manual', created_by: req.user.id })
    await logAudit(req.user, 'exchange_rate', row.id, 'created', { from_currency, rate, base }).catch(() => {})
    res.status(201).json(row)
  }))

  // GET /pricing/fx/history?currency=USD — rate audit trail, newest first
  r.get('/fx/history', authRequired, authorize('warehouse', 'read'), asyncWrap(async (req, res) => {
    let q = supabase.from('exchange_rates').select('*').order('valid_from', { ascending: false }).order('created_at', { ascending: false })
    const currency = (req.query.currency || '').toString().trim().toUpperCase()
    if (currency) q = q.eq('from_currency', currency)
    const { data, error } = await q.limit(200)
    if (error) return res.status(500).json({ error: error.message })
    res.json(data || [])
  }))

  return r
}

export default pricingRouter
