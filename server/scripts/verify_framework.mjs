// Consolidated end-to-end verification of the EOS-independent ERP framework modules. Self-cleaning.
import { supabase } from '../src/config/supabase.js'
const BASE = process.env.BASE || 'http://localhost:5050/api'
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return {} } }
const H = (t) => ({ authorization: `Bearer ${t}`, 'content-type': 'application/json' })
const login = async (e, p) => { try { return (await j(await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: e, password: p }) }))).token } catch { return null } }
let pass = 0, fail = 0; const fails = []
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m) } else { fail++; fails.push(m); console.log('  ✗ FAIL:', m) } }
const S_ = (s) => console.log(`\n── ${s} ──`)

console.log(`\n######## FRAMEWORK VERIFY: ${BASE} ########`)
const A = await login('admin@gmail.com', 'admin@123!')
const S = await login('sales.test@culinova.local', 'sales@123!')
ok(!!A, 'admin login')

S_('Company Settings')
for (const e of ['companies', 'branches', 'departments', 'currencies', 'vat-settings', 'numbering-series']) ok(Array.isArray(await fetch(`${BASE}/settings/${e}`, { headers: H(A) }).then(j)), `settings/${e}`)
const n1 = await fetch(`${BASE}/settings/numbering-series/Invoice/next`, { method: 'POST', headers: H(A) }).then(j)
ok(n1.number?.startsWith('INV-'), `numbering next ${n1.number}`)
if (S) ok((await fetch(`${BASE}/settings/branches`, { method: 'POST', headers: H(S), body: JSON.stringify({ name: 'x' }) })).status === 403, 'RBAC: sales cannot write settings')

S_('Global Search')
const sr = await fetch(`${BASE}/search?q=cul`, { headers: H(A) }).then(j)
ok(Array.isArray(sr.results), `search returns ${sr.results?.length} results`)

S_('Admin (audit / rbac / approvals)')
ok(Array.isArray(await fetch(`${BASE}/admin/audit`, { headers: H(A) }).then(j)), 'audit trail')
const rbac = await fetch(`${BASE}/admin/rbac`, { headers: H(A) }).then(j)
ok(rbac.rolePanels && rbac.levelActions, 'rbac matrix')
const ap = await fetch(`${BASE}/admin/approvals`, { method: 'POST', headers: H(A), body: JSON.stringify({ entity_type: 'test', title: 'ZZ verify' }) }).then(j)
ok(ap.id, 'create approval')
ok((await fetch(`${BASE}/admin/approvals/${ap.id}/decide`, { method: 'POST', headers: H(A), body: JSON.stringify({ decision: 'approved' }) }).then(j)).status === 'approved', 'approve')
if (S) ok((await fetch(`${BASE}/admin/audit`, { headers: H(S) })).status === 403, 'RBAC: sales cannot view audit')

S_('Customer / Supplier enrichment')
const cus = await fetch(`${BASE}/customers`, { method: 'POST', headers: H(A), body: JSON.stringify({ name: 'ZZ Verify Co', category: 'Hotel' }) }).then(j)
ok(cus.id, 'create customer')
await fetch(`${BASE}/customers/${cus.id}/contacts`, { method: 'POST', headers: H(A), body: JSON.stringify({ name: 'Mr X', is_primary: true }) }).then(j)
await fetch(`${BASE}/customers/${cus.id}/addresses`, { method: 'POST', headers: H(A), body: JSON.stringify({ label: 'HQ', city: 'Riyadh' }) }).then(j)
const cdet = await fetch(`${BASE}/customers/${cus.id}`, { headers: H(A) }).then(j)
ok(cdet.contacts.length === 1 && cdet.addresses.length === 1, 'customer detail with children')
ok((await fetch(`${BASE}/party-categories?party=customer`, { headers: H(A) }).then(j)).length >= 5, 'party categories')

S_('Warehouse ops')
for (const e of ['warehouse-locations', 'stock-categories', 'stock-transfers', 'stock-adjustments', 'stock-ledger']) ok(Array.isArray(await fetch(`${BASE}/${e}`, { headers: H(A) }).then(j)), e)
const tr = await fetch(`${BASE}/stock-transfers`, { method: 'POST', headers: H(A), body: JSON.stringify({ from_warehouse: 'A', to_warehouse: 'B', item_name: 'ZZ', qty: 1 }) }).then(j)
ok(tr.number?.startsWith('ST-'), `transfer numbered ${tr.number}`)

S_('Pricing engine')
for (const e of ['price-lists', 'discount-rules']) ok((await fetch(`${BASE}/${e}`, { headers: H(A) }).then(j)).length >= 1, `${e} seeded`)

S_('Documents + versions')
const doc = await fetch(`${BASE}/documents`, { method: 'POST', headers: H(A), body: JSON.stringify({ name: 'ZZ Doc', file_url: 'https://x/1' }) }).then(j)
await fetch(`${BASE}/documents/${doc.id}/version`, { method: 'POST', headers: H(A), body: JSON.stringify({ file_url: 'https://x/2' }) }).then(j)
ok((await fetch(`${BASE}/documents/${doc.id}`, { headers: H(A) }).then(j)).versions.length === 2, 'document version history')

S_('User preferences')
await fetch(`${BASE}/preferences/ui`, { method: 'PUT', headers: H(A), body: JSON.stringify({ value: { theme: 'x' } }) }).then(j)
ok((await fetch(`${BASE}/preferences`, { headers: H(A) }).then(j)).ui?.theme === 'x', 'preference persisted')

S_('Cleanup')
await supabase.from('customer_contacts').delete().eq('customer_id', cus.id)
await supabase.from('customer_addresses').delete().eq('customer_id', cus.id)
await supabase.from('customers').delete().eq('id', cus.id)
await supabase.from('stock_transfers').delete().eq('id', tr.id)
await supabase.from('documents').delete().eq('id', doc.id)
await supabase.from('approvals').delete().eq('id', ap.id)
await supabase.from('user_preferences').delete().eq('pref_key', 'ui')
console.log('  cleaned test data')

console.log(`\n######## FRAMEWORK RESULT: ${pass} passed, ${fail} failed ########`)
if (fail) fails.forEach((f) => console.log('  -', f))
process.exit(fail ? 1 : 0)
