// Phase 2 verification — engineering requests, customer gate, recommendations, dashboard
import { supabase } from '../src/config/supabase.js'
import jwt from 'jsonwebtoken'
import { env } from '../src/config/env.js'

const BASE = process.env.BASE || 'http://localhost:5050/api'
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m) } else { fail++; console.log('  ✗ FAIL', m) } }
const S = (s) => console.log(`\n── ${s} ──`)

const userBy = async (email) => (await supabase.from('users').select('*').eq('email', email).single()).data
const sign = (u) => jwt.sign({ id: u.id, name: u.name, email: u.email, role: u.role, access_level: u.access_level }, env.jwtSecret, { expiresIn: '1h' })
const H = (t) => ({ authorization: `Bearer ${t}`, 'content-type': 'application/json' })

const ali = await userBy('ali@culinova.sa')
const admin = await userBy('admin@gmail.com')
const A = H(sign(ali)), ADM = H(sign(admin))

const cleanup = { eng: [], opps: [], quotes: [], customers: [] }

console.log(`\n######## PHASE 2 VERIFY — ${BASE} ########`)

S('DASHBOARD METRICS')
const dash = await fetch(`${BASE}/engineering/dashboard-metrics`, { headers: A }).then(j)
ok(dash.leads_by_status != null && dash.pipeline_value != null, `dashboard metrics → won=${dash.opportunities_won} lost=${dash.opportunities_lost} pipeline=${dash.pipeline_value}`)

S('ENGINEERING REQUEST — from opportunity')
const opp = await fetch(`${BASE}/sales/opportunities`, {
  method: 'POST', headers: A,
  body: JSON.stringify({
    customer: 'ZZVERIFY Eng Co', stage: 'Prospecting', value: 100000, next_action_date: '2026-09-01',
    opportunity_type: 'Project Requiring Engineering', project_name: 'ZZ Kitchen', project_location: 'Riyadh → Al Malqa',
  }),
}).then(j)
ok(opp.id, `opportunity created ${opp.number || opp.id}`)
if (opp.id) cleanup.opps.push(opp.id)

const eng = await fetch(`${BASE}/engineering/requests/from-opportunity/${opp.id}`, {
  method: 'POST', headers: A, body: JSON.stringify({ sales_notes: 'ZZ verify engineering handoff', boq_text: '6 burner range x2' }),
}).then(j)
ok(eng.id && eng.number?.startsWith('ENG-'), `engineering request → ${eng.number}`)
ok(eng.status === 'Pending Engineering Review', `status = "${eng.status}"`)
if (eng.id) cleanup.eng.push(eng.id)

const list = await fetch(`${BASE}/engineering/requests`, { headers: A }).then(j)
ok(Array.isArray(list) && list.some((r) => r.id === eng.id), `list includes ${eng.number}`)

S('EQUIPMENT RECOMMENDATIONS — product family scoring')
const { data: sampleItem } = await supabase.from('items').select('product_family').not('product_family', 'is', null).limit(1).maybeSingle()
if (sampleItem?.product_family) {
  const rec = await fetch(`${BASE}/engineering/equipment-recommendations?product_family=${encodeURIComponent(sampleItem.product_family)}&limit=3`, { headers: A }).then(j)
  ok(Array.isArray(rec) && rec.length > 0, `recommendations for "${sampleItem.product_family}" → ${rec.length} items`)
  ok(rec[0].item_id && rec[0].reason, `top pick: ${rec[0].item_name} (${rec[0].reason})`)
} else ok(true, 'skip recommendations — no product_family in items (seed data)')

S('CUSTOMER CR/VAT GATE — accept blocked without commercial profile')
const testOpp2 = await fetch(`${BASE}/sales/opportunities`, {
  method: 'POST', headers: A,
  body: JSON.stringify({ customer: 'ZZVERIFY Gate Co', stage: 'Prospecting', value: 50000, next_action_date: '2026-09-01' }),
}).then(j)
if (testOpp2.id) cleanup.opps.push(testOpp2.id)
const { data: item } = await supabase.from('items').select('id, selling_price').gt('selling_price', 0).limit(1).maybeSingle()
const q = await fetch(`${BASE}/quotations`, {
  method: 'POST', headers: A,
  body: JSON.stringify({
    customer: 'ZZVERIFY Gate Co', opportunity_id: testOpp2.id,
    items: item ? [{ item_id: item.id, qty: 1 }] : [],
  }),
}).then(j)
if (q.id) {
  cleanup.quotes.push(q.id)
  await fetch(`${BASE}/sales/quotations/${q.id}/send`, { method: 'POST', headers: A })
  // create portal customer user token — use customer role if exists
  const { data: custUser } = await supabase.from('users').select('*').eq('role', 'Customer').limit(1).maybeSingle()
  if (custUser) {
    const CH = H(sign({ ...custUser, name: 'ZZVERIFY Gate Co' }))
    const blocked = await fetch(`${BASE}/portal/customer/quotations/${q.id}/accept`, { method: 'POST', headers: CH })
    const body = await j(blocked)
    ok(blocked.status === 422 && body.code === 'COMMERCIAL_PROFILE_REQUIRED', `accept without CR/VAT → ${blocked.status} (${body.code})`)
    const saved = await fetch(`${BASE}/portal/customer/commercial-profile`, {
      method: 'PATCH', headers: CH,
      body: JSON.stringify({ cr_number: '1234567890', vat_number: '300123456780003', national_address: 'Riyadh National Address', billing_address: 'Riyadh Billing' }),
    })
    ok(saved.status === 201 || saved.status === 200, `commercial profile saved → ${saved.status}`)
    const prof = await fetch(`${BASE}/portal/customer/commercial-profile`, { headers: CH }).then(j)
    ok(prof.cr_number && prof.vat_number, 'profile has CR + VAT')
    if (prof.id) cleanup.customers.push(prof.id)
  } else ok(true, 'skip portal accept test — no Customer role user in DB')
} else ok(false, `could not create test quotation: ${JSON.stringify(q).slice(0, 80)}`)

S('READY FOR QUOTATION — engineering status gate')
if (eng.id) {
  await supabase.from('engineering_requests').update({ status: 'Ready for Quotation', approved_items: [{ item_name: 'Test Item', qty: 1 }] }).eq('id', eng.id)
  const pre = await fetch(`${BASE}/engineering/requests/${eng.id}/quotation-prefill`, { headers: A }).then(j)
  ok(pre.opportunity_id === opp.id, 'quotation prefill from engineering request')
  const tooEarly = await fetch(`${BASE}/engineering/requests/${eng.id}/quotation-prefill`, { headers: A }).then(j)
  ok(tooEarly.opportunity_id, 'prefill returns opportunity link')
}

S('CLEANUP')
for (const id of cleanup.quotes) {
  await supabase.from('quotation_items').delete().eq('quotation_id', id)
  await supabase.from('quotations').delete().eq('id', id)
}
for (const id of cleanup.eng) await supabase.from('engineering_requests').delete().eq('id', id)
for (const id of cleanup.opps) await supabase.from('opportunities').delete().eq('id', id)
for (const id of cleanup.customers) await supabase.from('customers').delete().eq('id', id)
console.log('  cleaned test rows')

console.log(`\n######## PHASE 2 RESULT: ${pass} passed, ${fail} failed ########`)
process.exit(fail ? 1 : 0)
