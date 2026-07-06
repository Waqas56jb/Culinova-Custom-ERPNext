// COMPREHENSIVE end-to-end verification of every fixed point. Self-cleaning.
// Usage: BASE=https://culinova-backend.vercel.app/api node scripts/full_verify.mjs
//        (defaults to local http://localhost:5050/api)
import { supabase } from '../src/config/supabase.js'
const BASE = process.env.BASE || 'http://localhost:5050/api'
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
const H = (t) => ({ authorization: `Bearer ${t}`, 'content-type': 'application/json' })
const login = async (e, p) => { const d = await j(await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: e, password: p }) })); return d.token }
let pass = 0, fail = 0; const fails = []
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m) } else { fail++; fails.push(m); console.log('  ✗ FAIL:', m) } }
const section = (s) => console.log(`\n── ${s} ──`)
const MARK = 'ZZVERIFY'

console.log(`\n########  VERIFYING: ${BASE}  ########`)

// ---------- AUTH ----------
section('AUTH & SESSION')
const A = await login('admin@gmail.com', 'admin@123!')
ok(!!A, 'admin login works')
const badLogin = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@gmail.com', password: 'wrong' }) })
ok(badLogin.status === 401, 'wrong password rejected (401)')
// ensure a Sales User exists
let S = await login('sales.verify@culinova.local', 'sales@123!')
let salesCreated = false
if (!S) { await fetch(`${BASE}/users`, { method: 'POST', headers: H(A), body: JSON.stringify({ name: 'Sales Verify', email: 'sales.verify@culinova.local', password: 'sales@123!', role: 'Sales User', access_level: 'Create', department: 'Sales' }) }).then(j); S = await login('sales.verify@culinova.local', 'sales@123!'); salesCreated = true }
ok(!!S, 'sales user login works')

