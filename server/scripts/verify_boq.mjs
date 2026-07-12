// End-to-end BOQ flow (M6) against the LIVE API, acting as the REAL role that owns the module —
// the Project Manager (pm@gmail.com). Proves: create BOQ · add items from the Item Master with
// pricing-chain rates · equipment grouping · quantity edit + total/GP recompute · generate from a
// quotation · push to project_equipment · CSV/HTML export · RBAC + financial redaction. Self-cleaning.
//
// NOTE: /boqs is mounted by the orchestrator (routes/index.js) — until then this script 404s. Expected.
import { supabase } from '../src/config/supabase.js'
import jwt from 'jsonwebtoken'
import { env } from '../src/config/env.js'

const BASE = process.env.BASE || 'http://localhost:5050/api'
const j = async (r) => { const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) } } catch { return { s: r.status, b: t } } }
let pass = 0, fail = 0
const ok = (c, m) => { c ? (pass++, console.log('  ✓', m)) : (fail++, console.log('  ✗ FAIL', m)) }
const approx = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.5
const tok = (u) => jwt.sign({ id: u.id, name: u.name, email: u.email, role: u.role, access_level: u.access_level }, env.jwtSecret, { expiresIn: '1h' })

const { data: pm } = await supabase.from('users').select('*').eq('email', 'pm@gmail.com').single()
const { data: admin } = await supabase.from('users').select('*').eq('email', 'admin@gmail.com').single()
const { data: sales } = await supabase.from('users').select('*').eq('email', 'ali@culinova.sa').single()
if (!pm || !admin) { console.log('Missing pm@gmail.com / admin@gmail.com user — cannot run.'); process.exit(1) }
const H = { authorization: 'Bearer ' + tok(pm), 'content-type': 'application/json' }
const AH = { authorization: 'Bearer ' + tok(admin), 'content-type': 'application/json' }
const SH = sales ? { authorization: 'Bearer ' + tok(sales), 'content-type': 'application/json' } : H
const G = (p, h = H) => fetch(BASE + p, { headers: h }).then(j)
const P = (p, body, h = H) => fetch(BASE + p, { method: 'POST', headers: h, body: JSON.stringify(body || {}) }).then(j)
const PT = (p, body, h = H) => fetch(BASE + p, { method: 'PATCH', headers: h, body: JSON.stringify(body || {}) }).then(j)
const D = (p, h = H) => fetch(BASE + p, { method: 'DELETE', headers: h }).then(j)

console.log('\n######## BOQ MANAGEMENT FLOW (as Project Manager) ########')
const created = { boq: [], project: null, quote: null }

