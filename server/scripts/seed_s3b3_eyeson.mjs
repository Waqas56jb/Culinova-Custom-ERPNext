/**
 * Sprint 3 Block 3 — eyes-on fixtures (waqas portal + Ali + Admin Audit/Revisions)
 * Cleanup: node scripts/seed_s3b3_eyeson.mjs --cleanup
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import jwt from 'jsonwebtoken'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const { supabase } = await import('../src/config/supabase.js')
const { env } = await import('../src/config/env.js')

const BASE = (process.env.BASE || `http://localhost:${process.env.PORT || 5050}/api`).replace(/\/$/, '')
const TAG = 'S3B3-EYES'
const CUSTOMER = 'waqas'
const ITEM = '23da79cb-325c-422b-8d7c-48baf51590a2'
const secret = process.env.JWT_SECRET || env.jwtSecret

const j = async (res) => {
  const t = await res.text()
  try { return t ? JSON.parse(t) : {} } catch { return { error: t } }
}
async function tokenFor(email, password = 'admin@123!') {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await j(res)
  if (body.token) return body.token
  const { data: u } = await supabase.from('users').select('id, name, email, role, access_level, status').eq('email', email).maybeSingle()
  if (!u) return null
  return jwt.sign(
    { id: u.id, name: u.name, email: u.email, role: u.role, access_level: u.access_level },
    secret, { expiresIn: '8h' },
  )
}
const api = async (token, p, opts = {}) => {
  const res = await fetch(`${BASE}${p}`, {
    ...opts,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  return { status: res.status, body: await j(res) }
}

if (process.argv.includes('--cleanup')) {
  const { data: qs } = await supabase.from('quotations').select('id, number').ilike('project_name', `%${TAG}%`)
  for (const q of qs || []) {
    await supabase.from('quotation_items').delete().eq('quotation_id', q.id)
    await supabase.from('quotation_revisions').delete().eq('quotation_id', q.id)
    await supabase.from('notifications').delete().eq('ref_id', q.id)
    await supabase.from('audit_log').delete().eq('entity_id', String(q.id))
    await supabase.from('quotations').delete().eq('id', q.id)
    console.log('deleted', q.number)
  }
  await supabase.from('opportunities').delete().ilike('project_name', `%${TAG}%`)
  console.log('CLEANUP done for', TAG)
  process.exit(0)
}

const adminToken = await tokenFor('admin@gmail.com')
const { data: admin } = await supabase.from('users').select('id, name').eq('email', 'admin@gmail.com').single()
const { data: ali } = await supabase.from('users').select('id, name').eq('email', 'ali@culinova.sa').maybeSingle()
if (!adminToken || !admin) throw new Error('admin required')
if (!ali?.id) throw new Error('ali@culinova.sa required')

const { data: opp, error: oppErr } = await supabase.from('opportunities').insert({
  number: `OPP-${TAG}-${Date.now().toString().slice(-4)}`,
  customer: CUSTOMER, stage: 'Quotation', value: 5000, probability: 50,
  next_action_date: new Date().toISOString().slice(0, 10),
  opportunity_type: 'Retail Sale',
  project_name: `${TAG} Project`, project_location: 'Riyadh → North',
  contact_person: 'Ali', customer_email: 'waqas56jb@gmail.com', owner_id: admin.id,
}).select().single()
if (oppErr) throw new Error(oppErr.message)

const base = (extra = {}) => ({
  opportunity_id: opp.id,
  customer: CUSTOMER,
  contact_person: 'Ali',
  project_name: `${TAG} Project`,
  project_location: 'Riyadh → North',
  payment_terms: '100% Advanced Payment',
  validity_days: 30,
  customer_email: 'waqas56jb@gmail.com',
  override_reason: 'S3B3 eyes-on',
  items: [{ item_id: ITEM, qty: 1 }],
  ...extra,
})

async function createComplete(label, extra = {}) {
  const r = await api(adminToken, '/quotations', { method: 'POST', body: base(extra) })
  if (r.status !== 201) throw new Error(`${label} create ${r.status} ${JSON.stringify(r.body)}`)
  await supabase.from('quotations').update({
    status: 'Draft',
    approval_status: 'Approved',
    contact_person: 'Ali',
    project_name: `${TAG} Project`,
    project_location: 'Riyadh → North',
    payment_terms: '100% Advanced Payment',
    validity_days: 30,
    customer_email: 'waqas56jb@gmail.com',
  }).eq('id', r.body.id)
  return r.body
}

const qReject = await createComplete('reject', { items: [{ item_id: ITEM, qty: 1 }] })
const qConc = await createComplete('concession', { items: [{ item_id: ITEM, qty: 2 }] })
const qDraft = await createComplete('draft-auto', { items: [{ item_id: ITEM, qty: 1 }] })
const qBell = await createComplete('bell', { items: [{ item_id: ITEM, qty: 1 }] })
const qAli = await createComplete('ali-audit', { items: [{ item_id: ITEM, qty: 1 }] })

// Send reject + concession quotes to portal
for (const q of [qReject, qConc]) {
  let s = await api(adminToken, `/sales/quotations/${q.id}/send`, { method: 'POST', body: { confirm_overdue: true } })
  if (s.status === 422 && s.body?.code === 'CREDIT_OVERDUE_CONFIRM') {
    s = await api(adminToken, `/sales/quotations/${q.id}/send`, { method: 'POST', body: { confirm_overdue: true } })
  }
  if (s.status !== 200) {
    await supabase.from('quotations').update({ status: 'Sent', approval_status: 'Approved' }).eq('id', q.id)
  }
}

// Draft stays Draft for builder auto-revision
await supabase.from('quotations').update({ status: 'Draft', approval_status: 'Approved', owner_id: admin.id }).eq('id', qDraft.id)

// Bell: Pending Approval + notification for Admin
await supabase.from('quotations').update({
  status: 'Pending Approval', approval_status: 'Pending', owner_id: admin.id,
}).eq('id', qBell.id)
const { data: notif } = await supabase.from('notifications').insert({
  user_id: admin.id,
  type: 'approval',
  ref_type: 'quotation',
  ref_id: qBell.id,
  action_status: 'pending',
  title: `Discount approval — ${qBell.number}`,
  body: `${TAG}: approve to verify Audit tab`,
  sender: 'System',
  read: false,
}).select().single()

// Ali owns this Draft so he can open Audit
await supabase.from('quotations').update({
  status: 'Draft', approval_status: 'Approved', owner_id: ali.id,
}).eq('id', qAli.id)

const nums = async (id) => (await supabase.from('quotations').select('number, status').eq('id', id).single()).data

const A = await nums(qReject.id)
const B = await nums(qConc.id)
const C = await nums(qDraft.id)
const D = await nums(qBell.id)
const E = await nums(qAli.id)

console.log(`
======== S3B3 EYES-ON SEED READY ========
Customer portal user:  waqas  (must match quote customer name)
Admin:                 admin@gmail.com / admin@123!
Ali:                   ali@culinova.sa / admin@123!

A) REJECT     ${A.number}  status=${A.status}   → Portal reject with reason
B) CONCESSION ${B.number}  status=${B.status}   → Portal concession note
C) BUILDER    ${C.number}  status=${C.status}   → edit lines → auto revision
D) BELL       ${D.number}  status=${D.status}   → Admin bell Approve  (notif ${notif?.id?.slice(0, 8)}…)
E) ALI AUDIT  ${E.number}  status=${E.status}   → Ali login → Audit tab (no $)

Cleanup:
  node scripts/seed_s3b3_eyeson.mjs --cleanup
=========================================
`)