// ---------- PASSWORD RESET SECURITY ----------
section('PASSWORD RESET (admin takeover blocked)')
const rpAdmin = await fetch(`${BASE}/auth/reset-password`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@gmail.com', newPassword: 'hacked123' }) })
ok(rpAdmin.status === 403, `anon reset of admin blocked (${rpAdmin.status})`)
ok(!!(await login('admin@gmail.com', 'admin@123!')), 'admin password still intact after attack')

// ---------- ITEM MASTER: create / pricing / edit-recompute ----------
section('ITEM MASTER — create, pricing chain, edit recompute')
const mk = (o) => fetch(`${BASE}/items`, { method: 'POST', headers: H(A), body: JSON.stringify(o) }).then(j)
const c1 = await mk({ item_name: `${MARK} Range`, brand: 'Fagor', model: `${MARK}-1`, product_family: `${MARK} Family`, supplier_price: 1000, exchange_factor: 5, price_factor: 2, add_margin_pct: 0, special_offer_pct: 0, stock_uom: 'Nos' })
ok(c1.landed_cost === 5000 && c1.calculated_sale_price === 10000 && c1.selling_price === 10000, `create pricing: landed ${c1.landed_cost}, calc ${c1.calculated_sale_price}, selling ${c1.selling_price}`)
const e1 = await fetch(`${BASE}/items/${c1.id}`, { method: 'PATCH', headers: H(A), body: JSON.stringify({ supplier_price: 2000 }) }).then(j)
ok(e1.selling_price === 20000 && e1.landed_cost === 10000, `edit supplier 2000 -> recompute selling ${e1.selling_price}, landed ${e1.landed_cost}`)
const e2 = await fetch(`${BASE}/items/${c1.id}`, { method: 'PATCH', headers: H(A), body: JSON.stringify({ add_margin_pct: 10, special_offer_pct: 5 }) }).then(j)
// 10000 landed *2 =20000 calc *1.1 *0.95 = 20900
ok(Math.abs(e2.selling_price - 20900) < 1, `edit margin10/offer5 -> selling ${e2.selling_price} (exp 20900)`)

section('ITEM MASTER — blank-numeric safety + brand-factor fallback')
const c2 = await mk({ item_name: `${MARK} Blank`, brand: 'Fagor', model: `${MARK}-2`, product_family: `${MARK} Family`, supplier_price: 1000, exchange_factor: '', price_factor: '', add_margin_pct: '', special_offer_pct: '', avg_cost: '', max_discount: '', stock_uom: 'Nos' })
ok(c2.error == null, `create with blank numerics does not crash (${c2.error || 'ok'})`)
ok(c2.landed_cost === 5400 && Math.abs(c2.calculated_sale_price - 9990) < 1, `blank factors use brand (Fagor 5.4/1.85): landed ${c2.landed_cost}, calc ${c2.calculated_sale_price}`)

section('ITEM MASTER — duplicate prevention')
const dup = await mk({ item_name: 'dup', brand: 'Fagor', model: `${MARK}-1`, product_family: 'x', stock_uom: 'Nos' })
ok(dup.error && /exist/i.test(dup.error), `duplicate brand+model blocked (${dup.error})`)

section('ITEM MASTER — cost redaction for Sales (item + child tables)')
const sView = await fetch(`${BASE}/items/${c1.id}`, { headers: H(S) }).then(j)
for (const f of ['cost', 'supplier_price', 'landed_cost', 'gp_percent', 'avg_cost', 'price_factor', 'exchange_factor', 'add_margin_pct', 'special_offer_pct', 'calculated_sale_price', 'valuation_rate', 'last_purchase_rate']) ok(sView[f] == null, `sales cannot see ${f}`)
ok(sView.selling_price != null, `sales CAN see selling_price (${sView.selling_price})`)
ok(!(sView.prices || []).some((p) => p.buying || p.selling === false), 'sales sees no buying price rows')
ok((sView.item_defaults || []).length === 0, 'sales sees no item_defaults (accounts)')

section('ITEM MASTER — product comparison (alternatives via family)')
const alt = await fetch(`${BASE}/items/${c1.id}/alternatives`, { headers: H(A) }).then(j)
ok(Array.isArray(alt) && alt.some((x) => x.model === `${MARK}-2`), `alternatives returns same-family item (${Array.isArray(alt) ? alt.length : 'n/a'})`)

section('ITEM MASTER — CEO-header import + product family auto-create')
const imp = await fetch(`${BASE}/items/import`, { method: 'POST', headers: H(A), body: JSON.stringify({ rows: [{
  'Item Group': 'Cooking', 'sub Item Group': 'Ranges', 'Product family': `${MARK} ImpFam`, 'Brand': 'Fagor', 'Model No.': `${MARK}-IMP`,
  'Model Name': `${MARK} Imported Range`, 'Dimensions': '900x700', 'Power type': 'Gas', 'country of origin': 'Spain', 'Currency': 'EUR',
  'Supplier Net Price': 1000, 'Exchange Factor': 5, 'Price Factor': 1.75, 'Add Margin %': 3, 'Stock Item': 'Yes', 'Status': 'Active', 'Show Room': 'checked' }] }) }).then(j)
ok(imp.created === 1 && imp.failed === 0, `import created ${imp.created} failed ${imp.failed}`)
const fams = await fetch(`${BASE}/masters/product-families`, { headers: H(A) }).then(j)
ok((fams || []).some((f) => f.name === `${MARK} ImpFam`), 'product family auto-created on import')

// ---------- MASTERS ----------
section('MASTERS — brand countries + 177 CEO brands present')
const br = await fetch(`${BASE}/masters/brands`, { method: 'POST', headers: H(A), body: JSON.stringify({ brand: `${MARK}Brand`, currency: 'EUR', exchange_factor: 5, price_factor: 1.75, country_of_origin: 'Italy', country_of_purchase: 'KSA' }) }).then(j)
const brands = await fetch(`${BASE}/masters/brands`, { headers: H(A) }).then(j)
const brRec = (brands || []).find((b) => b.brand === `${MARK}Brand`)
ok(brRec && brRec.country_of_origin === 'Italy' && brRec.country_of_purchase === 'KSA', 'brand stores country of origin + purchase')
ok((brands || []).length >= 170, `brand library populated (${(brands || []).length} brands)`)

// ---------- SALES SECURITY ----------
section('SALES SECURITY — accept lock + read-only sales_orders + mass-assignment')
const accS = await fetch(`${BASE}/sales/quotations/00000000-0000-0000-0000-000000000000/accept`, { method: 'POST', headers: H(S) })
ok(accS.status === 403, `salesperson accept blocked (${accS.status})`)
const soPost = await fetch(`${BASE}/sales-orders`, { method: 'POST', headers: H(S), body: JSON.stringify({ customer: 'HACK', amount: 999999 }) })
ok(soPost.status === 404 || soPost.status === 405, `POST /sales-orders blocked as read-only (${soPost.status})`)
const soGet = await fetch(`${BASE}/sales-orders`, { headers: H(S) })
ok(soGet.status === 200, `GET /sales-orders still allowed (${soGet.status})`)
const pjForge = await fetch(`${BASE}/projects`, { method: 'POST', headers: H(A), body: JSON.stringify({ name: `${MARK} Proj`, number: 'FORGED-X', customer: 'T' }) }).then(j)
ok(pjForge.number !== 'FORGED-X', `forged 'number' stripped on create (${pjForge.number})`)

// ---------- PORTAL SECURITY ----------
section('PORTAL SECURITY — customer redaction + name-change block')
await fetch(`${BASE}/auth/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `${MARK} Customer`, email: 'cust.verify@culinova.local', password: 'cust@123!', role: 'Customer' }) }).then(j)
const CUS = await login('cust.verify@culinova.local', 'cust@123!')
ok(!!CUS, 'customer signup + login works')
if (CUS) {
  const ov = await fetch(`${BASE}/portal/customer/overview`, { headers: H(CUS) }).then(j)
  ok(ov && Array.isArray(ov.quotations), 'customer overview returns quotations array')
  const anyCostLeak = (ov.quotations || []).some((q) => q.cost_amount != null || q.gp_percent != null || (q.quotation_items || []).some((i) => i.cost != null || i.supplier_price != null))
  ok(!anyCostLeak, 'customer sees NO cost/GP/supplier price (even nested)')
  const rn = await fetch(`${BASE}/users/me`, { method: 'PATCH', headers: H(CUS), body: JSON.stringify({ name: 'System Administrator' }) })
  ok(rn.status === 403, `customer cannot rename into another account (${rn.status})`)
}

// ---------- INVENTORY RPC (shared Supabase) ----------
section('INVENTORY — atomic reserve/release RPC')
const anItem = (await supabase.from('items').select('id').ilike('model', `${MARK}-1`).maybeSingle()).data
if (anItem) {
  await supabase.rpc('reserve_stock', { p_item_id: anItem.id, p_warehouse: 'ZZWH', p_qty: 4 })
  let b = (await supabase.from('stock_balances').select('reserved').eq('item_id', anItem.id).eq('warehouse', 'ZZWH').maybeSingle()).data
  ok(b && Number(b.reserved) === 4, `reserve_stock atomic add (${b?.reserved})`)
  await supabase.rpc('release_stock', { p_item_id: anItem.id, p_warehouse: 'ZZWH', p_qty: 999 })
  b = (await supabase.from('stock_balances').select('reserved').eq('item_id', anItem.id).eq('warehouse', 'ZZWH').maybeSingle()).data
  ok(b && Number(b.reserved) === 0, `release_stock floors at 0 (${b?.reserved})`)
  await supabase.from('stock_balances').delete().eq('item_id', anItem.id).eq('warehouse', 'ZZWH')
}

// ---------- CLEANUP ----------
section('CLEANUP')
const allItems = await fetch(`${BASE}/items`, { headers: H(A) }).then(j)
const items = Array.isArray(allItems) ? allItems : (allItems.items || allItems.data || [])
let cleaned = 0
for (const it of items) { if ((it.item_name || '').includes(MARK) || (it.model || '').includes(MARK) || (it.brand === `${MARK}Brand`)) { await fetch(`${BASE}/items/${it.id}`, { method: 'DELETE', headers: H(A) }).then(j); cleaned++ } }
for (const f of (await fetch(`${BASE}/masters/product-families`, { headers: H(A) }).then(j)) || []) if ((f.name || '').includes(MARK)) await fetch(`${BASE}/masters/product-families/${f.id}`, { method: 'DELETE', headers: H(A) }).then(j).catch(() => {})
if (brRec) await fetch(`${BASE}/masters/brands/${brRec.id}`, { method: 'DELETE', headers: H(A) }).then(j).catch(() => {})
const projs = await fetch(`${BASE}/projects`, { headers: H(A) }).then(j)
for (const p of (Array.isArray(projs) ? projs : []) ) if ((p.name || '').includes(MARK)) await fetch(`${BASE}/projects/${p.id}`, { method: 'DELETE', headers: H(A) }).then(j).catch(() => {})
// delete verify users
for (const email of ['cust.verify@culinova.local', salesCreated ? 'sales.verify@culinova.local' : null].filter(Boolean)) {
  const u = (await supabase.from('users').select('id').eq('email', email).maybeSingle()).data
  if (u) await supabase.from('users').delete().eq('id', u.id)
}
console.log(`  cleaned ${cleaned} test items + masters + verify users`)

// verify no residue
const after = await fetch(`${BASE}/items`, { headers: H(A) }).then(j)
const arr = Array.isArray(after) ? after : (after.items || after.data || [])
ok(!arr.some((x) => (x.item_name || '').includes(MARK) || (x.model || '').includes(MARK)), 'no test-item residue left')

console.log(`\n########  ${BASE}\n########  RESULT: ${pass} passed, ${fail} failed  ########`)
if (fail) { console.log('FAILURES:'); fails.forEach((f) => console.log('  -', f)) }
process.exit(fail ? 1 : 0)
