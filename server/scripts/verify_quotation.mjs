// M5 — QUOTATION SYSTEM end-to-end verification. Self-cleaning.
// Proves: create-with-lines · EOS spec/technical/image SNAPSHOTTING (immune to later item edits) ·
// rate from the pricing chain · cost/GP redacted for Sales but visible to Management ·
// VAT from vat_settings (not hardcoded) · line CRUD recompute · discount cap enforcement ·
// revision history · and that this router exposes NO accept route (only the customer accepts).
//
// Runs in-process by default (mounts the router on a throwaway app) so it works BEFORE the
// orchestrator mounts it. Set BASE=http://localhost:5050/api to hit the live server instead.
import express from 'express'
import jwt from 'jsonwebtoken'
import { supabase } from '../src/config/supabase.js'
import { env } from '../src/config/env.js'
import { quotationRouter } from '../src/modules/sales/quotation.routes.js'
import { errorHandler, notFound } from '../src/middleware/error.js'

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
let pass = 0, fail = 0
const ok = (c, m) => { c ? (pass++, console.log('  ✓', m)) : (fail++, console.log('  ✗ FAIL', m)) }
const approx = (a, b, e = 0.02) => Math.abs(Number(a) - Number(b)) <= e

// ── boot: in-process app unless BASE points at a live server ──
let server = null, BASE = process.env.BASE ? process.env.BASE.replace(/\/$/, '') : null
if (!BASE) {
  const app = express()
  app.use(express.json())
  app.use('/quotations', quotationRouter())
  app.use(notFound)
  app.use(errorHandler)
  await new Promise((r) => { server = app.listen(0, r) })
  BASE = `http://localhost:${server.address().port}`
  console.log(`(in-process app on ${BASE})`)
}

// tokens for the REAL sales role that uses this module + Management (to prove redaction both ways)
const tok = (u) => jwt.sign({ id: u.id, name: u.name, email: u.email, role: u.role, access_level: u.access_level }, env.jwtSecret, { expiresIn: '1h' })
const { data: mgr } = await supabase.from('users').select('*').eq('email', 'hamza@culinova.sa').single()   // Sales Manager (Approval)
const { data: adm } = await supabase.from('users').select('*').eq('email', 'admin@gmail.com').single()      // Management (Full Admin)
const SH = { authorization: `Bearer ${tok(mgr)}`, 'content-type': 'application/json' } // sales manager headers
const AH = { authorization: `Bearer ${tok(adm)}`, 'content-type': 'application/json' } // admin headers

console.log('\n######## M5 QUOTATION SYSTEM (as Sales Manager, redaction proven vs Management) ########')

// ── seed two throwaway priced items (deterministic pricing + a discount cap) ──
const mkItem = (over) => ({
  code: 'ZZQ-' + Math.random().toString(36).slice(2, 8), name: over.name, item_name: over.name,
  item_group: 'ZZ Test', brand: over.brand, model: over.model, uom: 'Nos',
  description: over.description, specifications: over.specifications, image_url: over.image_url, datasheet_url: over.datasheet_url,
  selling_price: over.selling_price, landed_cost: over.landed_cost, cost: over.landed_cost, max_discount: over.max_discount, status: 'Active',
})
const { data: oven } = await supabase.from('items').insert(mkItem({
  name: 'ZZ Quotation Test Oven', brand: 'BARTSCHER', model: 'ZO-900', description: '<p>Convection oven, 6 trays</p>',
  specifications: '{"power":"9kW","trays":6,"source":"CULINOVA EOS"}', image_url: '/files/zz-oven.png', datasheet_url: '/files/zz-oven.pdf',
  selling_price: 5000, landed_cost: 3000, max_discount: 10,
})).select().single()
const { data: mixer } = await supabase.from('items').insert(mkItem({
  name: 'ZZ Quotation Test Mixer', brand: 'HOBART', model: 'ZM-20', description: '<p>Planetary mixer 20L</p>',
  specifications: '{"capacity":"20L"}', image_url: '/files/zz-mixer.png', datasheet_url: null,
  selling_price: 2000, landed_cost: 1200, max_discount: 0,
})).select().single()
ok(!!oven?.id && !!mixer?.id, `seeded test items: ${oven?.item_name} / ${mixer?.item_name}`)

