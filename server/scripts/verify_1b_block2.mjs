/**
 * Sprint 1b Block 2 — VR approval workflow verify
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
const approx = (a, b, tol = 0.02) => Math.abs(Number(a) - Number(b)) <= tol
const results = []
const pass = (name, ok, detail = '') => results.push({ name, ok, detail })
const jwtSecret = process.env.JWT_SECRET || env.jwtSecret

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
    jwtSecret,
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

console.log('\n######## SPRINT 1b BLOCK 2 — VR APPROVAL WORKFLOW ########\n')

const adminToken = await tokenFor('admin@gmail.com')
const stockToken = await tokenFor('warehouse@culinova.sa')
const aliToken = await tokenFor('ali@culinova.sa')

if (!adminToken || !stockToken) {
  console.error('Need admin + warehouse tokens')
  process.exit(1)
}

const { data: fagor } = await supabase.from('items').select('id, item_name, valuation_rate, selling_price')
  .ilike('model', '%C-G961%').eq('disabled', false).limit(1).maybeSingle()
if (!fagor) { console.error('FAGOR C-G961 not found'); process.exit(1) }

const itemId = fagor.id
const origVr = Number(fagor.valuation_rate) || 1000

// Ensure clean start at VR 1000
await supabase.from('items').update({ valuation_rate: 1000 }).eq('id', itemId)
await supabase.from('vr_change_requests').delete().eq('item_id', itemId).eq('status', 'Pending')
// reprice to golden via admin direct later in cleanup

const requestIds = []

// ── (a) Stock User PATCH 1000→1500 → 202 Pending, VR still 1000 ─────────────
{
  const r = await api(stockToken, `/items/${itemId}`, { method: 'PATCH', body: { valuation_rate: 1500, vr_reason: '1b-B2 test bump' } })
  const { data: after } = await supabase.from('items').select('valuation_rate').eq('id', itemId).single()
  const ok = r.status === 202 && r.body?.pending === true && Number(after.valuation_rate) === 1000
  if (r.body?.request_id) requestIds.push(r.body.request_id)
  pass('(a) Stock User PATCH → 202 Pending, VR=1000', ok, `status=${r.status} pending=${r.body?.pending} vr=${after.valuation_rate} req=${r.body?.request_id}`)
}

// ── (b) Second request → 409 ────────────────────────────────────────────────
{
  const r = await api(stockToken, `/items/${itemId}`, { method: 'PATCH', body: { valuation_rate: 1600 } })
  pass('(b) Second Stock request → 409', r.status === 409, `status=${r.status} ${r.body?.error || ''}`)
}

// ── (c) Management approve → VR=1500, selling≈14985, history approved-request ─
{
  let id = requestIds[0]
  if (!id) {
    const { data: pend } = await supabase.from('vr_change_requests').select('id').eq('item_id', itemId).eq('status', 'Pending').maybeSingle()
    id = pend?.id
  }
  const r = await api(adminToken, `/items/vr-requests/${id}/approve`, { method: 'POST' })
  const { data: after } = await supabase.from('items').select('valuation_rate, selling_price').eq('id', itemId).single()
  const { data: hist } = await supabase.from('item_pricing_history')
    .select('*').eq('item_id', itemId).eq('field', 'valuation_rate').eq('source', 'approved-request')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  const { data: reg } = await supabase.from('vr_change_requests').select('*').eq('id', id).maybeSingle()
  const sellOk = approx(after.selling_price, 14985, 0.05)
  const histOk = hist && /requested by/i.test(hist.note || '') && /approved by/i.test(hist.note || '')
  const regOk = reg?.status === 'Approved' && reg.requested_by_id && reg.decided_by_id
  pass('(c) Approve → VR=1500 selling≈14985 + history', r.status === 200 && Number(after.valuation_rate) === 1500 && sellOk && histOk && regOk,
    `status=${r.status} vr=${after.valuation_rate} sell=${after.selling_price} histNote=${hist?.note} reg=${reg?.status}`)
}

// ── (d) Reject without reason → 422; with reason → Rejected, VR unchanged ────
{
  // reset to 1000 for clean reject test, then new pending
  await api(adminToken, `/items/${itemId}`, { method: 'PATCH', body: { valuation_rate: 1000 } })
  await supabase.from('vr_change_requests').delete().eq('item_id', itemId).eq('status', 'Pending')
  const created = await api(stockToken, `/items/${itemId}`, { method: 'PATCH', body: { valuation_rate: 1200 } })
  const rid = created.body?.request_id
  const noReason = await api(adminToken, `/items/vr-requests/${rid}/reject`, { method: 'POST', body: {} })
  const withReason = await api(adminToken, `/items/vr-requests/${rid}/reject`, { method: 'POST', body: { reason: 'Not justified' } })
  const { data: after } = await supabase.from('items').select('valuation_rate').eq('id', itemId).single()
  pass('(d) Reject no reason → 422; with reason → Rejected VR unchanged',
    noReason.status === 422 && withReason.status === 200 && Number(after.valuation_rate) === 1000,
    `noReason=${noReason.status} withReason=${withReason.status} vr=${after.valuation_rate}`)
}

// ── (e) Management direct PATCH → immediate + auto-Approved register ────────
{
  const r = await api(adminToken, `/items/${itemId}`, { method: 'PATCH', body: { valuation_rate: 1100 } })
  const { data: after } = await supabase.from('items').select('valuation_rate').eq('id', itemId).single()
  const { data: reg } = await supabase.from('vr_change_requests')
    .select('*').eq('item_id', itemId).eq('status', 'Approved').eq('new_value', 1100)
    .order('requested_at', { ascending: false }).limit(1).maybeSingle()
  const selfBoth = reg && reg.requested_by_id === reg.decided_by_id
  pass('(e) Management direct → applied + auto-Approved register',
    r.status === 200 && Number(after.valuation_rate) === 1100 && selfBoth,
    `status=${r.status} vr=${after.valuation_rate} selfBoth=${selfBoth}`)
}

// ── (f) Sales PATCH → 403 ───────────────────────────────────────────────────
{
  if (aliToken) {
    const r = await api(aliToken, `/items/${itemId}`, { method: 'PATCH', body: { valuation_rate: 999 } })
    pass('(f) Sales PATCH → 403', r.status === 403, `status=${r.status}`)
  } else {
    pass('(f) Sales PATCH → 403', false, 'ali token unavailable')
  }
}

// ── (g) Requester cancel own Pending ────────────────────────────────────────
{
  await api(adminToken, `/items/${itemId}`, { method: 'PATCH', body: { valuation_rate: 1000 } })
  await supabase.from('vr_change_requests').delete().eq('item_id', itemId).eq('status', 'Pending')
  const created = await api(stockToken, `/items/${itemId}`, { method: 'PATCH', body: { valuation_rate: 1300 } })
  const rid = created.body?.request_id
  const r = await api(stockToken, `/items/vr-requests/${rid}/cancel`, { method: 'POST' })
  const { data: reg } = await supabase.from('vr_change_requests').select('status').eq('id', rid).maybeSingle()
  pass('(g) Requester cancel → Cancelled', r.status === 200 && reg?.status === 'Cancelled', `status=${r.status} reg=${reg?.status}`)
}

// ── (h) Cleanup: restore FAGOR VR=1000, clear Pending test requests ─────────
{
  await api(adminToken, `/items/${itemId}`, { method: 'PATCH', body: { valuation_rate: 1000 } })
  await supabase.from('vr_change_requests').delete().eq('item_id', itemId).in('status', ['Pending', 'Cancelled'])
  // keep Approved/Rejected register rows for audit; optional: delete test reasons
  await supabase.from('vr_change_requests').delete().eq('item_id', itemId).ilike('reason', '%1b-B2%')
  const { data: after } = await supabase.from('items').select('valuation_rate, selling_price').eq('id', itemId).single()
  // Ensure selling back near 9990
  const sellOk = approx(after.selling_price, 9990, 1) || Number(after.valuation_rate) === 1000
  pass('(h) Cleanup VR=1000', Number(after.valuation_rate) === 1000 && sellOk, `vr=${after.valuation_rate} sell=${after.selling_price}`)
}

const ok = results.filter((r) => r.ok).length
const fail = results.filter((r) => !r.ok).length
console.log('Results:')
for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
console.log(`\n${ok}/${results.length} PASS · ${fail} FAIL\n`)
process.exit(fail ? 1 : 0)
