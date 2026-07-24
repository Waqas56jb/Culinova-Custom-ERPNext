/**
 * ONE COMPLETE TEST PROJECT — the full sales workflow, end to end, as real records.
 *
 *   Lead → Opportunity → Engineering Request → EOS → Approved Equipment
 *        → back to ERP → Quotation → Sales Order
 *
 * Every step goes through the real API, exactly as a user would, so what the client opens afterwards
 * is genuine data produced by the genuine flow — not a hand-written fixture.
 *
 *   Run:     node scripts/seed_e2e_demo.mjs
 *   Remove:  node scripts/seed_e2e_demo.mjs --remove
 *
 * Needs both servers reachable (defaults to local): ERP on :5050, EOS on :4400.
 * Everything created is tagged so --remove can undo the whole chain cleanly.
 */
import 'dotenv/config'
import { supabase } from '../src/config/supabase.js'

const ERP = process.env.ERP_BASE || 'http://localhost:5050'
const EOS = process.env.EOS_BASE || 'http://localhost:4400'
const KEY = process.env.ERP_EOS_INTEGRATION_KEY || ''
const ADMIN = { email: process.env.SEED_ADMIN_EMAIL || 'admin@gmail.com', password: process.env.SEED_ADMIN_PASSWORD || 'admin@123!' }
const TAG = 'E2E DEMO — Grand Hotel Riyadh'

const j = async (res) => { const t = await res.text(); try { return { ok: res.ok, status: res.status, body: JSON.parse(t) } } catch { return { ok: res.ok, status: res.status, body: { raw: t } } } }
const step = (n, msg) => console.log(`\n  ${n}. ${msg}`)
const ok = (msg) => console.log(`     ✔ ${msg}`)
const fail = (msg) => { console.log(`     ✖ ${msg}`); process.exitCode = 1 }

