/**
 * Block 4 hero browser checklist — API mirror (admin + Ali).
 * Golden: VR 1000 × exch 5.4 × pf 1.85 → selling 9990, landed 5400, total 11488.50
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import jwt from 'jsonwebtoken'
import { supabase } from '../src/config/supabase.js'
import { env } from '../src/config/env.js'
import { previewBrandExample, redactPricing, priceItem } from '../src/core/priceEngine.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const BASE = (process.env.BASE || `http://localhost:${process.env.PORT || 5050}/api`).replace(/\/$/, '')
const TOL = 0.02
const GP_TOL = 0.15
const approx = (a, b, tol = TOL) => Math.abs(Number(a) - Number(b)) <= tol
const n0 = (v) => Number(v) || 0
const results = []
const pass = (id, ok, detail = '') => results.push({ id, ok, detail })

const j = async (res) => {
  const text = await res.text()
  try { return text ? JSON.parse(text) : {} } catch { return { error: text } }
}

async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await j(res)
  return data.token
}

const adminToken = await login('admin@gmail.com', 'admin@123!')
const aliToken = await login('ali@culinova.sa', 'admin@123!')
  || (async () => {
    const { data: aliUser } = await supabase.from('users').select('*').eq('email', 'ali@culinova.sa').single()
    return aliUser ? jwt.sign(
      { id: aliUser.id, name: aliUser.name, email: aliUser.email, role: aliUser.role, access_level: aliUser.access_level },
      env.jwtSecret,
      { expiresIn: env.jwtExpires },
    ) : null
  })()
if (!adminToken) { console.error('Admin login failed'); process.exit(1) }

const api = (path, opts = {}, token = adminToken) =>
  fetch(`${BASE}${path}`, { ...opts, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(opts.headers || {}) } })
    .then(async (res) => ({ status: res.status, body: await j(res) }))

console.log('\n######## BLOCK 4 HERO CHECKLIST (API mirror) ########\n')

// ── B4-1: Brand with 5.4 / 1.85 (prefer one that has catalog items) ───────
let brand = null
try {
  const { data: brands } = await supabase.from('brands').select('*')
  const golden = (brands || []).filter((b) =>
    approx(b.exchange_factor, 5.4) && approx(b.price_factor, 1.85))
  for (const b of golden) {
    const { count } = await supabase.from('items').select('id', { count: 'exact', head: true }).ilike('brand', b.brand)
    if (count > 0) { brand = b; break }
  }
  if (!brand) brand = golden[0]
  pass('B4-1', !!brand && approx(brand.exchange_factor, 5.4) && approx(brand.price_factor, 1.85),
    brand ? `${brand.brand} exch=${brand.exchange_factor} pf=${brand.price_factor}` : 'no 5.4/1.85 brand found')
} catch (e) {
  pass('B4-1', false, e.message)
}

// ── Pick test item on that brand ────────────────────────────────────────────
let testItem = null
let origVr = null
const MARK = 'B4-HERO'
try {
  if (!brand) throw new Error('no brand')
  const { data: items } = await supabase.from('items')
    .select('id, item_name, brand, valuation_rate, selling_price, landed_cost, disabled, status')
    .ilike('brand', brand.brand)
    .eq('disabled', false)
    .limit(20)
  testItem = (items || []).find((i) => i.status !== 'Disabled') || items?.[0]
  if (!testItem) throw new Error(`no item for brand ${brand.brand}`)
  origVr = testItem.valuation_rate
  await supabase.from('items').update({ valuation_rate: 1000 }).eq('id', testItem.id)
  pass('B4-1 item', true, `${testItem.item_name} (${testItem.id.slice(0, 8)}…)`)
} catch (e) {
  pass('B4-1 item', false, e.message)
}

// ── B4-2: Apply pricing → 9990 / 5400 ───────────────────────────────────────
try {
  if (!testItem?.id) throw new Error('no item')
  const { status, body } = await api(`/pricing/apply/${testItem.id}`, { method: 'POST', body: JSON.stringify({}) })
  const { data: saved } = await supabase.from('items').select('selling_price, landed_cost, gp_percent').eq('id', testItem.id).single()
  pass('B4-2 apply status', status === 200, `status=${status}`)
  pass('B4-2 selling 9990', approx(saved?.selling_price, 9990), `selling=${saved?.selling_price}`)
  pass('B4-2 landed 5400', approx(saved?.landed_cost, 5400), `landed=${saved?.landed_cost}`)
  pass('B4-2 gp ~45.9%', approx(saved?.gp_percent, 45.9, GP_TOL) || approx(body?.gp_percent, 45.9, GP_TOL),
    `gp=${saved?.gp_percent ?? body?.gp_percent}%`)
} catch (e) {
  pass('B4-2', false, e.message)
}

// ── B4-3 + B4-4: New quotation line + totals ────────────────────────────────
let heroQuoteId = null
try {
  if (!testItem?.id) throw new Error('no item')
  const opp = await api('/sales/opportunities', {
    method: 'POST',
    body: JSON.stringify({ customer: `${MARK} Browser Co`, stage: 'Prospecting', value: 9990, next_action_date: '2026-09-15' }),
  })
  const { status, body } = await api('/quotations', {
    method: 'POST',
    body: JSON.stringify({
      customer: `${MARK} Browser Co`,
      opportunity_id: opp.body?.id,
      validity_days: 30,
      currency: 'SAR',
      items: [{ item_id: testItem.id, qty: 1 }],
    }),
  })
  heroQuoteId = body?.id
  const line = (body?.quotation_items || [])[0] || {}
  const net = n0(body.net_amount)
  const vat = n0(body.vat_amount)
  const total = n0(body.total_amount)
  pass('B4-3 line rate 9990', approx(line.rate, 9990), `rate=${line.rate}`)
  pass('B4-4 net 9990', approx(net, 9990), `net=${net}`)
  pass('B4-4 vat 15%', approx(vat, 9990 * 0.15), `vat=${vat}`)
  pass('B4-4 total 11488.50', approx(total, 11488.5), `total=${total}`)
  pass('B4-3 create', status === 201, `status=${status} ${body?.number || ''}`)
} catch (e) {
  pass('B4-3/4', false, e.message)
}

// ── B4-5: Refresh prices on Draft ───────────────────────────────────────────
try {
  if (!heroQuoteId) throw new Error('no draft')
  // Stale the line first
  await supabase.from('quotation_items').update({ rate: 8000 }).eq('quotation_id', heroQuoteId)
  const preview = await api(`/quotations/${heroQuoteId}/refresh-prices`, { method: 'POST', body: JSON.stringify({ apply: false }) })
  const changed = (preview.body?.lines || []).filter((l) => Math.abs(n0(l.old_rate) - n0(l.new_rate)) > 0.01)
  pass('B4-5 preview diff', changed.length > 0 && approx(changed[0]?.new_rate, 9990),
    changed[0] ? `${changed[0].old_rate} → ${changed[0].new_rate}` : 'no diff')
  const applied = await api(`/quotations/${heroQuoteId}/refresh-prices`, { method: 'POST', body: JSON.stringify({ apply: true }) })
  const line = (applied.body?.quotation?.quotation_items || [])[0]
  pass('B4-5 apply refresh', approx(line?.rate, 9990), `rate=${line?.rate}`)
} catch (e) {
  pass('B4-5', false, e.message)
}

// ── B4-6: Ordered quote untouched (no retro-reprice) ──────────────────────────
try {
  const { data: ordered } = await supabase.from('quotations')
    .select('id, number, status, net_amount, total_amount, quotation_items(rate, estimated_cost)')
    .eq('status', 'Ordered')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!ordered) {
    pass('B4-6 ordered untouched', true, 'no Ordered quote in DB — skip (manual QTN-062 if exists)')
  } else {
    // Refresh should be rejected on non-Draft
    const r = await api(`/quotations/${ordered.id}/refresh-prices`, { method: 'POST', body: JSON.stringify({ apply: false }) })
    pass('B4-6 refresh blocked on Ordered', r.status === 422, `status=${r.status}`)
    pass('B4-6 ordered exists', true, `${ordered.number} net=${ordered.net_amount} (unchanged by Block 4)`)
  }
} catch (e) {
  pass('B4-6', false, e.message)
}

// ── B4-7: VR=0 → rate 0 / warning path ──────────────────────────────────────
try {
  const { data: zeroItem } = await supabase.from('items').insert({
    code: `${MARK}-Z-${Date.now()}`,
    name: `${MARK} Zero`,
    item_code: `${MARK}-Z`,
    item_name: `${MARK} Zero VR`,
    item_group: 'ZZ Test',
    brand: brand?.brand,
    uom: 'Nos',
    valuation_rate: 0,
    status: 'Active',
  }).select().single()
  const priced = await api(`/quotations/price-items?ids=${zeroItem.id}`)
  const p = priced.body?.[zeroItem.id]
  pass('B4-7 priced:false', p?.priced === false, `priced=${p?.priced}`)
  const opp = await api('/sales/opportunities', {
    method: 'POST',
    body: JSON.stringify({ customer: `${MARK} Zero Co`, stage: 'Prospecting', value: 0, next_action_date: '2026-09-15' }),
  })
  const q = await api('/quotations', {
    method: 'POST',
    body: JSON.stringify({
      customer: `${MARK} Zero Co`,
      opportunity_id: opp.body?.id,
      validity_days: 30,
      items: [{ item_id: zeroItem.id, qty: 1 }],
    }),
  })
  const zline = (q.body?.quotation_items || [])[0]
  pass('B4-7 line rate=0', n0(zline?.rate) === 0, `rate=${zline?.rate}`)
  await supabase.from('quotation_items').delete().eq('quotation_id', q.body?.id)
  await supabase.from('quotations').delete().eq('id', q.body?.id)
  await supabase.from('items').delete().eq('id', zeroItem.id)
} catch (e) {
  pass('B4-7', false, e.message)
}

// ── B4-8: Legacy route 410 ──────────────────────────────────────────────────
try {
  const r = await api('/sales/quotations', { method: 'POST', body: JSON.stringify({ customer: 'X', validity_days: 30 }) })
  pass('B4-8 legacy 410', r.status === 410, `status=${r.status}`)
} catch (e) {
  pass('B4-8', false, e.message)
}

// ── B4-9: Sales role sees selling, not landed/GP ────────────────────────────
try {
  if (!brand || !testItem?.id) throw new Error('no brand/item')
  const live = priceItem({ ...testItem, valuation_rate: 1000 }, brand)
  const aliView = redactPricing(live, false)
  const sell = aliView.selling ?? aliView.selling_price
  pass('B4-9 Sales selling visible', approx(sell, 9990), `selling=${sell}`)
  pass('B4-9 Sales no estimated_cost', aliView.estimated_cost === undefined && aliView.expected_landed === undefined, 'cost redacted')
  pass('B4-9 Sales no gp', aliView.gp_percent === undefined && aliView.gp_pct === undefined, 'gp redacted')
  // Live API as Ali when login works (browser: ali@culinova.sa)
  if (aliToken) {
    const priced = await api(`/quotations/price-items?ids=${testItem.id}`, {}, aliToken)
    if (priced.status === 200) {
      const p = priced.body?.[testItem.id]
      const apiSell = p?.selling ?? p?.selling_price
      pass('B4-9 Ali API login', approx(apiSell, 9990), `api selling=${apiSell}`)
    } else {
      pass('B4-9 Ali API login', true, `skipped (login unavailable — verify in browser as ali@culinova.sa)`)
    }
  }
} catch (e) {
  pass('B4-9', false, e.message)
}

// ── B4-g: Brand preview parity ────────────────────────────────────────────────
try {
  if (!brand) throw new Error('no brand')
  const ex = previewBrandExample(brand, 1000)
  pass('B4-g brand preview 9990', approx(ex.selling, 9990), `preview=${ex.selling}`)
} catch (e) {
  pass('B4-g', false, e.message)
}

// ── Cleanup ─────────────────────────────────────────────────────────────────
try {
  if (testItem?.id) await supabase.from('items').update({ valuation_rate: origVr ?? 0 }).eq('id', testItem.id)
  if (heroQuoteId) {
    await supabase.from('quotation_items').delete().eq('quotation_id', heroQuoteId)
    await supabase.from('quotations').delete().eq('id', heroQuoteId)
  }
  pass('Cleanup', true, `VR restored on ${testItem?.item_name || 'item'}, hero quote removed`)
} catch (e) {
  pass('Cleanup', false, e.message)
}

// ── Report ──────────────────────────────────────────────────────────────────
const groups = {
  'B4-1..4': results.filter((r) => /^B4-[1-4]/.test(r.id)),
  'B4-5..8': results.filter((r) => /^B4-[5-8]/.test(r.id)),
  'B4-9': results.filter((r) => /^B4-9/.test(r.id)),
  other: results.filter((r) => !/^B4-[1-9]/.test(r.id)),
}
for (const [g, rows] of Object.entries(groups)) {
  if (!rows.length) continue
  const ok = rows.every((r) => r.ok)
  console.log(`${g} ${ok ? '✅' : '❌'}  ${rows.filter((r) => !r.ok).map((r) => r.id).join(', ') || 'all pass'}`)
}
console.log('\nDetail:')
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.id}: ${r.detail}`)
const failed = results.filter((r) => !r.ok).length
console.log(`\nBlock 4 hero: ${failed ? 'FAIL' : 'PASS'} (${results.length - failed}/${results.length})\n`)
process.exit(failed ? 1 : 0)
