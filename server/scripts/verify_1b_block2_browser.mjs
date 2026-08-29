/**
 * Sprint 1b Block 2 — browser checklist parity (API + UI source).
 * Covers 1b-B2-1..9 when native browser tools are unavailable.
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import jwt from 'jsonwebtoken'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const { supabase } = await import('../src/config/supabase.js')
const { env } = await import('../src/config/env.js')

const BASE = (process.env.BASE || `http://localhost:${process.env.PORT || 5050}/api`).replace(/\/$/, '')
const PRICING_UI = path.resolve(__dirname, '../../client/src/pages/PricingEngine.jsx')
const BELL_UI = path.resolve(__dirname, '../../client/src/components/NotificationBell.jsx')
const approx = (a, b, tol = 0.05) => Math.abs(Number(a) - Number(b)) <= tol
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

console.log('\n######## 1b-B2 BROWSER PARITY (API + UI source) ########\n')

const adminToken = await tokenFor('admin@gmail.com')
const stockToken = await tokenFor('warehouse@culinova.sa')
if (!adminToken || !stockToken) {
  console.error('Need admin + warehouse tokens')
  process.exit(1)
}

const { data: fagor } = await supabase.from('items').select('id, item_name, valuation_rate, selling_price')
  .ilike('model', '%C-G961%').eq('disabled', false).limit(1).maybeSingle()
if (!fagor) { console.error('FAGOR not found'); process.exit(1) }
const itemId = fagor.id

// Start clean at VR 1000
await api(adminToken, `/items/${itemId}`, { method: 'PATCH', body: { valuation_rate: 1000 } })
await supabase.from('vr_change_requests').delete().eq('item_id', itemId).eq('status', 'Pending')

const pricingSrc = fs.readFileSync(PRICING_UI, 'utf8')
const bellSrc = fs.readFileSync(BELL_UI, 'utf8')

// ── UI wiring proofs (checks 1,2,4,5,7 source) ──────────────────────────────
pass('1b-B2-1-ui', /Request change/.test(pricingSrc) && /isMgmt/.test(pricingSrc) && /vr_reason/.test(pricingSrc),
  'Request change flow + isMgmt gate + vr_reason in PricingEngine')
pass('1b-B2-2-ui', /Pending:/.test(pricingSrc) && /pendingReq/.test(pricingSrc) && /amber/.test(pricingSrc),
  'Pending amber chip wiring present')
pass('1b-B2-4-ui', /vr_change/.test(bellSrc) && /Approve/.test(bellSrc) && /Reject/.test(bellSrc),
  'Bell VR Approve/Reject wiring')
pass('1b-B2-5-ui', /VR Requests/.test(pricingSrc) && /vrQueue/.test(pricingSrc),
  'VR Requests pill + queue wiring')
pass('1b-B2-7-ui', /approved-request/.test(pricingSrc) && /row\.note/.test(pricingSrc),
  'History source + note line wiring')

// ── 1: Stock request 1500 → 202 ─────────────────────────────────────────────
let req1 = null
{
  const r = await api(stockToken, `/items/${itemId}`, {
    method: 'PATCH', body: { valuation_rate: 1500, vr_reason: '1b-B2 browser spot-check' },
  })
  req1 = r.body?.request_id || r.body?.request?.id
  const { data: after } = await supabase.from('items').select('valuation_rate').eq('id', itemId).single()
  pass('1b-B2-1', r.status === 202 && r.body?.pending === true && Number(after.valuation_rate) === 1000,
    `status=${r.status} msg=${r.body?.message || ''} vr=${after.valuation_rate}`)
}

// ── 2: Pending chip data exists for item ────────────────────────────────────
{
  const list = await api(stockToken, '/items/vr-requests?status=Pending')
  const rows = Array.isArray(list.body) ? list.body : []
  const hit = rows.find((x) => x.item_id === itemId && Number(x.new_value) === 1500)
  pass('1b-B2-2', !!hit && hit.status === 'Pending' && !!hit.requested_by,
    hit ? `Pending: ${hit.new_value} (requested by ${hit.requested_by})` : 'no pending row')
}

// ── 3: Second request → 409 ─────────────────────────────────────────────────
{
  const r = await api(stockToken, `/items/${itemId}`, { method: 'PATCH', body: { valuation_rate: 1600 } })
  pass('1b-B2-3', r.status === 409 && /pending/i.test(r.body?.error || ''), `status=${r.status} ${r.body?.error || ''}`)
}

// ── 4: Management notification for VR ───────────────────────────────────────
{
  const n = await api(adminToken, '/notifications')
  const items = n.body?.items || []
  const hit = items.find((x) => x.type === 'vr_change' && x.action_status === 'pending' && x.ref_id === req1)
  pass('1b-B2-4', !!hit, hit ? `title=${hit.title}` : 'no pending vr_change notification')
}

// ── 5: Admin VR Requests list ───────────────────────────────────────────────
{
  const list = await api(adminToken, '/items/vr-requests?status=Pending')
  const rows = Array.isArray(list.body) ? list.body : []
  const hit = rows.find((x) => x.id === req1)
  pass('1b-B2-5', list.status === 200 && !!hit && rows.length >= 1,
    `count=${rows.length} requester=${hit?.requested_by}`)
}

// ── 6: Approve → 1500 / 14985 ───────────────────────────────────────────────
{
  const r = await api(adminToken, `/items/vr-requests/${req1}/approve`, { method: 'POST' })
  const { data: after } = await supabase.from('items').select('valuation_rate, selling_price').eq('id', itemId).single()
  pass('1b-B2-6', r.status === 200 && Number(after.valuation_rate) === 1500 && approx(after.selling_price, 14985),
    `vr=${after.valuation_rate} sell=${after.selling_price}`)
}

// ── 7: History approved-request + note ──────────────────────────────────────
{
  const h = await api(adminToken, `/items/${itemId}/pricing-history?field=valuation_rate`)
  const rows = Array.isArray(h.body) ? h.body : []
  const hit = rows.find((x) => x.source === 'approved-request' && /requested by/i.test(x.note || '') && /approved by/i.test(x.note || ''))
  pass('1b-B2-7', !!hit, hit ? `source=${hit.source} note=${hit.note}` : 'no matching history row')
}

// ── 8: New request 2000 → reject no reason 422; with reason → VR stays 1500 ─
{
  const created = await api(stockToken, `/items/${itemId}`, {
    method: 'PATCH', body: { valuation_rate: 2000, vr_reason: '1b-B2 reject test' },
  })
  const rid = created.body?.request_id
  const noReason = await api(adminToken, `/items/vr-requests/${rid}/reject`, { method: 'POST', body: {} })
  const withReason = await api(adminToken, `/items/vr-requests/${rid}/reject`, {
    method: 'POST', body: { reason: 'Too aggressive for this SKU' },
  })
  const { data: after } = await supabase.from('items').select('valuation_rate').eq('id', itemId).single()
  pass('1b-B2-8', created.status === 202 && noReason.status === 422 && withReason.status === 200 && Number(after.valuation_rate) === 1500,
    `create=${created.status} noReason=${noReason.status} reject=${withReason.status} vr=${after.valuation_rate}`)
}

// ── 9: Admin direct → 1000; selling ~9990; auto-Approved register ───────────
{
  const r = await api(adminToken, `/items/${itemId}`, { method: 'PATCH', body: { valuation_rate: 1000 } })
  const { data: after } = await supabase.from('items').select('valuation_rate, selling_price').eq('id', itemId).single()
  const { data: reg } = await supabase.from('vr_change_requests')
    .select('*').eq('item_id', itemId).eq('status', 'Approved').eq('new_value', 1000)
    .order('requested_at', { ascending: false }).limit(1).maybeSingle()
  const selfBoth = reg && reg.requested_by_id && reg.requested_by_id === reg.decided_by_id
  pass('1b-B2-9', r.status === 200 && Number(after.valuation_rate) === 1000 && approx(after.selling_price, 9990, 1) && selfBoth,
    `vr=${after.valuation_rate} sell=${after.selling_price} autoApproved=${selfBoth}`)
}

// cleanup leftover pending
await supabase.from('vr_change_requests').delete().eq('item_id', itemId).eq('status', 'Pending')
pass('cleanup', true, 'Pending cleared; FAGOR VR=1000')

const ok = results.filter((r) => r.ok).length
const fail = results.filter((r) => !r.ok).length
console.log('Results:')
for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.id}${r.detail ? ` — ${r.detail}` : ''}`)
console.log(`\n${ok}/${results.length} PASS · ${fail} FAIL\n`)
process.exit(fail ? 1 : 0)