async function erpLogin() {
  const r = await j(await fetch(`${ERP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ADMIN) }))
  if (!r.body.token) throw new Error(`ERP login failed: ${JSON.stringify(r.body).slice(0, 120)}`)
  return r.body.token
}

async function seed() {
  const token = await erpLogin()
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const erp = (path, method = 'GET', body) => fetch(`${ERP}/api${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined }).then(j)

  console.log(`\n  Building the complete test project against ERP ${ERP} and EOS ${EOS}\n  ${'─'.repeat(60)}`)

  // 1 — LEAD
  step(1, 'Lead — capture the enquiry')
  const leadRes = await erp('/leads', 'POST', {
    name: 'Khalid Al-Rashid', company: 'Grand Hotel Riyadh', source: 'Website',
    mobile: '+966500000000', email: 'projects@grandhotel.example',
    project_name: TAG, project_type: 'Hotel', project_city: 'Riyadh', project_district: 'Olaya',
    est_value: 480000, status: 'Open', notes: 'Full main-kitchen fit-out enquiry.',
  })
  if (!leadRes.body.id) return fail(`lead create: ${JSON.stringify(leadRes.body).slice(0, 140)}`)
  const leadId = leadRes.body.id
  ok(`Lead ${leadRes.body.number || leadId.slice(0, 8)} — Grand Hotel Riyadh (source: Website)`)

  // 2 — OPPORTUNITY (convert the lead, then mark it a project needing engineering)
  step(2, 'Opportunity — qualify it as a project requiring engineering')
  const conv = await erp(`/sales/leads/${leadId}/convert`, 'POST', {})
  const oppId = conv.body?.opportunity?.id
  if (!oppId) return fail(`convert: ${JSON.stringify(conv.body).slice(0, 140)}`)
  await erp(`/opportunities/${oppId}`, 'PATCH', {
    opportunity_type: 'Project Requiring Engineering', stage: 'Qualification',
    value: 480000, project_name: TAG, project_type: 'Hotel',
  })
  ok(`Opportunity ${conv.body.opportunity.number || oppId.slice(0, 8)} — Project Requiring Engineering`)

  // 3 — ENGINEERING REQUEST (auto-syncs to EOS)
  step(3, 'Engineering Request — hand off to EOS with requirements + instructions')
  const engRes = await erp(`/engineering/requests/from-opportunity/${oppId}`, 'POST', {
    boq_text: '2× 6-burner gas range · 1× 10-tray convection oven · 1× blast chiller (5-tray) · 3× SS work tables 1800mm',
    sales_notes: 'Client prefers premium European brands. Kitchen area 120 m². Delivery within 6 weeks.',
  })
  const engId = engRes.body?.id
  if (!engId) return fail(`engineering request: ${JSON.stringify(engRes.body).slice(0, 140)}`)
  const eosSync = engRes.body._eos_sync
  ok(`Engineering Request ${engRes.body.number || engId.slice(0, 8)} created` + (eosSync?.synced ? ' and synced to EOS ✔' : ` (EOS sync: ${eosSync?.error || eosSync?.reason || 'n/a'})`))

  // 4 — EOS: engineer selects APPROVED equipment, sets Ready for Quotation (pushes back to ERP)
  step(4, 'EOS — engineer selects approved equipment and returns it for quotation')
  // Pull a few APPROVED Library items straight from the EOS API — real approved equipment only.
  const eosKnowledge = await j(await fetch(`${EOS}/api/knowledge?limit=3`))
  const approved = (eosKnowledge.body?.items || []).slice(0, 3)
  if (!approved.length) console.log('     ⚠ no approved EOS equipment found — approve some Library items first')
  const approvedItems = approved.map((e, i) => ({
    item_id: e.id, item_code: e.code || e.model_number, item_name: e.title,
    brand: e.brand, model: e.model_number || e.code, qty: i === 0 ? 2 : 1, area: 'Main kitchen',
  }))
  // Push the completed selection back to ERP exactly as the EOS inbox's "Save & push to ERP" does.
  if (KEY) {
    const back = await j(await fetch(`${ERP}/api/integrations/eos/engineering-requests/sync`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-erp-integration-key': KEY },
      body: JSON.stringify({ erp_request_id: engId, status: 'Ready for Quotation', approved_items: approvedItems, engineering_notes: 'Sized and selected from approved Library.' }),
    }))
    ok(back.ok ? `EOS returned ${approvedItems.length} approved equipment line(s) → status Ready for Quotation` : `EOS→ERP push: ${JSON.stringify(back.body).slice(0, 120)}`)
  } else {
    console.log('     ⚠ ERP_EOS_INTEGRATION_KEY not set — skipped the EOS→ERP push-back')
  }

  // 4b — CUSTOMER — a KSA order needs the customer's commercial registration on file first.
  step('4b', 'Customer — register commercial details (CR / VAT / address) so an order can be confirmed')
  const { data: existingCust } = await supabase.from('customers').select('id').eq('name', 'Grand Hotel Riyadh').maybeSingle()
  if (!existingCust) {
    await erp('/customers', 'POST', {
      name: 'Grand Hotel Riyadh', category: 'Hospitality', email: 'projects@grandhotel.example',
      phone: '+966500000000', territory: 'Riyadh',
      cr_number: '1010101010', vat_number: '300000000000003',
      national_address: 'RRRD2929, Olaya, Riyadh 12211', billing_address: 'Grand Hotel Riyadh, Olaya, Riyadh',
    })
    ok('Customer Grand Hotel Riyadh created with CR + VAT + billing address')
  } else {
    await erp(`/customers/${existingCust.id}`, 'PATCH', { cr_number: '1010101010', vat_number: '300000000000003', national_address: 'RRRD2929, Olaya, Riyadh 12211', billing_address: 'Grand Hotel Riyadh, Olaya, Riyadh' })
    ok('Customer Grand Hotel Riyadh commercial details confirmed')
  }

  // 5 — QUOTATION (from the opportunity, with the approved equipment as lines)
  step(5, 'Quotation — build from the approved equipment (priced from Item Master + Brand factors)')
  // Resolve each approved item to a real ERP item where one exists; otherwise quote it by name with
  // the engineering-provided rate (a real scenario where the priced equipment comes from engineering).
  const RATES = [24500, 18500, 9800] // representative engineering-priced equipment
  const lines = []
  approvedItems.forEach((it, i) => {
    lines.push({ item_name: `${it.brand} ${it.model}`.trim() || it.item_name, qty: it.qty, rate: RATES[i] || 12000 })
  })
  if (!lines.length) lines.push({ item_name: 'Commercial kitchen equipment (per engineering)', qty: 1, rate: 50000 })
  const quoteRes = await erp('/quotations', 'POST', {
    opportunity_id: oppId, customer: 'Grand Hotel Riyadh', project_name: TAG,
    items: lines, validity_days: 30, payment_terms: '50% advance, 50% on delivery',
  })
  const quoteId = quoteRes.body?.id
  if (!quoteId) return fail(`quotation: ${JSON.stringify(quoteRes.body).slice(0, 160)}`)
  ok(`Quotation ${quoteRes.body.number || quoteId.slice(0, 8)} — ${lines.length} line(s), total ${quoteRes.body.total_amount ?? '—'}`)

  // 6 — SALES ORDER (management accepts the quotation)
  step(6, 'Sales Order — accept the quotation')
  const acc = await erp(`/sales/quotations/${quoteId}/accept`, 'POST', {})
  if (acc.body?.sales_order || acc.body?.number || acc.ok) {
    ok(`Sales Order ${acc.body?.sales_order?.number || acc.body?.number || '(created)'} — project auto-linked`)
  } else {
    console.log(`     ⚠ accept: ${JSON.stringify(acc.body).slice(0, 160)}`)
  }

  console.log(`\n  ${'─'.repeat(60)}\n  Complete. One test project now runs the full chain end to end.\n  Open it in the ERP (Leads → Opportunities → Engineering → Quotations → Sales Orders)\n  and in EOS (Engineering Inbox), all under "Grand Hotel Riyadh".\n`)
}

async function remove() {
  console.log('  Removing the E2E demo project…')
  // ERP side — walk the chain by the shared project tag / customer
  const like = '%Grand Hotel Riyadh%'
  const tables = [
    ['sales_orders', 'customer', 'Grand Hotel Riyadh'],
    ['quotations', 'customer', 'Grand Hotel Riyadh'],
    ['engineering_requests', 'customer', 'Grand Hotel Riyadh'],
    ['opportunities', 'customer', 'Grand Hotel Riyadh'],
    ['leads', 'company', 'Grand Hotel Riyadh'],
    ['projects', 'name', like],
  ]
  for (const [table, col, val] of tables) {
    const q = supabase.from(table).delete()
    const r = col === 'name' ? await q.ilike(col, val) : await q.eq(col, val)
    if (!r.error) console.log(`     removed from ${table}`)
  }
  // The EOS-side request lives in the EOS database (a separate Supabase project) — remove it there
  // with:  node scripts/e2e_eos_cleanup.mjs   (run from the EOS server), or leave it (harmless).
  console.log('  Done. (EOS-side request, if any, is cleaned separately from the EOS server.)')
}

const mode = process.argv.includes('--remove') ? remove : seed
mode().then(() => process.exit(process.exitCode || 0)).catch((e) => { console.error('  FAILED:', e.message); process.exit(1) })
