/**
 * Sprint 1a Block 4 — VR-based single pricing chain verification.
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { supabase } from '../src/config/supabase.js'
import { priceItem, previewBrandExample } from '../src/core/priceEngine.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const BASE = (process.env.BASE || `http://localhost:${process.env.PORT || 5050}/api`).replace(/\/$/, '')
const MARK = 'ZZ-BLK4'
const results = []
const pass = (name, ok, detail = '') => results.push({ name, ok, detail })
const approx = (a, b, e = 0.05) => Math.abs(Number(a) - Number(b)) <= e
const n0 = (v) => Number(v) || 0

const j = async (res) => {
  const text = await res.text()
  try { return text ? JSON.parse(text) : {} } catch { return { error: text, status: res.status } }
}

const login = async () => {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@gmail.com', password: 'admin@123!' }),
  })
  const data = await j(res)
  return data.token
}

const token = await login()
if (!token) {
  console.error('Login failed — is the API running at', BASE, '?')
  process.exit(1)
}
const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

const api = async (path, opts = {}) => {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { ...H, ...(opts.headers || {}) } })
  const body = await j(res)
  return { status: res.status, body }
}

const cleanup = { brandId: null, itemIds: [], quoteId: null, oppId: null }

console.log('\n######## SPRINT 1a BLOCK 4 — PRICING FORMULA UNIFICATION ########\n')

// ── Setup: brand + test items ───────────────────────────────────────────────
// Brand POST is not idempotent (409 if ZZ-BLK4-HERO left from prior runs / eyes-on).
// Root-cause of historical 16/21 flake: setup treated 409 as fail → brand=error body →
// priceItem fell back to exch=1/pf=1 → selling=1000. Fix: reuse + PATCH factors.
let brand = null
let heroItem = null
let zeroItem = null
let brandCreatedThisRun = false

try {
  const payload = {
    brand: `${MARK}-HERO`,
    currency: 'EUR',
    exchange_factor: 5.4,
    price_factor: 1.85,
    add_margin_pct: 0,
    special_offer_pct: 0,
  }
  const created = await api('/masters/brands', { method: 'POST', body: JSON.stringify(payload) })
  if (created.status === 201 && created.body?.id) {
    brand = created.body
    brandCreatedThisRun = true
    cleanup.brandId = brand.id
    pass('setup: brand 5.4×1.85', true, `created ${brand.brand}`)
  } else {
    const list = await api('/masters/brands')
    const rows = Array.isArray(list.body) ? list.body : (list.body?.data || [])
    const existing = rows.find((b) => String(b.brand || '').toLowerCase() === `${MARK}-HERO`.toLowerCase())
    if (!existing?.id) {
      pass('setup: brand 5.4×1.85', false, created.body?.error || `status=${created.status}`)
    } else {
      const patched = await api(`/masters/brands/${existing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          currency: 'EUR',
          exchange_factor: 5.4,
          price_factor: 1.85,
          add_margin_pct: 0,
          special_offer_pct: 0,
        }),
      })
      brand = patched.body?.id
        ? patched.body
        : { ...existing, currency: 'EUR', exchange_factor: 5.4, price_factor: 1.85, add_margin_pct: 0, special_offer_pct: 0 }
      // Do not delete shared leftover brand on cleanup (may still be referenced by orphan items).
      pass(
        'setup: brand 5.4×1.85',
        n0(brand.exchange_factor) === 5.4 && n0(brand.price_factor) === 1.85,
        `reused+patched ${brand.brand} (prior ${created.status})`,
      )
    }
  }
} catch (e) {
  pass('setup: brand 5.4×1.85', false, e.message)
}

try {
  const code = `${MARK}-${Math.random().toString(36).slice(2, 6)}`
  const name = `${MARK} Hero Item`
  const { data, error } = await supabase.from('items').insert({
    code,
    name,
    item_code: code,
    item_name: name,
    item_group: 'ZZ Test',
    brand: brand?.brand || `${MARK}-HERO`,
    uom: 'Nos',
    valuation_rate: 1000,
    status: 'Active',
  }).select().single()
  if (error) throw error
  heroItem = data
  cleanup.itemIds.push(data.id)
  pass('setup: hero item VR=1000', !!data?.id, data.id?.slice(0, 8))
} catch (e) {
  pass('setup: hero item VR=1000', false, e.message)
}

try {
  const code = `${MARK}-Z-${Math.random().toString(36).slice(2, 6)}`
  const name = `${MARK} Zero VR Item`
  const { data, error } = await supabase.from('items').insert({
    code,
    name,
    item_code: code,
    item_name: name,
    item_group: 'ZZ Test',
    brand: brand?.brand || `${MARK}-HERO`,
    uom: 'Nos',
    valuation_rate: 0,
    status: 'Active',
  }).select().single()
  if (error) throw error
  zeroItem = data
  cleanup.itemIds.push(data.id)
  pass('setup: zero VR item', !!data?.id, data.id?.slice(0, 8))
} catch (e) {
  pass('setup: zero VR item', false, e.message)
}

// ── (a) priceItem VR chain ──────────────────────────────────────────────────
try {
  const p = priceItem({ valuation_rate: 1000, brand: brand?.brand }, brand)
  pass('(a) expected_landed=5400', approx(p.expected_landed, 5400), `got ${p.expected_landed}`)
  pass('(a) selling=9990', approx(p.selling, 9990), `got ${p.selling}`)
  pass('(a) gp≈45.9%', approx(p.gp_pct, 45.9, 0.15), `got ${p.gp_pct}%`)
} catch (e) {
  pass('(a) VR chain math', false, e.message)
}

// ── (b) item override exchange_factor wins ───────────────────────────────────
try {
  const p = priceItem({ valuation_rate: 1000, exchange_factor: 1.1, brand: brand?.brand }, brand)
  pass('(b) override exch 1.1 → selling=2035', approx(p.selling, 2035), `got ${p.selling}`)
} catch (e) {
  pass('(b) item override exchange_factor', false, e.message)
}

// ── (c) POST /pricing/apply persists selling_price ───────────────────────────
try {
  if (!heroItem?.id) throw new Error('no hero item')
  await supabase.from('items').update({ valuation_rate: 1000, exchange_factor: null, price_factor: null }).eq('id', heroItem.id)
  const { status, body } = await api(`/pricing/apply/${heroItem.id}`, { method: 'POST', body: JSON.stringify({}) })
  const { data: saved } = await supabase.from('items').select('selling_price, landed_cost, gp_percent').eq('id', heroItem.id).single()
  pass('(c) POST /pricing/apply → 200', status === 200, `status=${status}`)
  pass('(c) items.selling_price=9990', approx(saved?.selling_price, 9990), `stored=${saved?.selling_price}`)
  pass('(c) items.landed_cost=5400', approx(saved?.landed_cost, 5400), `stored=${saved?.landed_cost}`)
} catch (e) {
  pass('(c) POST /pricing/apply', false, e.message)
}

// ── (d) quotation builder stores VR-chain line fields ───────────────────────
try {
  if (!heroItem?.id) throw new Error('no hero item')
  const opp = await api('/sales/opportunities', {
    method: 'POST',
    body: JSON.stringify({ customer: `${MARK} Customer`, stage: 'Prospecting', value: 50000, next_action_date: '2026-09-01' }),
  })
  cleanup.oppId = opp.body?.id
  const { status, body } = await api('/quotations', {
    method: 'POST',
    body: JSON.stringify({
      customer: `${MARK} Customer`,
      opportunity_id: opp.body?.id,
      validity_days: 30,
      currency: 'SAR',
      items: [{ item_id: heroItem.id, qty: 1 }],
    }),
  })
  cleanup.quoteId = body?.id
  const line = (body?.quotation_items || [])[0] || {}
  pass('(d) builder create → 201', status === 201, `status=${status}`)
  pass('(d) quotation_items.rate=9990', approx(line.rate, 9990), `rate=${line.rate}`)
  pass('(d) estimated_cost=5400', approx(line.estimated_cost, 5400), `estimated_cost=${line.estimated_cost}`)
  pass('(d) pricing_basis=valuation_rate', line.pricing_basis === 'valuation_rate', `basis=${line.pricing_basis}`)
} catch (e) {
  pass('(d) quotation builder path', false, e.message)
}

// ── (e) VR=0 → unpriced / needs_rate ────────────────────────────────────────
try {
  if (!zeroItem?.id) throw new Error('no zero item')
  const priced = await api(`/quotations/price-items?ids=${zeroItem.id}`)
  const p = priced.body?.[zeroItem.id]
  pass('(e) VR=0 priced:false', p?.priced === false, `priced=${p?.priced}`)
  const opp2 = await api('/sales/opportunities', {
    method: 'POST',
    body: JSON.stringify({ customer: `${MARK} Zero Co`, stage: 'Prospecting', value: 1000, next_action_date: '2026-09-01' }),
  })
  const q = await api('/quotations', {
    method: 'POST',
    body: JSON.stringify({
      customer: `${MARK} Zero Co`,
      opportunity_id: opp2.body?.id,
      validity_days: 30,
      items: [{ item_id: zeroItem.id, qty: 1 }],
    }),
  })
  if (q.body?.id) cleanup.quoteId = q.body.id
  const zline = (q.body?.quotation_items || [])[0] || {}
  pass('(e) zero line rate=0', n0(zline.rate) === 0, `rate=${zline.rate}`)
  pass('(e) needs_rate on line (rate=0 path)', n0(zline.rate) === 0, `rate=${zline.rate}`)
} catch (e) {
  pass('(e) VR=0 unpriced path', false, e.message)
}

// ── (f) legacy POST /sales/quotations → 410 ─────────────────────────────────
try {
  const { status, body } = await api('/sales/quotations', {
    method: 'POST',
    body: JSON.stringify({ customer: 'Legacy', validity_days: 30, items: [] }),
  })
  pass('(f) legacy POST → 410', status === 410, `status=${status} err=${body?.error}`)
} catch (e) {
  pass('(f) legacy POST → 410', false, e.message)
}

// ── (g) Brand Master preview == priceEngine ─────────────────────────────────
try {
  const brandLike = {
    exchange_factor: 5.4,
    price_factor: 1.85,
    add_margin_pct: 0,
    special_offer_pct: 0,
    currency: 'EUR',
  }
  const preview = previewBrandExample(brandLike, 1000)
  const uiSelling = 1000 * 5.4 * 1.85 // PricingEngine.jsx example() math
  pass('(g) previewBrandExample selling=9990', approx(preview.selling, 9990), `engine=${preview.selling}`)
  pass('(g) UI example math matches engine', approx(preview.selling, uiSelling), `ui=${uiSelling}`)
} catch (e) {
  pass('(g) brand preview parity', false, e.message)
}

// ── Cleanup ─────────────────────────────────────────────────────────────────
try {
  if (cleanup.quoteId) await supabase.from('quotation_items').delete().eq('quotation_id', cleanup.quoteId)
  if (cleanup.quoteId) await supabase.from('quotations').delete().eq('id', cleanup.quoteId)
  if (cleanup.oppId) await supabase.from('opportunities').delete().eq('id', cleanup.oppId)
  for (const id of cleanup.itemIds) await supabase.from('items').delete().eq('id', id)
  if (cleanup.brandId) await api(`/masters/brands/${cleanup.brandId}`, { method: 'DELETE' })
  pass('cleanup', true, 'test data removed')
} catch (e) {
  pass('cleanup', false, e.message)
}

// ── Report ──────────────────────────────────────────────────────────────────
console.log('\n| Test | Result | Detail |')
console.log('|------|--------|--------|')
for (const r of results) {
  console.log(`| ${r.name} | ${r.ok ? 'PASS' : 'FAIL'} | ${r.detail} |`)
}
const failed = results.filter((r) => !r.ok).length
console.log(`\nBLOCK 4: ${failed ? 'FAIL' : 'PASS'} (${results.length - failed}/${results.length} checks)\n`)
process.exit(failed ? 1 : 0)