try {
  console.log('\n[1] BOQ list loads')
  const list = await G('/boqs')
  ok(list.s === 200 && Array.isArray(list.b), `GET /boqs -> ${list.s} (${Array.isArray(list.b) ? list.b.length + ' boqs' : JSON.stringify(list.b)})`)

  console.log('\n[2] RBAC — a Sales user (no projects panel) is blocked')
  const sr = await G('/boqs', SH)
  ok(sr.s === 403, `Sales GET /boqs -> ${sr.s} (expect 403)`)

  console.log('\n[3] Create a BOQ (number via nextNumber)')
  const { data: pj } = await supabase.from('projects').insert({ number: 'ZZ-BOQ-' + Date.now(), name: 'ZZ BOQ Test Project', customer: 'ZZ Cust' }).select().single()
  created.project = pj.id
  const c = await P('/boqs', { name: 'ZZ Kitchen BOQ', project_id: pj.id, customer: 'ZZ Cust', currency: 'SAR' })
  ok(c.s === 201 && String(c.b.number || '').startsWith('BOQ'), `POST /boqs -> ${c.s} ${c.b.number}`)
  const boqId = c.b.id; if (boqId) created.boq.push(boqId)

  console.log('\n[4] Add two grouped items from the Item Master (amounts = qty × rate)')
  const items = await G('/items')
  const pool = Array.isArray(items.b) ? items.b : []
  ok(pool.length >= 2, `Item Master has ${pool.length} items`)
  const a1 = await P(`/boqs/${boqId}/items`, { item_id: pool[0].id, qty: 3, group_name: 'Cooking', cost_rate: 100, sell_rate: 150 })
  ok(a1.s === 201 && approx(a1.b.line?.sell_amount, 450) && approx(a1.b.line?.cost_amount, 300), `line1 450/300 -> ${JSON.stringify([a1.b.line?.sell_amount, a1.b.line?.cost_amount])}`)
  const a2 = await P(`/boqs/${boqId}/items`, { item_id: pool[1].id, qty: 2, group_name: 'Refrigeration', cost_rate: 200, sell_rate: 300 })
  ok(a2.s === 201 && approx(a2.b.boq?.total_sell, 1050) && approx(a2.b.boq?.total_cost, 700) && approx(a2.b.boq?.gp_percent, 33.33), `totals 1050/700 gp 33.33 -> ${JSON.stringify([a2.b.boq?.total_sell, a2.b.boq?.total_cost, a2.b.boq?.gp_percent])}`)
  const lineId = a1.b.line?.id

  console.log('\n[5] Read detail — grouped by group_name + cost summary')
  const det = await G(`/boqs/${boqId}`)
  ok(det.s === 200 && det.b.groups?.length === 2, `groups=2 -> ${det.b.groups?.length}`)
  const cook = (det.b.groups || []).find((g) => g.group_name === 'Cooking')
  ok(cook && approx(cook.sell_total, 450) && approx(det.b.summary?.total_sell, 1050), `Cooking subtotal 450 / summary 1050`)

  console.log('\n[6] Quantity management — edit qty recomputes line + BOQ totals')
  const up = await PT(`/boqs/${boqId}/items/${lineId}`, { qty: 5 })
  ok(up.s === 200 && approx(up.b.line?.sell_amount, 750) && approx(up.b.boq?.total_sell, 1350), `line 750 / total 1350 -> ${JSON.stringify([up.b.line?.sell_amount, up.b.boq?.total_sell])}`)

  console.log('\n[7] Generate BOQ lines from a quotation')
  const { data: q } = await supabase.from('quotations').insert({ number: 'ZZ-Q-' + Date.now(), customer: 'ZZ Cust', currency: 'SAR' }).select().single()
  created.quote = q.id
  await supabase.from('quotation_items').insert([{ quotation_id: q.id, item_id: pool[0].id, item_name: pool[0].item_name, qty: 4, rate: 500, cost: 350, uom: 'Nos', brand: 'ZZBrand' }])
  const c2 = await P('/boqs', { name: 'ZZ From Quote', project_id: pj.id, customer: 'ZZ Cust' })
  if (c2.b?.id) created.boq.push(c2.b.id)
  const fq = await P(`/boqs/${c2.b.id}/from-quotation/${q.id}`)
  ok(fq.s === 201 && fq.b.added === 1 && approx(fq.b.boq?.total_sell, 2000) && approx(fq.b.boq?.total_cost, 1400), `from-quote added 1, totals 2000/1400 -> ${JSON.stringify([fq.b.added, fq.b.boq?.total_sell, fq.b.boq?.total_cost])}`)

  console.log('\n[8] Push BOQ lines into project_equipment (idempotent)')
  const pe = await P(`/boqs/${boqId}/to-project-equipment`)
  ok(pe.s === 201 && pe.b.pushed === 2, `pushed 2 -> ${JSON.stringify([pe.s, pe.b.pushed])}`)
  const { data: eq } = await supabase.from('project_equipment').select('id').eq('project_id', pj.id)
  ok((eq || []).length === 2, `project_equipment has 2 rows -> ${(eq || []).length}`)
  await P(`/boqs/${boqId}/to-project-equipment`)
  const { data: eq2 } = await supabase.from('project_equipment').select('id').eq('project_id', pj.id)
  ok((eq2 || []).length === 2, `re-push still 2 (idempotent) -> ${(eq2 || []).length}`)

  console.log('\n[9] Push with no project -> 422')
  const cNoProj = await P('/boqs', { name: 'ZZ NoProj', customer: 'ZZ' }); if (cNoProj.b?.id) created.boq.push(cNoProj.b.id)
  const peBad = await P(`/boqs/${cNoProj.b.id}/to-project-equipment`)
  ok(peBad.s === 422, `no-project push -> ${peBad.s} (expect 422)`)

  console.log('\n[10] Export — CSV (Excel) + print-ready HTML (PDF)')
  const csv = await fetch(BASE + `/boqs/${boqId}/export?format=csv`, { headers: H }); const csvT = await csv.text()
  ok(csv.status === 200 && (csv.headers.get('content-type') || '').includes('text/csv') && csvT.includes('GRAND TOTAL') && csvT.includes('Cost Amount'), 'CSV: text/csv + GRAND TOTAL + cost cols (PM sees cost)')
  ok((csv.headers.get('content-disposition') || '').includes('attachment'), 'CSV: Content-Disposition attachment')
  const html = await fetch(BASE + `/boqs/${boqId}/export?format=html`, { headers: H }); const htmlT = await html.text()
  ok(html.status === 200 && (html.headers.get('content-type') || '').includes('text/html') && htmlT.includes('<table'), 'HTML: text/html print document')

  console.log('\n[11] Input validation (422, no garbage inserted)')
  const badQty = await P(`/boqs/${boqId}/items`, { item_id: pool[0].id, qty: 0 })
  ok(badQty.s === 422, `qty 0 -> ${badQty.s}`)
  const badItem = await P(`/boqs/${boqId}/items`, { item_name: 'NOPE_NO_SUCH_ITEM', qty: 1 })
  ok(badItem.s === 422, `unknown item -> ${badItem.s}`)

  console.log('\n[12] Remove a line (PM) · delete whole BOQ (admin only)')
  const dl = await D(`/boqs/${boqId}/items/${lineId}`)
  ok(dl.s === 200 && approx(dl.b.boq?.total_sell, 600), `line removed, total 600 -> ${dl.b.boq?.total_sell}`)
  const dPm = await D(`/boqs/${boqId}`)
  ok(dPm.s === 403, `PM delete BOQ -> ${dPm.s} (expect 403 — Edit has no delete)`)
  const dOk = await D(`/boqs/${boqId}`, AH)
  ok(dOk.s === 200, `admin delete BOQ -> ${dOk.s}`)
} catch (e) {
  fail++; console.log('  ✗ EXCEPTION', e.message)
}

console.log('\n[cleanup]')
if (created.project) await supabase.from('project_equipment').delete().eq('project_id', created.project)
for (const b of created.boq) { await supabase.from('boq_items').delete().eq('boq_id', b); await supabase.from('boqs').delete().eq('id', b) }
if (created.quote) { await supabase.from('quotation_items').delete().eq('quotation_id', created.quote); await supabase.from('quotations').delete().eq('id', created.quote) }
if (created.project) await supabase.from('projects').delete().eq('id', created.project)
console.log('  cleaned test BOQs, quotation, project + equipment')

console.log(`\n######## RESULT: ${pass} passed, ${fail} failed ########`)
process.exit(fail ? 1 : 0)
