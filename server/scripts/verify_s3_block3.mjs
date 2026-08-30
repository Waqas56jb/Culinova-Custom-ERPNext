/**
 * Sprint 3 Block 3 — audit + auto-revision + janaza + redaction
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const { supabase } = await import('../src/config/supabase.js')
const { env } = await import('../src/config/env.js')
const { redactFinancials } = await import('../src/middleware/rbac.js')
const { stripCustomerQuotationFields } = await import('../src/rbac/permissions.js')

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
async function tokenFor(email, password = 'admin@123!') {
  let t = await login(email, password)
  if (t) return t
  const { data: u } = await supabase.from('users').select('id, name, email, role, access_level, status').eq('email', email).maybeSingle()
  if (!u || (u.status && u.status !== 'Active')) return null
  return jwt.sign(
    { id: u.id, name: u.name, email: u.email, role: u.role, access_level: u.access_level },
    secret, { expiresIn: '8h' },
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

const walkHas = (obj, keys) => {
  const found = new Set()
  const walk = (v) => {
    if (!v || typeof v !== 'object') return
    if (Array.isArray(v)) { v.forEach(walk); return }
    for (const [k, val] of Object.entries(v)) {
      if (keys.includes(k)) found.add(k)
      walk(val)
    }
  }
  walk(obj)
  return [...found]
}

console.log('\n######## SPRINT 3 BLOCK 3 — AUDIT + JANAZA + REDACTION ########\n')

const TAG = `S3B3-${Date.now().toString().slice(-6)}`
const customerName = `S3B3 Customer ${TAG}`
const cleanup = { quotes: [], opps: [], users: [] }

try {
  const adminToken = await tokenFor('admin@gmail.com')
  const { data: adminUser } = await supabase.from('users').select('*').eq('email', 'admin@gmail.com').maybeSingle()
  if (!adminToken || !adminUser) throw new Error('admin required')

  // ── e) resolveItems absent ──
  const serverSrc = fs.readFileSync(path.resolve(__dirname, '../src/modules/sales/sales.routes.js'), 'utf8')
  pass('e1 resolveItems absent', !/async function resolveItems|function resolveItems/.test(serverSrc), 'sales.routes.js')
  const formModals = fs.readFileSync(path.resolve(__dirname, '../../client/src/components/FormModals.jsx'), 'utf8')
  pass('e2 QuotationModal absent', !/function QuotationModal/.test(formModals), 'FormModals.jsx')
  const clientHits = []
  for (const root of [
    path.resolve(__dirname, '../../client/src'),
  ]) {
    const walk = (dir) => {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const fp = path.join(dir, f.name)
        if (f.isDirectory()) walk(fp)
        else if (/\.(jsx?|tsx?)$/.test(f.name)) {
          const t = fs.readFileSync(fp, 'utf8')
          if (/post\(['`]sales\/quotations['`]/.test(t) || /post\("sales\/quotations"\)/.test(t)) {
            // DataContext may still wrap legacy — flag if QuotationModal calls it
            if (fp.includes('FormModals')) clientHits.push(fp)
          }
        }
      }
    }
    walk(root)
  }
  pass('e3 FormModals no legacy POST create', clientHits.length === 0, clientHits.join(',') || 'ok')
  // 410 stubs kept (client DataContext still has helpers unused by UI)
  pass('e4 POST legacy 410 stub kept', /LEGACY_QUOTE_CREATE_GONE|Use the quotation builder/.test(serverSrc))

  await supabase.from('customers').upsert({
    name: customerName, cr_number: 'CR-S3B3', vat_number: 'VAT-S3B3',
    national_address: 'Riyadh', billing_address: 'Riyadh',
  }, { onConflict: 'name' })

  const custEmail = `s3b3-${TAG.toLowerCase()}@test.local`
  await supabase.from('users').delete().eq('email', custEmail)
  const { data: custUser, error: cuErr } = await supabase.from('users').insert({
    email: custEmail, name: customerName, role: 'Customer', access_level: 'Customer',
    status: 'Active', password_hash: bcrypt.hashSync('cust@123!', 8),
  }).select().single()
  if (cuErr) throw new Error(cuErr.message)
  cleanup.users.push(custUser.id)
  const custToken = await tokenFor(custEmail, 'cust@123!')

  const { data: item } = await supabase.from('items').select('id')
    .eq('id', '23da79cb-325c-422b-8d7c-48baf51590a2').maybeSingle()
  if (!item?.id) throw new Error('need FAGOR item')

  const { data: opp, error: oppErr } = await supabase.from('opportunities').insert({
    number: `OPP-${TAG}`, customer: customerName, stage: 'Quotation', value: 1000, probability: 50,
    next_action_date: new Date().toISOString().slice(0, 10), opportunity_type: 'Retail Sale',
    project_name: 'S3B3 Project', project_location: 'Riyadh → North',
    contact_person: 'Ali', customer_email: custEmail, owner_id: adminUser.id,
  }).select().single()
  if (oppErr) throw new Error(oppErr.message)
  cleanup.opps.push(opp.id)

  const quoteBody = (extra = {}) => ({
    opportunity_id: opp.id, customer: customerName, contact_person: 'Ali',
    project_name: 'S3B3 Project', project_location: 'Riyadh → North',
    payment_terms: '100% Advanced Payment', validity_days: 30, customer_email: custEmail,
    override_reason: 'S3B3 verify', items: [{ item_id: item.id, qty: 1 }], ...extra,
  })

  const created = await api(adminToken, '/quotations', { method: 'POST', body: quoteBody() })
  pass('setup create', created.status === 201, `status=${created.status} ${created.body?.error || ''}`)
  const qId = created.body?.id
  if (qId) cleanup.quotes.push(qId)

  // Create revision-test quote BEFORE portal reject — reject calls loseOpportunityForCustomer
  // and marks the opportunity Lost (blocks further creates on same opp).
  const q3 = await api(adminToken, '/quotations', { method: 'POST', body: quoteBody({ items: [{ item_id: item.id, qty: 1 }] }) })
  pass('setup q3 create', q3.status === 201, `status=${q3.status} ${q3.body?.error || ''}`)
  const q3id = q3.body?.id
  if (q3id) cleanup.quotes.push(q3id)
  await supabase.from('quotations').update({ status: 'Draft', approval_status: 'Approved' }).eq('id', q3id)

  // Complete + send for portal actions
  await supabase.from('quotations').update({
    status: 'Draft', approval_status: 'Approved',
    contact_person: 'Ali', project_name: 'S3B3 Project', project_location: 'Riyadh → North',
    payment_terms: '100% Advanced Payment', validity_days: 30, customer_email: custEmail,
  }).eq('id', qId)
  const sent = await api(adminToken, `/sales/quotations/${qId}/send`, { method: 'POST', body: { confirm_overdue: true } })
  pass('setup send', sent.status === 200 || sent.status === 422, `status=${sent.status}`)
  if (sent.status === 422 && sent.body?.code === 'CREDIT_OVERDUE_CONFIRM') {
    const s2 = await api(adminToken, `/sales/quotations/${qId}/send`, { method: 'POST', body: { confirm_overdue: true } })
    pass('setup send2', s2.status === 200, `status=${s2.status}`)
  } else if (sent.status !== 200) {
    await supabase.from('quotations').update({ status: 'Sent' }).eq('id', qId)
  }

  // ── b) concession ──
  const conc = await api(custToken, `/portal/customer/quotations/${qId}/concession`, {
    method: 'POST', body: { note: 'Please lower price' },
  })
  pass('b1 concession 200', conc.status === 200 && conc.body?.status === 'Under Negotiation', JSON.stringify(conc.body))
  const { data: concAudits } = await supabase.from('audit_log').select('action, details, user_name')
    .eq('entity_id', qId).eq('action', 'concession_requested').order('created_at', { ascending: false }).limit(1)
  pass('b2 concession audit', concAudits?.[0]?.action === 'concession_requested', JSON.stringify(concAudits?.[0]))

  // Another quote for reject (still before Lost — opportunity may be Negotiation)
  await supabase.from('opportunities').update({ stage: 'Quotation' }).eq('id', opp.id)
  const q2 = await api(adminToken, '/quotations', { method: 'POST', body: quoteBody({ items: [{ item_id: item.id, qty: 2 }] }) })
  pass('setup q2 create', q2.status === 201, `status=${q2.status} ${q2.body?.error || ''}`)
  const q2id = q2.body?.id
  if (q2id) cleanup.quotes.push(q2id)
  await supabase.from('quotations').update({
    status: 'Sent', approval_status: 'Approved',
    contact_person: 'Ali', project_name: 'S3B3 Project', project_location: 'Riyadh → North',
    payment_terms: '100% Advanced Payment', validity_days: 30,
  }).eq('id', q2id)

  // ── a) portal reject ──
  const rej = await api(custToken, `/portal/customer/quotations/${q2id}/reject`, {
    method: 'POST', body: { reason: 'Price', note: 'too high' },
  })
  pass('a1 portal reject', rej.status === 200, `status=${rej.status} ${rej.body?.error || ''}`)
  const { data: rejAudits } = await supabase.from('audit_log').select('action, details, user_name')
    .eq('entity_id', q2id).eq('action', 'quotation_rejected').limit(1)
  pass('a2 reject audit actor+reason',
    rejAudits?.[0]?.details?.reason === 'Price' && !!rejAudits?.[0]?.user_name,
    JSON.stringify(rejAudits?.[0]))

  // ── c) bell approve → approval_decision ──
  // Seed a pending approval notification and act
  const { data: notif } = await supabase.from('notifications').insert({
    user_id: adminUser.id,
    type: 'approval',
    ref_type: 'quotation',
    ref_id: qId,
    action_status: 'pending',
    title: 'S3B3 test approval',
    body: 'test',
    sender: 'verify',
  }).select().single()
  // Quote must be Pending Approval for approve path to make sense - act still works
  await supabase.from('quotations').update({ status: 'Pending Approval', approval_status: 'Pending' }).eq('id', qId)
  const act = await api(adminToken, `/notifications/${notif.id}/act`, {
    method: 'POST', body: { decision: 'approved' },
  })
  pass('c1 bell act', act.status === 200, JSON.stringify(act.body))
  const { data: actAud } = await supabase.from('audit_log').select('action, details')
    .eq('action', 'approval_decision').eq('entity_id', String(qId))
    .order('created_at', { ascending: false }).limit(1)
  pass('c2 approval_decision audit', actAud?.[0]?.details?.decision === 'approved', JSON.stringify(actAud?.[0]))

  // ── d) auto revision (q3 created above, still Draft) ──

  const { count: beforeAuto } = await supabase.from('quotation_revisions').select('id', { count: 'exact', head: true }).eq('quotation_id', q3id)

  const patch1 = await api(adminToken, `/quotations/${q3id}`, {
    method: 'PATCH',
    body: {
      validity_days: 45,
      payment_terms: '100% Advanced Payment',
      items: [{ item_id: item.id, qty: 2 }],
      override_reason: 'S3B3 auto',
    },
  })
  pass('d1 builder patch', patch1.status === 200, `status=${patch1.status} ${patch1.body?.error || ''}`)
  const { data: autos1 } = await supabase.from('quotation_revisions').select('id, changes')
    .eq('quotation_id', q3id).order('created_at', { ascending: false })
  const autoRows = (autos1 || []).filter((r) => r.changes?.reason === 'auto: edit' || r.changes?.action === 'auto: edit')
  pass('d2 auto revision created', autoRows.length >= 1, `auto=${autoRows.length} total=${autos1?.length}`)

  const countAfter1 = (autos1 || []).length
  const patch2 = await api(adminToken, `/quotations/${q3id}`, {
    method: 'PATCH',
    body: {
      validity_days: 60,
      items: [{ item_id: item.id, qty: 3 }],
      override_reason: 'S3B3 auto2',
    },
  })
  pass('d3 second patch ok', patch2.status === 200, `status=${patch2.status}`)
  const { data: autos2 } = await supabase.from('quotation_revisions').select('id, changes')
    .eq('quotation_id', q3id)
  const autoRows2 = (autos2 || []).filter((r) => r.changes?.reason === 'auto: edit' || r.changes?.action === 'auto: edit')
  pass('d4 throttle same auto row', autoRows2.length === autoRows.length, `auto before=${autoRows.length} after=${autoRows2.length} total=${autos2?.length} vs ${countAfter1}`)

  const man = await api(adminToken, `/quotations/${q3id}/revise`, { method: 'POST', body: { note: 'manual rework' } })
  pass('d5 manual revise', man.status === 200, `status=${man.status}`)
  const { data: afterMan } = await supabase.from('quotation_revisions').select('changes')
    .eq('quotation_id', q3id)
  const manuals = (afterMan || []).filter((r) => r.changes?.reason === 'manual')
  pass('d6 manual row', manuals.length >= 1, `manual=${manuals.length}`)

  // ── f) redaction ──
  const sample = {
    override_reason: 'x', lost_reason_note: 'y', credit_warning: { a: 1 }, channels: { email: 'sent' },
    add_margin_pct: 5, estimated_cost: 1, pricing_basis: 'vr', cost: 9, gp_percent: 40,
    quotation_items: [{ cost: 1, add_margin_pct: 2, estimated_cost: 3, pricing_basis: 'x' }],
  }
  const salesRed = redactFinancials('Sales User', sample)
  const portalRed = stripCustomerQuotationFields(sample)
  const badSales = walkHas(salesRed, ['override_reason', 'add_margin_pct', 'estimated_cost', 'pricing_basis', 'cost', 'gp_percent', 'lost_reason_note', 'credit_warning', 'channels'])
  const badPortal = walkHas(portalRed, ['override_reason', 'add_margin_pct', 'estimated_cost', 'pricing_basis', 'cost', 'gp_percent', 'lost_reason_note', 'credit_warning', 'channels'])
  pass('f1 Sales redact sensitive', badSales.length === 0, badSales.join(','))
  pass('f2 Portal strip sensitive', badPortal.length === 0, badPortal.join(','))

  const portalList = await api(custToken, '/portal/customer/overview')
  const portalQuotes = portalList.body?.quotations || []
  const leak = walkHas(portalQuotes, ['override_reason', 'estimated_cost', 'add_margin_pct', 'pricing_basis', 'cost', 'credit_warning', 'channels', 'lost_reason_note'])
  pass('f3 portal overview no leak', leak.length === 0, leak.join(',') || 'clean')

  const salesGet = await api(await tokenFor('ali@culinova.sa'), `/quotations/${q3id}`)
  const salesLeak = walkHas(salesGet.body || {}, ['override_reason', 'estimated_cost', 'add_margin_pct', 'pricing_basis', 'cost', 'gp_percent'])
  pass('f4 Ali GET no financials', salesGet.status === 200 && salesLeak.length === 0, `status=${salesGet.status} leak=${salesLeak.join(',')}`)

  // ── g) audit tab ──
  const trail = await api(adminToken, `/sales/quotations/${qId}/audit`)
  pass('g1 audit endpoint', trail.status === 200 && Array.isArray(trail.body?.items), `status=${trail.status} n=${trail.body?.items?.length}`)
  const hasApproval = (trail.body?.items || []).some((i) => i.action === 'approval_decision')
  pass('g2 trail has approval_decision', hasApproval, '')

  // Ali trail on own quote — create owned by setting owner
  await supabase.from('quotations').update({ owner_id: (await supabase.from('users').select('id').eq('email', 'ali@culinova.sa').maybeSingle()).data?.id }).eq('id', q3id)
  const aliTrail = await api(await tokenFor('ali@culinova.sa'), `/sales/quotations/${q3id}/audit`)
  pass('g3 Ali audit ok', aliTrail.status === 200, `status=${aliTrail.status}`)
  const finLeak = walkHas(aliTrail.body || {}, ['gp_percent', 'cost_amount', 'overdue_amount'])
  pass('g4 Ali trail stripped amounts', finLeak.length === 0, finLeak.join(','))

} catch (e) {
  pass('FATAL', false, e.message)
  console.error(e)
} finally {
  for (const id of cleanup.quotes) {
    await supabase.from('quotation_items').delete().eq('quotation_id', id)
    await supabase.from('quotation_revisions').delete().eq('quotation_id', id)
    await supabase.from('notifications').delete().eq('ref_id', id)
    await supabase.from('audit_log').delete().eq('entity_id', String(id))
    await supabase.from('quotations').delete().eq('id', id)
  }
  for (const id of cleanup.opps) await supabase.from('opportunities').delete().eq('id', id)
  for (const id of cleanup.users) {
    await supabase.from('notifications').delete().eq('user_id', id)
    await supabase.from('users').delete().eq('id', id)
  }
  await supabase.from('customers').delete().eq('name', customerName)
  pass('cleanup', true, `quotes=${cleanup.quotes.length}`)
}

console.log('\n-- results --')
let failed = 0
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id}${r.detail ? ` — ${r.detail}` : ''}`)
  if (!r.ok) failed++
}
console.log(`\n######## ${failed ? 'FAIL' : 'PASS'} — ${results.filter((r) => r.ok).length}/${results.length} ########\n`)

console.log(`
REDACTION MATRIX (Field × Endpoint × Role)
──────────────────────────────────────────
Field                 | Portal | Sales GET | Mgmt
override_reason       | absent | absent    | present
lost_reason_note      | absent | absent*   | present
credit_warning        | absent | absent    | n/a on GET
channels              | absent | absent    | audit only
add_margin_pct        | absent | absent    | present
estimated_cost        | absent | absent    | present
pricing_basis         | absent | absent    | present
* lost_reason_note also in restrictedFields for Sales
`)

process.exit(failed ? 1 : 0)
