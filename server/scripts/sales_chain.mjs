// Full business flow: quotation (by sales) → customer sees it (no cost) → customer ACCEPTS →
// auto Sales Order + Project + BOQ. Verifies the salesperson-can't-accept rule too. Self-cleaning.
import { supabase } from '../src/config/supabase.js'
const BASE = process.env.BASE || 'http://localhost:5050/api'
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
const H = (t) => ({ authorization: `Bearer ${t}`, 'content-type': 'application/json' })
const login = async (e, p) => (await j(await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: e, password: p }) }))).token
let pass = 0, fail = 0; const ok = (c, m) => { c ? (pass++, console.log('  ✓', m)) : (fail++, console.log('  ✗ FAIL:', m)) }
const MARK = 'ZZCHAIN'
const CUSTOMER = `${MARK} Buyer`

console.log(`\n######## SALES CHAIN: ${BASE} ########\n`)
const A = await login('admin@gmail.com', 'admin@123!')

// sales + customer users
let S = await login('sales.chain@culinova.local', 'sales@123!')
if (!S) { await fetch(`${BASE}/users`, { method: 'POST', headers: H(A), body: JSON.stringify({ name: 'Sales Chain', email: 'sales.chain@culinova.local', password: 'sales@123!', role: 'Sales User', access_level: 'Create', department: 'Sales' }) }).then(j); S = await login('sales.chain@culinova.local', 'sales@123!') }
await fetch(`${BASE}/auth/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: CUSTOMER, email: 'buyer.chain@culinova.local', password: 'buy@123!', role: 'Customer' }) }).then(j)
const C = await login('buyer.chain@culinova.local', 'buy@123!')
ok(!!S && !!C, 'sales + customer users ready')

// 1) sales creates a quotation (0 discount, no approval needed)
const quote = await fetch(`${BASE}/sales/quotations`, { method: 'POST', headers: H(S), body: JSON.stringify({
  customer: CUSTOMER, contact_person: 'Mr Buyer', project_name: `${MARK} Kitchen`, project_location: 'Riyadh',
  validity_days: 30, payment_terms: '50% advance', discount_pct: 0,
  items: [{ item_name: `${MARK} Oven`, qty: 2, rate: 5000 }, { item_name: `${MARK} Fryer`, qty: 1, rate: 3000 }],
}) }).then(j)
ok(quote.id && quote.number, `quotation created (${quote.number})`)
ok(quote.cost_amount == null && quote.gp_percent == null, 'sales response hides cost/GP')

// 2) sales lists → still no cost leak (nested)
const sList = await fetch(`${BASE}/sales/quotations/${quote.id}`, { headers: H(S) }).then(j)
const leak = sList.cost_amount != null || sList.gp_percent != null || (sList.quotation_items || []).some((i) => i.cost != null)
ok(!leak, 'sales GET quotation: no cost/GP even in line items')

// 3) customer sees it in their portal — and NO cost
const ov = await fetch(`${BASE}/portal/customer/overview`, { headers: H(C) }).then(j)
const mine = (ov.quotations || []).find((q) => q.id === quote.id)
ok(!!mine, 'customer sees their quotation in portal')
ok(mine && mine.cost_amount == null && mine.gp_percent == null && !(mine.quotation_items || []).some((i) => i.cost != null), 'customer sees NO cost/GP (top + line items)')

// 4) salesperson must NOT be able to accept
const salesAccept = await fetch(`${BASE}/sales/quotations/${quote.id}/accept`, { method: 'POST', headers: H(S) })
ok(salesAccept.status === 403, `salesperson accept blocked (${salesAccept.status})`)

// 5) CUSTOMER accepts → SO + Project + BOQ
const accept = await fetch(`${BASE}/portal/customer/quotations/${quote.id}/accept`, { method: 'POST', headers: H(C) }).then(j)
ok(accept.ok && accept.sales_order, `customer accepted → Sales Order ${accept.sales_order}`)

// 6) verify the chain persisted
const q2 = (await supabase.from('quotations').select('status').eq('id', quote.id).maybeSingle()).data
ok(q2 && q2.status === 'Ordered', `quotation marked Ordered (${q2?.status})`)
const so = (await supabase.from('sales_orders').select('id, project_id').eq('quotation_id', quote.id).maybeSingle()).data
ok(!!so, 'sales_order row exists')
const proj = so?.project_id ? (await supabase.from('projects').select('id, name, customer').eq('id', so.project_id).maybeSingle()).data : null
ok(proj && proj.customer === CUSTOMER, `project auto-created for customer (${proj?.name})`)
const boq = proj ? (await supabase.from('project_boq').select('id').eq('project_id', proj.id)).data : []
ok((boq || []).length === 2, `BOQ seeded from quotation lines (${(boq || []).length} items)`)

// 7) customer cannot double-accept
const dbl = await fetch(`${BASE}/portal/customer/quotations/${quote.id}/accept`, { method: 'POST', headers: H(C) })
ok(dbl.status === 422, `double-accept blocked (${dbl.status})`)

// ---- CLEANUP ----
console.log('\n── cleanup ──')
if (proj) { await supabase.from('project_boq').delete().eq('project_id', proj.id); await supabase.from('stock_reservations').delete().eq('project_id', proj.id); await supabase.from('projects').delete().eq('id', proj.id) }
if (so) await supabase.from('sales_orders').delete().eq('id', so.id)
await supabase.from('quotation_items').delete().eq('quotation_id', quote.id)
await supabase.from('quotations').delete().eq('id', quote.id)
await supabase.from('opportunities').delete().ilike('customer', CUSTOMER)
await supabase.from('leads').delete().ilike('customer', CUSTOMER)
await supabase.from('messages').delete().ilike('customer_name', CUSTOMER)
for (const email of ['buyer.chain@culinova.local', 'sales.chain@culinova.local']) { const u = (await supabase.from('users').select('id').eq('email', email).maybeSingle()).data; if (u) await supabase.from('users').delete().eq('id', u.id) }
console.log('  cleaned quotation + SO + project + BOQ + users')

console.log(`\n######## SALES CHAIN RESULT: ${pass} passed, ${fail} failed ########`)
process.exit(fail ? 1 : 0)