// VAT rate straight from the DB (proves we don't hardcode 15)
const { data: vatRow } = await supabase.from('vat_settings').select('rate').eq('is_active', true).eq('is_default', true).maybeSingle()
const VAT = Number(vatRow?.rate ?? 15) / 100
console.log(`  VAT from vat_settings = ${(VAT * 100).toFixed(0)}%`)

// expected discount cap for the two lines (oven own-cap 10, plus any active 'All' rule)
const { data: rules } = await supabase.from('discount_rules').select('*').eq('is_active', true)
let allPct = 0
for (const rl of (rules || []).filter((x) => String(x.applies_to || '').toLowerCase() === 'all')) {
  const c = rl.max_discount, p = c != null ? Math.min(Number(rl.discount_pct) || 0, Number(c)) : (Number(rl.discount_pct) || 0)
  allPct = Math.max(allPct, p)
}
const caps = [Math.min(10, allPct > 0 ? allPct : 10)]
if (allPct > 0) caps.push(allPct)
const CAP = Math.min(...caps)
console.log(`  computed item discount cap = ${CAP}%`)

let qid = null, revisedNet = 0
try {
  console.log('\n[1] GET /quotations/terms — commercial terms picker')
  const terms = await fetch(`${BASE}/quotations/terms`, { headers: SH }).then(j)
  ok(Array.isArray(terms) && terms.length >= 1, `terms -> ${Array.isArray(terms) ? terms.length + ' active terms' : JSON.stringify(terms)}`)

  console.log('\n[2] POST /quotations — create with lines (oven x2 @ chain price, mixer x1 @ chain price — rate override ignored for Sales)')
  const testOpp = await fetch(`${BASE}/sales/opportunities`, {
    method: 'POST', headers: SH,
    body: JSON.stringify({ customer: 'ZZ Al Waha Restaurant', stage: 'Prospecting', value: 100000, next_action_date: '2026-08-01' }),
  }).then(j)
  ok(!!testOpp.id, `test opportunity ${testOpp.number || testOpp.id}`)
  const created = await fetch(`${BASE}/quotations`, {
    method: 'POST', headers: SH,
    body: JSON.stringify({
      customer: 'ZZ Al Waha Restaurant', contact_person: 'Chef Omar', project_name: 'Main Kitchen', customer_email: 'omar@zz.test',
      opportunity_id: testOpp.id,
      validity_days: 30, payment_terms: '50% advance, 50% on delivery', currency: 'SAR', notes: 'Test build',
      items: [{ item_id: oven.id, qty: 2 }, { item_id: mixer.id, qty: 1, rate: 2500 }],
    }),
  }).then(j)
  qid = created?.id
  ok(!!qid && typeof created.number === 'string' && created.number.length > 3, `created ${created.number}`)
  const li = (created.quotation_items || []).sort((a, b) => a.sort_order - b.sort_order)
  ok(li.length === 2, `2 lines stored (${li.length})`)
  const ovenLine = li.find((l) => l.item_id === oven.id) || {}
  ok(Number(ovenLine.rate) === 5000, `oven rate from pricing chain = ${ovenLine.rate} (expect 5000)`)
  ok(Number((li.find((l) => l.item_id === mixer.id) || {}).rate) === 2000, `mixer rate locked to chain = 2000 (override 2500 ignored for Sales)`)
  // SNAPSHOT proof (EOS spec / technical data / image auto-imported onto the line)
  ok(ovenLine.brand === 'BARTSCHER' && ovenLine.model === 'ZO-900', `snapshot brand/model = ${ovenLine.brand}/${ovenLine.model}`)
  ok(ovenLine.specifications === oven.specifications, 'snapshot specifications (technical data) captured')
  ok(ovenLine.image_url === '/files/zz-oven.png' && ovenLine.datasheet_url === '/files/zz-oven.pdf', 'snapshot image + datasheet captured')
  // totals
  const net = 2 * 5000 + 1 * 2000 // 12000 — fixed pricing from chain
  ok(approx(created.net_amount, net), `net_amount = ${created.net_amount} (expect ${net})`)
  ok(approx(created.vat_amount, net * VAT), `vat_amount = ${created.vat_amount} (expect ${(net * VAT).toFixed(2)} from DB VAT)`)
  ok(approx(created.total_amount, net + net * VAT), `total_amount = ${created.total_amount}`)
  // REDACTION for Sales Manager (not a financial role)
  ok(created.cost_amount === undefined && created.gp_percent === undefined, 'header cost/GP redacted for Sales')
  ok(li.every((l) => l.cost === undefined), 'line cost redacted for Sales')

  console.log('\n[3] GET /quotations/:id as MANAGEMENT — cost + GP now visible')
  const asAdmin = await fetch(`${BASE}/quotations/${qid}`, { headers: AH }).then(j)
  const cost = 2 * 3000 + 1 * 1200 // 7200
  ok(approx(asAdmin.cost_amount, cost), `cost_amount (admin) = ${asAdmin.cost_amount} (expect ${cost})`)
  ok(approx(asAdmin.gp_percent, ((net - cost) / net) * 100), `gp_percent (admin) = ${asAdmin.gp_percent}`)
  ok((asAdmin.quotation_items || []).some((l) => l.cost != null), 'line cost visible to admin')
  ok(Array.isArray(asAdmin.revisions) && asAdmin.revisions.length >= 1, `revisions embedded (${asAdmin.revisions?.length})`)
  ok(Array.isArray(asAdmin.terms) && asAdmin.terms.length >= 1, 'resolved commercial terms embedded')

  console.log('\n[4] SNAPSHOT immutability — change the item, quotation must NOT change')
  await supabase.from('items').update({ brand: 'CHANGED-BRAND', specifications: '{"tampered":true}' }).eq('id', oven.id)
  const afterEdit = await fetch(`${BASE}/quotations/${qid}`, { headers: SH }).then(j)
  const ol2 = (afterEdit.quotation_items || []).find((l) => l.item_id === oven.id) || {}
  ok(ol2.brand === 'BARTSCHER' && ol2.specifications === oven.specifications, 'line kept its snapshot after the item was edited')

  console.log('\n[5] POST /:id/apply-discount — within the cap (pct = ' + CAP + '%)')
  const disc1 = await fetch(`${BASE}/quotations/${qid}/apply-discount`, { method: 'POST', headers: SH, body: JSON.stringify({ pct: CAP }) }).then(j)
  ok(approx(disc1.discount_amount, (net * CAP) / 100), `discount_amount = ${disc1.discount_amount} (expect ${(net * CAP / 100).toFixed(2)})`)
  ok(approx(disc1.total_amount, (net - net * CAP / 100) * (1 + VAT)), `total after discount = ${disc1.total_amount}`)

  console.log('\n[6] POST /:id/apply-discount — OVER the cap must 422')
  const over = await fetch(`${BASE}/quotations/${qid}/apply-discount`, { method: 'POST', headers: SH, body: JSON.stringify({ pct: CAP + 5 }) })
  const overBody = await j(over)
  ok(over.status === 422 && /exceeds the maximum/i.test(overBody.error || ''), `blocked: ${over.status} "${overBody.error}"`)

  console.log('\n[7] POST /:id/items — add a mixer line → recompute')
  const added = await fetch(`${BASE}/quotations/${qid}/items`, { method: 'POST', headers: SH, body: JSON.stringify({ item_id: mixer.id, qty: 1 }) }).then(j)
  ok((added.quotation_items || []).length === 3, `3 lines after add (${(added.quotation_items || []).length})`)
  const net2 = net + 2000
  ok(approx(added.net_amount, net2 - net2 * CAP / 100 + net2 * CAP / 100) || approx(added.net_amount, net2), `net recomputed = ${added.net_amount} (expect ${net2})`)
  const newLine = (added.quotation_items || []).find((l) => l.item_id === mixer.id && Number(l.rate) === 2000)

  console.log('\n[8] PATCH /:id/items/:lineId — change qty → recompute amount')
  const patched = await fetch(`${BASE}/quotations/${qid}/items/${newLine.id}`, { method: 'PATCH', headers: SH, body: JSON.stringify({ qty: 3 }) }).then(j)
  const pLine = (patched.quotation_items || []).find((l) => l.id === newLine.id)
  ok(Number(pLine.qty) === 3 && approx(pLine.amount, 6000), `line qty=3 amount=${pLine.amount} (expect 6000)`)

  console.log('\n[9] DELETE /:id/items/:lineId — remove it → back to 2 lines')
  const del = await fetch(`${BASE}/quotations/${qid}/items/${newLine.id}`, { method: 'DELETE', headers: SH }).then(j)
  ok((del.quotation_items || []).length === 2, `2 lines after delete (${(del.quotation_items || []).length})`)

  console.log('\n[10] PATCH /:id — header edit (validity 60 recomputes valid_till)')
  const hdr = await fetch(`${BASE}/quotations/${qid}`, { method: 'PATCH', headers: SH, body: JSON.stringify({ validity_days: 60, payment_terms: '100% on delivery', terms_text: 'Standard terms apply' }) }).then(j)
  const expTill = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10)
  ok(hdr.validity_days === 60 && hdr.valid_till === expTill, `valid_till recomputed to ${hdr.valid_till}`)
  revisedNet = hdr.net_amount

  console.log('\n[11] POST /:id/revise + GET /:id/revisions — history with a diff')
  const before = await fetch(`${BASE}/quotations/${qid}`, { headers: SH }).then(j)
  const rev = await fetch(`${BASE}/quotations/${qid}/revise`, { method: 'POST', headers: SH, body: JSON.stringify({ note: 'Sent to customer for review' }) }).then(j)
  ok(Number(rev.revision) >= 1, `revision bumped to ${rev.revision}`)
  const revs = await fetch(`${BASE}/quotations/${qid}/revisions`, { headers: SH }).then(j)
  ok(Array.isArray(revs) && revs.length >= 2, `revision history has ${revs.length} entries`)
  ok(revs.some((x) => x.changes?.action === 'revised' && x.changes?.note === 'Sent to customer for review'), 'revise note captured in history')

  console.log('\n[12] No accept route on this router — only the CUSTOMER accepts (via sales.routes)')
  const acc = await fetch(`${BASE}/quotations/${qid}/accept`, { method: 'POST', headers: SH, body: '{}' })
  ok(acc.status === 404, `POST /quotations/:id/accept -> ${acc.status} (builder adds no accept path)`)
} catch (e) {
  fail++; console.log('  ✗ EXCEPTION', e.message)
}

console.log('\n[cleanup]')
if (qid) {
  await supabase.from('quotation_revisions').delete().eq('quotation_id', qid)
  await supabase.from('quotation_items').delete().eq('quotation_id', qid)
  await supabase.from('quotations').delete().eq('id', qid)
  await supabase.from('audit_log').delete().eq('entity', 'quotation').eq('entity_id', String(qid))
}
if (oven?.id) await supabase.from('items').delete().eq('id', oven.id)
if (mixer?.id) await supabase.from('items').delete().eq('id', mixer.id)
console.log('  cleaned test quotation + items')
if (server) await new Promise((r) => server.close(r))

console.log(`\n######## RESULT: ${pass} passed, ${fail} failed ########`)
process.exit(fail ? 1 : 0)
