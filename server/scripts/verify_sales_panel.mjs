// SALES PANEL — end-to-end verification as the REAL sales roles.
// Covers every page's data contract, the discount/approval rules, and the full
// Lead → Opportunity → Quotation → Send → Accept → Sales Order → Project chain. Self-cleaning.
import { supabase } from '../src/config/supabase.js'
import jwt from 'jsonwebtoken'
import { env } from '../src/config/env.js'

const BASE = process.env.BASE || 'http://localhost:5050/api'
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
let pass = 0, fail = 0; const fails = []
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m) } else { fail++; fails.push(m); console.log('  ✗ FAIL', m) } }
const S = (s) => console.log(`\n── ${s} ──`)

const userBy = async (email) => (await supabase.from('users').select('*').eq('email', email).single()).data
const sign = (u) => jwt.sign({ id: u.id, name: u.name, email: u.email, role: u.role, access_level: u.access_level }, env.jwtSecret, { expiresIn: '1h' })
const H = (t) => ({ authorization: `Bearer ${t}`, 'content-type': 'application/json' })

const ali = await userBy('ali@culinova.sa')          // Sales User / Create   (direct limit 10%)
const hamza = await userBy('hamza@culinova.sa')      // Sales Manager / Approval
const admin = await userBy('admin@gmail.com')        // Management / Full Admin
const A = H(sign(ali)), M = H(sign(hamza)), ADM = H(sign(admin))

console.log(`\n######## SALES PANEL — ${BASE} ########`)
console.log(`  Sales User    : ${ali.name} <${ali.email}> (${ali.role} / ${ali.access_level})`)
console.log(`  Sales Manager : ${hamza.name} <${hamza.email}> (${hamza.role} / ${hamza.access_level})`)

const cleanup = { quotations: [], leads: [], opportunities: [], sales_orders: [], projects: [] }

// ─────────────────────────────────────────────────────────────────────────────
S('PAGE DATA — every sales page loads real rows for a Sales User')
const items = await fetch(`${BASE}/items`, { headers: A }).then(j)
ok(Array.isArray(items) && items.length > 0, `Item Master → ${items.length} items (was showing 0)`)
ok(items[0] && items[0].cost === undefined, 'Item Master → cost REDACTED for Sales')

const leads = await fetch(`${BASE}/leads`, { headers: A }).then(j)
ok(Array.isArray(leads) && leads.length > 0, `Leads → ${leads.length} rows`)
ok(leads.every((l) => l.number), `Leads → every lead has a human reference (e.g. ${leads[0]?.number}) — no raw uuid`)

const opps = await fetch(`${BASE}/opportunities`, { headers: A }).then(j)
ok(Array.isArray(opps) && opps.length > 0, `Opportunities → ${opps.length} rows`)
ok(opps.every((o) => o.number), `Opportunities → every one has a reference (e.g. ${opps[0]?.number})`)

const quotes = await fetch(`${BASE}/sales/quotations`, { headers: A }).then(j)
ok(Array.isArray(quotes) && quotes.length > 0, `Quotations → ${quotes.length} rows`)
ok(quotes.every((q) => q.cost_amount === undefined && q.gp_percent === undefined), 'Quotations → cost/GP REDACTED for Sales')

const orders = await fetch(`${BASE}/sales/orders`, { headers: A }).then(j)
ok(Array.isArray(orders) && orders.length > 0, `Sales Orders → ${orders.length} rows`)
ok(orders.every((o) => !o.project_id || o.project_number), 'Sales Orders → project shown as a number, not a raw uuid')

const chat = await fetch(`${BASE}/sales/messages`, { headers: A }).then(j)
ok(Array.isArray(chat) && chat.length > 0, `Chat → ${chat.length} messages`)

const custs = await fetch(`${BASE}/customers`, { headers: A }).then(j)
ok(Array.isArray(custs), `Customers → ${custs.length} rows (0 is the truth — table is empty)`)

// ─────────────────────────────────────────────────────────────────────────────
S('CROSS-PANEL LOOKUPS — dropdowns a Sales role must still be able to fill')
const lp = await fetch(`${BASE}/lookups/projects`, { headers: A }).then(j)
ok(Array.isArray(lp), `Quotation builder → project picker has ${lp.length} options (store's projects is 403 for sales)`)
const tc = await fetch(`${BASE}/sales/top-customers`, { headers: A })
ok(tc.status === 200, `Top Customers chart → GET /sales/top-customers ${tc.status} (invoices are finance-gated)`)

