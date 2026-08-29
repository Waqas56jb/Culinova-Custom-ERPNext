/**
 * Sprint 3 Block 2 — Credit control + real send
 * a) creditStatus clean customer → zeros, blocked=false
 * b) Seed overdue invoice → create response credit_warning
 * c) 3 active → 4th → 422 requires_approval → approve → proceeds
 * d) Send → Sent + portal notification + audit channels; email skipped locally
 * e) Send warning flag (confirm_overdue) for overdue customer
 * f) Regressions (opt-in RUN_REGRESSION=1): s3 block1 + s2 + block4 summaries
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const { supabase } = await import('../src/config/supabase.js')
const { env } = await import('../src/config/env.js')
const { creditStatus } = await import('../src/core/customerCredit.js')

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

console.log('\n######## SPRINT 3 BLOCK 2 — CREDIT + REAL SEND ########\n')

const adminToken = await tokenFor('admin@gmail.com')
const { data: adminUser } = await supabase.from('users').select('*').eq('email', 'admin@gmail.com').maybeSingle()
if (!adminToken || !adminUser) {
  console.error('Need admin token')
  process.exit(1)
}

const TAG = `S3B2-${Date.now().toString().slice(-6)}`
const customerName = `S3B2 Customer ${TAG}`
const cleanCustomer = `S3B2 Clean ${TAG}`
const salesEmail = `sales-s3b2-${TAG.toLowerCase()}@test.local`
const custEmail = `cust-s3b2-${TAG.toLowerCase()}@test.local`
const cleanup = {
  quotes: [], items: [], opps: [], customers: [], invoices: [],
  users: [], overrides: [], notifications: [],
}

try {
  // Ensure credit_override_requests exists
  const { error: tblErr } = await supabase.from('credit_override_requests').select('id').limit(1)
  pass('migration v15 credit_override_requests', !tblErr, tblErr?.message || 'ok')

  // ── a) clean customer zeros ──
  const clean = await creditStatus(cleanCustomer)
  pass('a clean zeros', clean.overdue_amount === 0 && clean.active_quotations_count === 0 && clean.blocked === false,
    JSON.stringify(clean))

  // Fixture customer + overdue invoice
  await supabase.from('customers').upsert({
    name: customerName,
    cr_number: 'CR-S3B2',
    vat_number: 'VAT-S3B2',
    national_address: 'Riyadh',
    billing_address: 'Riyadh',
  }, { onConflict: 'name' })
  cleanup.customers.push(customerName)

  const pastDue = new Date()
  pastDue.setDate(pastDue.getDate() - 14)
  const invNum = `INV-${TAG}`
  const { data: inv, error: invErr } = await supabase.from('invoices').insert({
    number: invNum,
    customer: customerName,
    total: 12500,
    paid: 0,
    due_date: pastDue.toISOString().slice(0, 10),
    status: 'Unpaid',
  }).select().single()
  if (invErr) throw new Error(`invoice: ${invErr.message}`)
  cleanup.invoices.push(inv.id)

  const afterInv = await creditStatus(customerName)
  pass('b1 overdue detected', afterInv.has_overdue && afterInv.overdue_amount === 12500,
    JSON.stringify({ amount: afterInv.overdue_amount, count: afterInv.overdue_invoice_count }))

  // Sales user (needed for 4th-quote gate — Management bypasses)
  const hash = bcrypt.hashSync('sales@123!', 8)
  await supabase.from('users').delete().eq('email', salesEmail)
  const { data: salesUser, error: suErr } = await supabase.from('users').insert({
    email: salesEmail,
    name: `S3B2 Sales ${TAG}`,
    role: 'Sales User',
    access_level: 'Create',
    status: 'Active',
    password_hash: hash,
  }).select().single()
  if (suErr) throw new Error(`sales user: ${suErr.message}`)
  cleanup.users.push(salesUser.id)
  const salesToken = await tokenFor(salesEmail, 'sales@123!')
  if (!salesToken) throw new Error('no sales token')

  // Portal customer user
  await supabase.from('users').delete().eq('email', custEmail)
  const { data: custUser, error: cuErr } = await supabase.from('users').insert({
    email: custEmail,
    name: customerName,
    role: 'Customer',
    access_level: 'Customer',
    status: 'Active',
    password_hash: bcrypt.hashSync('cust@123!', 8),
  }).select().single()
  if (cuErr) throw new Error(`customer user: ${cuErr.message}`)
  cleanup.users.push(custUser.id)

  const { data: item } = await supabase.from('items').select('id, item_name')
    .eq('id', '23da79cb-325c-422b-8d7c-48baf51590a2').maybeSingle()
  if (!item?.id) throw new Error('Need FAGOR C-G961 item for verify')

  const { data: opp, error: oppErr } = await supabase.from('opportunities').insert({
    number: `OPP-${TAG}`,
    customer: customerName,
    stage: 'Quotation',
    value: 1000,
    probability: 50,
    next_action_date: new Date().toISOString().slice(0, 10),
    opportunity_type: 'Retail Sale',
    project_name: 'S3B2 Project',
    project_location: 'Riyadh → North',
    contact_person: 'Ali Contact',
    customer_email: custEmail,
    owner_id: salesUser.id,
  }).select().single()
  if (oppErr) throw new Error(`opp: ${oppErr.message}`)
  cleanup.opps.push(opp.id)

  const quoteBody = (extra = {}) => ({
    opportunity_id: opp.id,
    customer: customerName,
    contact_person: 'Ali Contact',
    project_name: 'S3B2 Project',
    project_location: 'Riyadh → North',
    payment_terms: '100% Advanced Payment',
    validity_days: 30,
    customer_email: custEmail,
    override_reason: 'S3B2 verify fixture',
    items: [{ item_id: item.id, qty: 1 }],
    ...extra,
  })

  // ── b) create warning on overdue ──
  const q1 = await api(adminToken, '/quotations', { method: 'POST', body: quoteBody() })
  pass('b2 create with credit_warning', q1.status === 201 && q1.body?.credit_warning?.overdue_amount > 0,
    `status=${q1.status} warn=${JSON.stringify(q1.body?.credit_warning)}`)
  if (q1.body?.id) cleanup.quotes.push(q1.body.id)

  const q2 = await api(adminToken, '/quotations', { method: 'POST', body: quoteBody({ items: [{ item_id: item.id, qty: 2 }] }) })
  if (q2.body?.id) cleanup.quotes.push(q2.body.id)
  const q3 = await api(adminToken, '/quotations', { method: 'POST', body: quoteBody({ items: [{ item_id: item.id, qty: 3 }] }) })
  if (q3.body?.id) cleanup.quotes.push(q3.body.id)
  pass('c1 three active created', q1.status === 201 && q2.status === 201 && q3.status === 201,
    `s=${[q1.status, q2.status, q3.status].join(',')}`)

  const mid = await creditStatus(customerName)
  pass('c1b active count ≥3', mid.active_quotations_count >= 3, `active=${mid.active_quotations_count}`)

  // ── c) 4th via Sales → requires_approval ──
  const q4blocked = await api(salesToken, '/quotations', { method: 'POST', body: quoteBody({ items: [{ item_id: item.id, qty: 1 }] }) })
  pass('c2 4th → 422 requires_approval',
    q4blocked.status === 422 && q4blocked.body?.requires_approval === true,
    `status=${q4blocked.status} ${JSON.stringify(q4blocked.body)}`)
  const overrideId = q4blocked.body?.credit_override_request_id
  if (overrideId) cleanup.overrides.push(overrideId)

  // Approve via notification act
  const { data: notif } = await supabase.from('notifications').select('id')
    .eq('user_id', adminUser.id).eq('type', 'credit_override').eq('ref_id', overrideId)
    .eq('action_status', 'pending').maybeSingle()
  pass('c3 management notification', !!notif?.id, notif?.id || 'missing')
  if (notif?.id) {
    const act = await api(adminToken, `/notifications/${notif.id}/act`, {
      method: 'POST', body: { decision: 'approved' },
    })
    pass('c4 approve override', act.status === 200 && act.body?.ok, JSON.stringify(act.body))
  } else {
    pass('c4 approve override', false, 'no notification')
  }

  const q4ok = await api(salesToken, '/quotations', { method: 'POST', body: quoteBody({ items: [{ item_id: item.id, qty: 1 }] }) })
  pass('c5 create after approve', q4ok.status === 201 && !!q4ok.body?.id,
    `status=${q4ok.status} ${q4ok.body?.error || ''}`)
  if (q4ok.body?.id) cleanup.quotes.push(q4ok.body.id)

  // ── e + d) send with overdue confirm + portal + audit ──
  const sendId = q1.body?.id
  // Ensure still Draft/Sendable — may be Draft or Pending Approval
  await supabase.from('quotations').update({
    status: 'Draft',
    approval_status: 'Approved',
    contact_person: 'Ali Contact',
    project_name: 'S3B2 Project',
    project_location: 'Riyadh → North',
    payment_terms: '100% Advanced Payment',
    validity_days: 30,
    customer_email: custEmail,
  }).eq('id', sendId)

  const sendWarn = await api(adminToken, `/sales/quotations/${sendId}/send`, { method: 'POST', body: {} })
  pass('e1 send without confirm → 422',
    sendWarn.status === 422 && sendWarn.body?.code === 'CREDIT_OVERDUE_CONFIRM',
    `status=${sendWarn.status} ${JSON.stringify(sendWarn.body)}`)
  pass('e2 credit_warning present', !!sendWarn.body?.credit_warning?.overdue_amount,
    JSON.stringify(sendWarn.body?.credit_warning))

  const sendOk = await api(adminToken, `/sales/quotations/${sendId}/send`, {
    method: 'POST', body: { confirm_overdue: true },
  })
  pass('d1 send → Sent', sendOk.status === 200 && sendOk.body?.status === 'Sent', JSON.stringify(sendOk.body))
  pass('d2 channels portal', sendOk.body?.channels?.portal === true, JSON.stringify(sendOk.body?.channels))
  pass('d3 email skipped', sendOk.body?.channels?.email === 'skipped', sendOk.body?.channels?.email_detail || '')

  const { data: portalNotifs } = await supabase.from('notifications').select('id, type, title')
    .eq('user_id', custUser.id).eq('type', 'quotation_sent').eq('ref_id', sendId)
  pass('d4 portal notification row', (portalNotifs || []).length >= 1, JSON.stringify(portalNotifs))

  const { data: audits } = await supabase.from('audit_log').select('action, details')
    .eq('entity_id', sendId).eq('action', 'quotation_sent').order('created_at', { ascending: false }).limit(1)
  const ch = audits?.[0]?.details?.channels
  pass('d5 audit quotation_sent channels', !!ch && (ch.email === 'skipped' || ch.email === 'sent'),
    JSON.stringify(audits?.[0]?.details))

  // Credit API
  const creditApi = await api(adminToken, `/sales/customers/${encodeURIComponent(customerName)}/credit`)
  pass('t4 credit API', creditApi.status === 200 && creditApi.body?.has_overdue === true,
    JSON.stringify(creditApi.body))

} catch (e) {
  pass('FATAL', false, e.message)
  console.error(e)
} finally {
  // cleanup
  for (const id of cleanup.quotes) {
    await supabase.from('quotation_items').delete().eq('quotation_id', id)
    await supabase.from('quotation_revisions').delete().eq('quotation_id', id)
    await supabase.from('notifications').delete().eq('ref_id', id)
    await supabase.from('quotations').delete().eq('id', id)
  }
  for (const id of cleanup.opps) await supabase.from('opportunities').delete().eq('id', id)
  for (const id of cleanup.invoices) await supabase.from('invoices').delete().eq('id', id)
  for (const id of cleanup.overrides) await supabase.from('credit_override_requests').delete().eq('id', id)
  await supabase.from('credit_override_requests').delete().ilike('customer', customerName)
  await supabase.from('messages').delete().ilike('customer_name', customerName)
  for (const id of cleanup.users) {
    await supabase.from('notifications').delete().eq('user_id', id)
    await supabase.from('users').delete().eq('id', id)
  }
  for (const name of cleanup.customers) await supabase.from('customers').delete().eq('name', name)
}

// ── f) regressions ──
if (process.env.RUN_REGRESSION === '1') {
  console.log('\n-- regressions (RUN_REGRESSION=1) --')
  for (const script of [
    'verify_s3_block1.mjs',
    'verify_s2_block1.mjs',
    'verify_s2_block2.mjs',
    'verify_s2_block3.mjs',
    'verify_block4.mjs',
  ]) {
    const r = spawnSync(process.execPath, [path.join(__dirname, script)], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      env: { ...process.env, SKIP_REGRESSION: '1', RUN_REGRESSION: '0' },
    })
    const ok = r.status === 0
    pass(`f ${script}`, ok, ok ? 'PASS' : (r.stdout || r.stderr || '').slice(-400))
    console.log(`  ${script}: ${ok ? 'PASS' : 'FAIL'}`)
  }
} else {
  pass('f regressions', true, 'skipped — run individually or set RUN_REGRESSION=1')
}

console.log('\n-- results --')
let failed = 0
for (const r of results) {
  const mark = r.ok ? 'PASS' : 'FAIL'
  if (!r.ok) failed++
  console.log(`${mark}  ${r.id}${r.detail ? ` — ${r.detail}` : ''}`)
}
console.log(`\n######## ${failed ? 'FAIL' : 'PASS'} — ${results.filter((r) => r.ok).length}/${results.length} ########\n`)
process.exit(failed ? 1 : 0)
