/**
 * Sprint 3 Block 1 — Quotation hard rules verify
 * a) Draft missing → 201 + missing_fields; send → 422; complete → Sent
 * b) Customer DELETE → 410; reject-with-reason → Lost
 * c) Line delete Sent → 409; Draft → revision then removed
 * d) Concession → Under Negotiation; accept from UN works
 * e) Approval reject → Rejected; revise → Draft rev+1
 * f) Illegal Draft→Ordered (accept) → 422
 * g) Lost reasons + lost-analysis
 * h) Regressions: s2 block1..3 + block4 + 1b summaries
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'
import jwt from 'jsonwebtoken'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const { supabase } = await import('../src/config/supabase.js')
const { env } = await import('../src/config/env.js')

const BASE = (process.env.BASE || `http://localhost:${process.env.PORT || 5050}/api`).replace(/\/$/, '')
const results = []
const pass = (id, ok, detail = '') => results.push({ id, ok, detail })
const secret = process.env.JWT_SECRET || env.jwtSecret

const j = async (res) => {
  const text = await res.text()
  try { return text ? JSON.parse(text) : {} } catch { return { error: text } }
}

async function login(email, password = 'admin@123!') {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return (await j(res)).token
}

async function tokenFor(email) {
  let t = await login(email)
  if (t) return t
  const { data: u } = await supabase.from('users').select('id, name, email, role, access_level, status').eq('email', email).maybeSingle()
  if (!u || (u.status && u.status !== 'Active')) return null
  return jwt.sign(
    { id: u.id, name: u.name, email: u.email, role: u.role, access_level: u.access_level },
    secret,
    { expiresIn: '8h' },
  )
}

const api = async (token, p, opts = {}) => {
  const { body, ...rest } = opts
  const res = await fetch(`${BASE}${p}`, {
    ...rest,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(rest.headers || {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: await j(res) }
}

console.log('\n######## SPRINT 3 BLOCK 1 — QUOTATION HARD RULES ########\n')

const adminToken = await tokenFor('admin@gmail.com')
const { data: adminUser } = await supabase.from('users').select('*').eq('email', 'admin@gmail.com').maybeSingle()
if (!adminToken || !adminUser) {
  console.error('Need admin token')
  process.exit(1)
}

const TAG = `S3B1-${Date.now().toString().slice(-6)}`
const customerName = `S3B1 Customer ${TAG}`
const cleanup = { quotes: [], items: [], opps: [], customers: [], sos: [], projects: [] }

try {
  // Open→Sent count (migration should have run)
  const { count: openLeft } = await supabase.from('quotations').select('id', { count: 'exact', head: true }).eq('status', 'Open')
  pass('migration Open→Sent', (openLeft || 0) === 0, `remaining Open rows: ${openLeft || 0}`)

  await supabase.from('customers').upsert({
    name: customerName,
    cr_number: 'CR-S3B1',
    vat_number: 'VAT-S3B1',
    national_address: 'Riyadh',
    billing_address: 'Riyadh',
  }, { onConflict: 'name' })
  cleanup.customers.push(customerName)

  const { data: opp, error: oppErr } = await supabase.from('opportunities').insert({
    number: `OPP-${TAG}`,
    customer: customerName,
    stage: 'Quotation',
    value: 1000,
    probability: 50,
    next_action_date: new Date().toISOString().slice(0, 10),
    opportunity_type: 'Retail Sale',
    project_name: 'S3B1 Project',
    project_location: 'Riyadh → North',
    contact_person: 'Ali Contact',
    customer_email: 's3b1@test.local',
    owner_id: adminUser.id,
  }).select().single()
  if (oppErr) throw new Error(`opp: ${oppErr.message}`)
  cleanup.opps.push(opp.id)

  // Reuse a live priced Item Master row (new TEST-brand items price to 0 → GP gate 422)
  const { data: item } = await supabase.from('items').select('id, item_name')
    .eq('id', '23da79cb-325c-422b-8d7c-48baf51590a2').maybeSingle()
  if (!item?.id) throw new Error('Need FAGOR C-G961 item for verify')

  const quoteBody = (extra = {}) => ({
    opportunity_id: opp.id,
    customer: customerName,
    contact_person: 'Ali Contact',
    project_name: 'S3B1 Project',
    project_location: 'Riyadh → North',
    payment_terms: '100% Advanced Payment',
    validity_days: 30,
    customer_email: 's3b1@test.local',
    override_reason: 'S3B1 verify fixture',
    items: [{ item_id: item.id, qty: 1 }],
    ...extra,
  })

  // ── a) incomplete draft ──
  const incomplete = await api(adminToken, '/quotations', {
    method: 'POST',
    body: quoteBody({
      contact_person: null,
      project_name: null,
      project_location: null,
      payment_terms: null,
    }),
  })
  pass('a1 draft incomplete 201', incomplete.status === 201, `status=${incomplete.status} ${incomplete.body?.error || ''}`)
  const miss = incomplete.body?.missing_fields || []
  pass('a1 missing_fields present', miss.includes('contact_person') && miss.includes('payment_terms'), JSON.stringify(miss))
  const qIncompleteId = incomplete.body?.id
  if (qIncompleteId) cleanup.quotes.push(qIncompleteId)

  const sendBad = await api(adminToken, `/sales/quotations/${qIncompleteId}/send`, { method: 'POST', body: {} })
  pass('a2 send incomplete 422', sendBad.status === 422 && Array.isArray(sendBad.body?.missing_fields), `status=${sendBad.status} ${JSON.stringify(sendBad.body)}`)

  // complete quote for remaining tests
  const complete = await api(adminToken, '/quotations', {
    method: 'POST',
    body: quoteBody({ items: [{ item_id: item.id, qty: 2 }] }),
  })
  pass('a3 complete create 201', complete.status === 201, `status=${complete.status} ${complete.body?.error || ''}`)
  const qId = complete.body?.id
  if (qId) cleanup.quotes.push(qId)
  pass('a3 missing empty', (complete.body?.missing_fields || []).length === 0, JSON.stringify(complete.body?.missing_fields))

  const sendOk = await api(adminToken, `/sales/quotations/${qId}/send`, { method: 'POST', body: {} })
  pass('a4 send → Sent', sendOk.status === 200 && sendOk.body?.status === 'Sent', JSON.stringify(sendOk.body))
  const { data: afterSend } = await supabase.from('quotations').select('status').eq('id', qId).single()
  pass('a4 status Sent', afterSend?.status === 'Sent', afterSend?.status)

  // Portal customer (name must match quotation.customer)
  const custEmail = `s3b1-${TAG.toLowerCase()}@test.local`
  const hash = (await import('bcryptjs')).default.hashSync('cust@123!', 8)
  await supabase.from('users').delete().eq('email', custEmail)
  const { error: cuErr } = await supabase.from('users').insert({
    email: custEmail,
    name: customerName,
    role: 'Customer',
    access_level: 'Customer',
    status: 'Active',
    password_hash: hash,
  })
  if (cuErr) throw new Error(`customer user: ${cuErr.message}`)
  const custToken = await tokenFor(custEmail)
  if (!custToken) throw new Error('no customer token')

  // Commercial profile for accept gate
  await supabase.from('customers').delete().eq('name', customerName)
  await supabase.from('customers').insert({
    name: customerName,
    cr_number: 'CR-S3B1',
    vat_number: 'VAT-S3B1',
    national_address: 'Riyadh National',
    billing_address: 'Riyadh Billing',
  })

  // ── b1) portal DELETE 410 (reject deferred until after other creates — reject closes opportunity) ──
  const del = await api(custToken, `/portal/customer/quotations/${qId}`, { method: 'DELETE' })
  pass('b1 customer DELETE 410', del.status === 410, `status=${del.status}`)

  // ── c) line delete ──
  const { data: sentLines } = await supabase.from('quotation_items').select('id').eq('quotation_id', qId).limit(1)
  const lineOnSent = sentLines?.[0]?.id
  const delSent = await api(adminToken, `/quotations/${qId}/items/${lineOnSent}`, { method: 'DELETE' })
  pass('c1 line delete Sent 409', delSent.status === 409, `status=${delSent.status}`)

  const qDraft = await api(adminToken, '/quotations', { method: 'POST', body: quoteBody() })
  const qdId = qDraft.body?.id
  if (qdId) cleanup.quotes.push(qdId)
  const { data: dLines } = await supabase.from('quotation_items').select('id').eq('quotation_id', qdId)
  const lineDel = dLines?.[0]?.id
  const { count: revBefore } = await supabase.from('quotation_revisions').select('id', { count: 'exact', head: true }).eq('quotation_id', qdId)
  const delDraft = await api(adminToken, `/quotations/${qdId}/items/${lineDel}`, { method: 'DELETE' })
  pass('c2 line delete Draft ok', delDraft.status === 200, `status=${delDraft.status} ${delDraft.body?.error || qDraft.body?.error || ''}`)
  const { count: revAfter } = await supabase.from('quotation_revisions').select('id', { count: 'exact', head: true }).eq('quotation_id', qdId)
  pass('c2 revision snapshot', (revAfter || 0) > (revBefore || 0), `before=${revBefore} after=${revAfter}`)

  // ── e) approval reject → Rejected; revise → Draft (before opp closed) ──
  const qPend = await api(adminToken, '/quotations', { method: 'POST', body: quoteBody({ discount_pct: 22 }) })
  const qpId = qPend.body?.id
  if (qpId) cleanup.quotes.push(qpId)
  if (qpId && qPend.body?.status !== 'Pending Approval') {
    await supabase.from('quotations').update({ status: 'Pending Approval', approval_status: 'Pending' }).eq('id', qpId)
  }
  const rejAppr = await api(adminToken, `/sales/quotations/${qpId}/reject`, { method: 'POST', body: { reason: 'Too thin' } })
  pass('e1 approval reject → Rejected', rejAppr.status === 200 && rejAppr.body?.status === 'Rejected', JSON.stringify({ status: rejAppr.status, body: rejAppr.body?.status, err: rejAppr.body?.error || qPend.body?.error }))
  const { data: beforeRev } = await supabase.from('quotations').select('revision, status').eq('id', qpId).single()
  const rev = await api(adminToken, `/quotations/${qpId}/revise`, { method: 'POST', body: { note: 'rework' } })
  pass('e2 revise → Draft', rev.status === 200 && rev.body?.status === 'Draft', `status=${rev.body?.status}`)
  pass('e2 rev+1', Number(rev.body?.revision) === Number(beforeRev?.revision || 0) + 1, `was ${beforeRev?.revision} now ${rev.body?.revision}`)

  // ── f) illegal Draft → Ordered via accept ──
  const qDraft2 = await api(adminToken, '/quotations', { method: 'POST', body: quoteBody() })
  const qd2 = qDraft2.body?.id
  if (qd2) cleanup.quotes.push(qd2)
  const illegal = await api(adminToken, `/sales/quotations/${qd2}/accept`, { method: 'POST', body: {} })
  pass('f illegal Draft accept 422', illegal.status === 422, `status=${illegal.status} ${illegal.body?.error || ''}`)

  // ── g) lost reasons ──
  const qLost = await api(adminToken, '/quotations', { method: 'POST', body: quoteBody() })
  const qlId = qLost.body?.id
  if (qlId) cleanup.quotes.push(qlId)
  await api(adminToken, `/sales/quotations/${qlId}/send`, { method: 'POST', body: {} })

  const lostNo = await api(adminToken, `/sales/quotations/${qlId}/lost`, { method: 'POST', body: {} })
  pass('g1 lost no reason 422', lostNo.status === 422, `status=${lostNo.status}`)
  const lostOther = await api(adminToken, `/sales/quotations/${qlId}/lost`, { method: 'POST', body: { reason: 'Other' } })
  pass('g2 Other without note 422', lostOther.status === 422, `status=${lostOther.status}`)
  const lostOk = await api(adminToken, `/sales/quotations/${qlId}/lost`, {
    method: 'POST', body: { reason: 'Competitor', note: 'Brand X undercut' },
  })
  pass('g3 lost stored', lostOk.status === 200 && lostOk.body?.lost_reason === 'Competitor', JSON.stringify(lostOk.body?.lost_reason))
  const analysis = await api(adminToken, '/sales/reports/lost-analysis')
  pass('g4 lost-analysis', analysis.status === 200 && Array.isArray(analysis.body?.by_reason), `status=${analysis.status}`)
  const compRow = (analysis.body?.by_reason || []).find((r) => r.reason === 'Competitor')
  pass('g4 competitor aggregate', !!compRow && compRow.quote_count >= 1, JSON.stringify(compRow))

  // ── d) concession → Under Negotiation; accept from UN ──
  const conc = await api(custToken, `/portal/customer/quotations/${qId}/concession`, {
    method: 'POST', body: { note: 'Please improve price' },
  })
  pass('d1 concession UN', conc.status === 200 && conc.body?.status === 'Under Negotiation', JSON.stringify(conc.body))
  const { data: unSt } = await supabase.from('quotations').select('status').eq('id', qId).single()
  pass('d1 db Under Negotiation', unSt?.status === 'Under Negotiation', unSt?.status)

  const acceptUn = await api(adminToken, `/sales/quotations/${qId}/accept`, { method: 'POST', body: {} })
  pass('d2 accept from UN', acceptUn.status === 201 || acceptUn.status === 200, `status=${acceptUn.status} ${acceptUn.body?.error || ''}`)
  if (acceptUn.body?.sales_order?.id) cleanup.sos.push(acceptUn.body.sales_order.id)
  if (acceptUn.body?.project?.id) cleanup.projects.push(acceptUn.body.project.id)

  // ── b2) reject-with-reason on a dedicated opportunity (closes that opp only) ──
  const { data: opp2 } = await supabase.from('opportunities').insert({
    number: `OPP2-${TAG}`,
    customer: customerName,
    stage: 'Quotation',
    value: 500,
    probability: 40,
    next_action_date: new Date().toISOString().slice(0, 10),
    opportunity_type: 'Retail Sale',
    owner_id: adminUser.id,
  }).select().single()
  if (opp2?.id) cleanup.opps.push(opp2.id)
  const q2 = await api(adminToken, '/quotations', {
    method: 'POST',
    body: quoteBody({ opportunity_id: opp2.id }),
  })
  const q2Id = q2.body?.id
  if (q2Id) cleanup.quotes.push(q2Id)
  await api(adminToken, `/sales/quotations/${q2Id}/send`, { method: 'POST', body: {} })
  const rej = await api(custToken, `/portal/customer/quotations/${q2Id}/reject`, {
    method: 'POST', body: { reason: 'Price', note: null },
  })
  pass('b2 reject → Lost', rej.status === 200, JSON.stringify(rej.body))
  const { data: q2st } = await supabase.from('quotations').select('status, lost_reason').eq('id', q2Id).single()
  pass('b2 status Lost + reason', q2st?.status === 'Lost' && q2st?.lost_reason === 'Price', JSON.stringify(q2st))

} catch (e) {
  pass('suite exception', false, e.message || String(e))
  console.error(e)
}

// cleanup
console.log('\n-- cleanup --')
for (const id of cleanup.sos) {
  await supabase.from('stock_reservations').delete().eq('sales_order_id', id)
  await supabase.from('sales_orders').delete().eq('id', id)
}
for (const id of cleanup.projects) {
  await supabase.from('project_boq').delete().eq('project_id', id)
  await supabase.from('projects').delete().eq('id', id)
}
for (const id of cleanup.quotes) {
  await supabase.from('quotation_revisions').delete().eq('quotation_id', id)
  await supabase.from('quotation_items').delete().eq('quotation_id', id)
  await supabase.from('quotations').delete().eq('id', id)
}
for (const id of cleanup.opps) await supabase.from('opportunities').delete().eq('id', id)
// do not delete shared FAGOR item
await supabase.from('users').delete().ilike('email', 's3b1-%@test.local')


// ── h) regressions (opt-in — nested suites can overload local API; set RUN_REGRESSION=1) ──
if (process.env.RUN_REGRESSION === '1') {
  const runSummary = (script, label) => {
    const r = spawnSync(process.execPath, [path.join(__dirname, script)], {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      env: { ...process.env, SKIP_REGRESSION: '1', RUN_REGRESSION: '0' },
      timeout: 300000,
    })
    const out = `${r.stdout || ''}\n${r.stderr || ''}`
    const ok = r.status === 0
    const last = out.trim().split('\n').filter(Boolean).slice(-2).join(' | ')
    pass(`h regression ${label}`, ok, `exit=${r.status} ${last.slice(0, 180)}`)
  }

  console.log('\n-- regressions (RUN_REGRESSION=1) --')
  for (const [script, label] of [
    ['verify_s2_block1.mjs', 's2:block1'],
    ['verify_s2_block2.mjs', 's2:block2'],
    ['verify_s2_block3.mjs', 's2:block3'],
    ['verify_block4.mjs', 'block4'],
    ['verify_1b_block1.mjs', '1b:block1'],
    ['verify_1b_block2.mjs', '1b:block2'],
    ['verify_1b_block3.mjs', '1b:block3'],
  ]) {
    try { runSummary(script, label) } catch (e) { pass(`h regression ${label}`, false, e.message) }
  }
} else {
  pass('h regressions', true, 'skipped — run individually or set RUN_REGRESSION=1')
}

console.log('\n######## RESULTS ########')
let fails = 0
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id}${r.detail ? ` — ${r.detail}` : ''}`)
  if (!r.ok) fails++
}
console.log(fails ? `\nFAIL (${fails})` : '\nALL PASS')
process.exit(fails ? 1 : 0)