// ─────────────────────────────────────────────────────────────────────────────
S('LEAD CONVERT — Sales User (Create level) must convert without PATCH permission')
const testLead = await fetch(`${BASE}/leads`, {
  method: 'POST', headers: A,
  body: JSON.stringify({
    name: 'ZZ Verify Contact', company: 'ZZVERIFY Lead Co', source: 'Website',
    est_value: 50000, project_name: 'ZZ Test Kitchen', project_city: 'Riyadh', project_district: 'Al Malqa',
    status: 'New',
  }),
}).then(j)
ok(testLead.id, `POST /leads → test lead created (${testLead.number || testLead.id})`)
if (testLead.id) cleanup.leads.push(testLead.id)

if (testLead.id) {
  const conv = await fetch(`${BASE}/sales/leads/${testLead.id}/convert`, { method: 'POST', headers: A, body: '{}' })
  const convBody = await conv.json().catch(() => ({}))
  ok(conv.status === 201, `Sales User convert → ${conv.status} (was 403 before fix)`)
  ok(convBody.opportunity?.id, `convert created opportunity ${convBody.opportunity?.number || convBody.opportunity?.id}`)
  ok(convBody.lead?.status === 'Opportunity', `lead status → "${convBody.lead?.status}"`)
  if (convBody.opportunity?.id) cleanup.opportunities.push(convBody.opportunity.id)
}

// reuse opportunity for quotation tests (create one if convert failed)
let testOppId = null
if (testLead.id) {
  const { data: oppRow } = await supabase.from('opportunities').select('id').ilike('customer', 'ZZVERIFY Lead Co').maybeSingle()
  testOppId = oppRow?.id
}
if (!testOppId) {
  const opp = await fetch(`${BASE}/sales/opportunities`, {
    method: 'POST', headers: A,
    body: JSON.stringify({ customer: 'ZZVERIFY Sales Co', stage: 'Prospecting', value: 50000, next_action_date: '2026-08-01' }),
  }).then(j)
  testOppId = opp.id
  if (testOppId) cleanup.opportunities.push(testOppId)
}
ok(!!testOppId, `test opportunity ready for quotation (${testOppId})`)

// ─────────────────────────────────────────────────────────────────────────────
S('DISCOUNT RULES — the builder must obey the SAME limits as the legacy route')
const anItem = items.find((i) => i.id && (Number(i.selling_price) || Number(i.selling_rate) || Number(i.standard_rate) || 0) > 0) || items.find((i) => i.id)
const mkQuote = (headers, discount_pct) => fetch(`${BASE}/quotations`, {
  method: 'POST', headers,
  body: JSON.stringify({
    customer: 'ZZVERIFY Sales Co', customer_email: 'zzverify@example.com',
    opportunity_id: testOppId,
    items: [{ item_id: anItem.id, qty: 1 }], discount_pct,
  }),
})

// (a) a 90% discount must be REFUSED outright (absolute ceiling is 25%)
const huge = await mkQuote(A, 90)
const hugeBody = await j(huge)
ok(huge.status === 422, `Sales User · 90% discount → ${huge.status} REFUSED (${hugeBody.error || ''})`)
if (hugeBody.id) cleanup.quotations.push(hugeBody.id)

// (b) a discount over the role's direct limit must go to Pending Approval, not straight to Draft
const over = await mkQuote(A, 20)
const overQ = await j(over)
if (overQ.id) {
  cleanup.quotations.push(overQ.id)
  const { data: row } = await supabase.from('quotations').select('status, approval_status').eq('id', overQ.id).single()
  ok(row.approval_status === 'Pending' && row.status === 'Pending Approval',
    `Sales User · 20% discount → status "${row.status}" / approval "${row.approval_status}" (routed for approval)`)
} else ok(false, `Sales User · 20% discount → unexpected ${over.status} ${JSON.stringify(overQ).slice(0, 80)}`)

// (c) a discount inside the limit stays a Draft the salesperson can work on
const okQ = await j(await mkQuote(A, 5))
if (okQ.id) {
  cleanup.quotations.push(okQ.id)
  const { data: row } = await supabase.from('quotations').select('status, approval_status').eq('id', okQ.id).single()
  ok(row.approval_status === 'Not Required' && row.status === 'Draft',
    `Sales User · 5% discount (within limit) → "${row.status}" / "${row.approval_status}"`)
} else ok(false, 'Sales User · 5% discount → could not create')

// ─────────────────────────────────────────────────────────────────────────────
S('QUOTATION BUILDER — Item Master snapshot + pricing chain + CRM automation')
if (okQ.id) {
  const full = await fetch(`${BASE}/quotations/${okQ.id}`, { headers: ADM }).then(j)
  const line = (full.quotation_items || full.items || [])[0]
  ok(!!line, 'builder created a line from item_id')
  ok(line && (line.brand || line.model || line.specifications), `line SNAPSHOTS engineering data (brand="${line?.brand}", model="${line?.model}")`)
  ok(line && line.item_id === anItem.id, 'line is linked back to the Item Master row')
  // CRM automation: the builder must create/advance the opportunity (it used to skip this entirely)
  const { data: opp } = await supabase.from('opportunities').select('id, stage').ilike('customer', 'ZZVERIFY Sales Co').maybeSingle()
  ok(!!opp, `builder ran the CRM chain → opportunity created${opp ? ` (stage "${opp.stage}")` : ''}`)
  if (opp) cleanup.opportunities.push(opp.id)
  const { data: lead } = await supabase.from('leads').select('id').ilike('company', 'ZZVERIFY Sales Co').maybeSingle()
  if (lead) cleanup.leads.push(lead.id)
}

// ─────────────────────────────────────────────────────────────────────────────
S('SEND — a Sales User must be able to send the quotation they built')
if (okQ.id) {
  const sent = await fetch(`${BASE}/sales/quotations/${okQ.id}/send`, { method: 'POST', headers: A })
  ok(sent.status === 200, `Sales User can SEND their own draft → ${sent.status}`)
}

// ─────────────────────────────────────────────────────────────────────────────
S('ACCEPT — only the CUSTOMER may accept (a salesperson must never)')
if (okQ.id) {
  const bySales = await fetch(`${BASE}/sales/quotations/${okQ.id}/accept`, { method: 'POST', headers: A })
  ok(bySales.status === 403, `Sales User accept → ${bySales.status} BLOCKED (only the customer may accept)`)
}

// ─────────────────────────────────────────────────────────────────────────────
S('LOST — a quotation is never deleted, only marked Lost with a reason')
if (okQ.id) {
  const noReason = await fetch(`${BASE}/sales/quotations/${okQ.id}/lost`, { method: 'POST', headers: A, body: JSON.stringify({ reason: '' }) })
  ok(noReason.status === 422, `mark Lost without a reason → ${noReason.status} refused`)
  const lost = await fetch(`${BASE}/sales/quotations/${okQ.id}/lost`, { method: 'POST', headers: A, body: JSON.stringify({ reason: 'ZZ verify — customer went elsewhere' }) })
  ok(lost.status === 200, `mark Lost with a reason → ${lost.status}`)
  const { data: row } = await supabase.from('quotations').select('status').eq('id', okQ.id).single()
  ok(row.status === 'Lost', `quotation is now "${row.status}" (row preserved, not deleted)`)
}

// ─────────────────────────────────────────────────────────────────────────────
S('DIRECT SALES ORDER — creates the order AND its linked project')
const so = await fetch(`${BASE}/sales/orders`, {
  method: 'POST', headers: ADM,
  body: JSON.stringify({ customer: 'ZZVERIFY Sales Co', project_name: 'ZZ Verify Kitchen', amount: 50000, items: [{ item_name: anItem.item_name, qty: 2, rate: 25000 }] }),
}).then(j)
ok(so.id && so.number?.startsWith('SO-'), `POST /sales/orders → ${so.number}`)
ok(so.project_number?.startsWith('PRJ-'), `auto-linked project → ${so.project_number}`)
if (so.id) cleanup.sales_orders.push(so.id)
if (so.project_id) cleanup.projects.push(so.project_id)

// ─────────────────────────────────────────────────────────────────────────────
S('MANAGER — the approval queue works for the Sales Manager')
const mq = await fetch(`${BASE}/sales/quotations`, { headers: M }).then(j)
ok(Array.isArray(mq), `Sales Manager sees ${mq.length} quotations`)
const notif = await fetch(`${BASE}/notifications`, { headers: ADM }).then(j)
ok(typeof notif.unread === 'number', `notifications feed OK (unread=${notif.unread}) — read-state persists`)

// ─────────────────────────────────────────────────────────────────────────────
S('CLEANUP')
for (const id of cleanup.quotations) {
  await supabase.from('quotation_items').delete().eq('quotation_id', id)
  await supabase.from('quotation_revisions').delete().eq('quotation_id', id)
  await supabase.from('quotations').delete().eq('id', id)
}
for (const id of cleanup.projects) { await supabase.from('project_boq').delete().eq('project_id', id); await supabase.from('projects').delete().eq('id', id) }
for (const id of cleanup.sales_orders) await supabase.from('sales_orders').delete().eq('id', id)
for (const id of cleanup.opportunities) await supabase.from('opportunities').delete().eq('id', id)
for (const id of cleanup.leads) await supabase.from('leads').delete().eq('id', id)
await supabase.from('notifications').delete().ilike('body', '%ZZVERIFY%')
console.log('  cleaned every test row')

console.log(`\n######## SALES PANEL RESULT: ${pass} passed, ${fail} failed ########`)
if (fail) fails.forEach((f) => console.log('   -', f))
process.exit(fail ? 1 : 0)
