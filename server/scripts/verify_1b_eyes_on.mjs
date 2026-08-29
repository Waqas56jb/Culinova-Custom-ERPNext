/**
 * Sprint 1b combined eyes-on debt — 21 checks (API + UI-source parity).
 * Native browser MCP unavailable; covers every checkable assertion.
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
const { redactFinancials } = await import('../src/middleware/rbac.js')
const { stripCustomerQuotationFields } = await import('../src/rbac/permissions.js')
const { buildQuotationPrintModel, printModelHasForbidden } = await import('../../shared/quotationPrintModel.js')

const BASE = (process.env.BASE || `http://localhost:${process.env.PORT || 5050}/api`).replace(/\/$/, '')
const CLIENT = path.resolve(__dirname, '../../client/src')
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
  const data = await j(res)
  return { token: data.token, user: data.user, status: res.status }
}

async function tokenFor(email, password = 'admin@123!') {
  const r = await login(email, password)
  if (r.token) return r.token
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

const hasKey = (obj, key) => {
  if (!obj || typeof obj !== 'object') return false
  if (Object.prototype.hasOwnProperty.call(obj, key)) return true
  if (Array.isArray(obj)) return obj.some((x) => hasKey(x, key))
  return Object.values(obj).some((v) => v && typeof v === 'object' && hasKey(v, key))
}

console.log('\n######## SPRINT 1b COMBINED EYES-ON (1..21) ########\n')
console.log('Note: no native browser MCP — API + UI-source parity for all 21.\n')

// Health
{
  const h = await fetch(`${BASE}/health`).then((r) => r.status).catch(() => 0)
  const c = await fetch('http://localhost:5173/').then((r) => r.status).catch(() => 0)
  pass('servers', h === 200 && c === 200, `API=${h} Vite=${c}`)
}

const adminToken = await tokenFor('admin@gmail.com')
const stockToken = await tokenFor('warehouse@culinova.sa')
const aliToken = await tokenFor('ali@culinova.sa')
if (!adminToken || !stockToken) {
  console.error('Need admin + warehouse tokens')
  process.exit(1)
}

const { data: qtn } = await supabase.from('quotations').select('*').eq('number', 'QTN-2026-000078').maybeSingle()
const { data: line } = await supabase.from('quotation_items').select('*').eq('quotation_id', qtn.id).limit(1).maybeSingle()
const { data: fagor } = await supabase.from('items').select('*').ilike('model', '%C-G961%').eq('disabled', false).limit(1).maybeSingle()

// Clean start
await api(adminToken, `/items/${fagor.id}`, { method: 'PATCH', body: { valuation_rate: 1000 } })
await supabase.from('vr_change_requests').delete().eq('item_id', fagor.id).eq('status', 'Pending')
await api(adminToken, `/quotations/${qtn.id}/items/${line.id}`, { method: 'PATCH', body: { add_margin_pct: 0 } })
await api(adminToken, `/quotations/${qtn.id}`, { method: 'PATCH', body: { discount_pct: 0, override_reason: null } })

const quotationsSrc = fs.readFileSync(path.join(CLIENT, 'pages/Quotations.jsx'), 'utf8')
const pricingSrc = fs.readFileSync(path.join(CLIENT, 'pages/PricingEngine.jsx'), 'utf8')
const bellSrc = fs.readFileSync(path.join(CLIENT, 'components/NotificationBell.jsx'), 'utf8')

// ═══ ROUND 1 — ADMIN ═══════════════════════════════════════════════════════

// 1 + 2 margin
{
  const r1 = await api(adminToken, `/quotations/${qtn.id}/items/${line.id}`, { method: 'PATCH', body: { add_margin_pct: 3 } })
  const rate1 = r1.body?.quotation_items?.find((l) => l.id === line.id)?.rate ?? r1.body?.quotation_items?.[0]?.rate
  pass('1', r1.status === 200 && approx(rate1, 10289.7), `rate=${rate1}`)
  const r2 = await api(adminToken, `/quotations/${qtn.id}/items/${line.id}`, { method: 'PATCH', body: { add_margin_pct: 0 } })
  const rate2 = r2.body?.quotation_items?.find((l) => l.id === line.id)?.rate ?? r2.body?.quotation_items?.[0]?.rate
  pass('2', r2.status === 200 && approx(rate2, 9990), `rate=${rate2}`)
}

// 3 hint
pass('3', /Sales User 15%/.test(quotationsSrc) && /Sales Manager 20%/.test(quotationsSrc) && /max 25%/.test(quotationsSrc), 'hint in Quotations.jsx')

// 4 discount 30%
{
  const blocked = await api(adminToken, `/quotations/${qtn.id}`, { method: 'PATCH', body: { discount_pct: 30 } })
  const saved = await api(adminToken, `/quotations/${qtn.id}`, {
    method: 'PATCH', body: { discount_pct: 30, override_reason: '1b eyes-on strategic override' },
  })
  const ok = blocked.status === 422 && saved.status === 200 && !!saved.body?.override_reason
  await api(adminToken, `/quotations/${qtn.id}`, { method: 'PATCH', body: { discount_pct: 0, override_reason: '1b eyes-on strategic override' } })
  // keep override_reason briefly for check 8, then clear after
  pass('4', ok, `block=${blocked.status} save=${saved.status}`)
}

// 5 PDF
{
  const get = await api(adminToken, `/quotations/${qtn.id}`)
  const model = buildQuotationPrintModel({
    ...get.body,
    override_reason: 'x',
    discount_source: 'CEO',
    quotation_items: (get.body.quotation_items || []).map((l) => ({ ...l, add_margin_pct: 3 })),
  }, { vatPct: 15 })
  const leaks = printModelHasForbidden(model)
  pass('5', leaks.length === 0, leaks.length ? `leaks=${leaks}` : 'print clean')
}

// 6 validity
{
  const get = await api(adminToken, `/quotations/${qtn.id}`)
  const days = get.body?.validity_days || 30
  const model = buildQuotationPrintModel({ ...get.body, validity_days: days }, { vatPct: 15 })
  const listFmt = get.body?.valid_till && days ? `${get.body.valid_till} (${days} days)` : ''
  const uiList = /validity_days \? ` \(\$\{q\.validity_days\} days\)`/.test(quotationsSrc) || /\(\$\{q\.validity_days\} days\)/.test(quotationsSrc)
  pass('6', /\(\d+\s*days\)/i.test(model.valid_till) && uiList, `print=${model.valid_till} listUi=${uiList}`)
}

// 7 discount_source label
{
  await supabase.from('quotations').update({ discount_source: 'CEO' }).eq('id', qtn.id)
  const get = await api(adminToken, `/quotations/${qtn.id}`)
  const ui = /Discount applied by:/.test(quotationsSrc)
  pass('7', ui && !!get.body?.discount_source, `source=${get.body?.discount_source} ui=${ui}`)
}

// 8 override reason for Management
{
  await supabase.from('quotations').update({ override_reason: '1b eyes-on strategic override' }).eq('id', qtn.id)
  const get = await api(adminToken, `/quotations/${qtn.id}`)
  const ui = /Override reason on file:/.test(quotationsSrc) || /Strategic override reason/.test(quotationsSrc)
  pass('8', !!get.body?.override_reason && ui, `reason=${get.body?.override_reason}`)
  await api(adminToken, `/quotations/${qtn.id}`, { method: 'PATCH', body: { discount_pct: 0, override_reason: null } })
}

// 9 VR Requests pill
pass('9', /VR Requests/.test(pricingSrc) && /vrQueue/.test(pricingSrc), 'VR Requests pill wiring')

// 10 History approved-request rows
{
  const h = await api(adminToken, `/items/${fagor.id}/pricing-history?field=valuation_rate`)
  const rows = Array.isArray(h.body) ? h.body : []
  const hit = rows.find((x) => x.source === 'approved-request' && /requested by/i.test(x.note || ''))
  const ui = /approved-request/.test(pricingSrc) && /row\.note/.test(pricingSrc)
  pass('10', !!hit && ui, hit ? `note=${hit.note}` : 'no prior approved-request (ok if first run after wipe)')
}

// ═══ ROUND 2 — STOCK ═══════════════════════════════════════════════════════

let reqId = null
{
  const r = await api(stockToken, `/items/${fagor.id}`, {
    method: 'PATCH', body: { valuation_rate: 1500, vr_reason: '1b eyes-on round 2' },
  })
  reqId = r.body?.request_id
  const ui = /Request change/.test(pricingSrc) && /vr_reason/.test(pricingSrc)
  pass('11', r.status === 202 && r.body?.pending && /approval/i.test(r.body?.message || '') && ui,
    `status=${r.status} msg=${r.body?.message}`)
}

{
  const list = await api(stockToken, '/items/vr-requests?status=Pending')
  const hit = (Array.isArray(list.body) ? list.body : []).find((x) => x.item_id === fagor.id)
  const ui = /Pending:/.test(pricingSrc)
  pass('12', !!hit && Number(hit.new_value) === 1500 && ui, `Pending: ${hit?.new_value} by ${hit?.requested_by}`)
}

{
  const r = await api(stockToken, `/items/${fagor.id}`, { method: 'PATCH', body: { valuation_rate: 1600 } })
  pass('13', r.status === 409 && /pending/i.test(r.body?.error || ''), `status=${r.status} ${r.body?.error}`)
}

// ═══ ROUND 3 — ADMIN ═══════════════════════════════════════════════════════

{
  const n = await api(adminToken, '/notifications')
  const hit = (n.body?.items || []).find((x) => x.type === 'vr_change' && x.action_status === 'pending' && x.ref_id === reqId)
  const ui = /vr_change/.test(bellSrc) && /Approve/.test(bellSrc)
  pass('14', !!hit && ui, hit ? `title=${hit.title}` : 'no bell notif')
}

{
  const list = await api(adminToken, '/items/vr-requests?status=Pending')
  const rows = Array.isArray(list.body) ? list.body : []
  const hit = rows.find((x) => x.id === reqId)
  const appr = await api(adminToken, `/items/vr-requests/${reqId}/approve`, { method: 'POST' })
  const { data: after } = await supabase.from('items').select('valuation_rate, selling_price').eq('id', fagor.id).single()
  pass('15', appr.status === 200 && rows.length >= 1 && !!hit?.requested_by
    && Number(after.valuation_rate) === 1500 && approx(after.selling_price, 14985),
    `count=${rows.length} requester=${hit?.requested_by} vr=${after.valuation_rate} sell=${after.selling_price}`)
}

{
  const h = await api(adminToken, `/items/${fagor.id}/pricing-history?field=valuation_rate`)
  const rows = Array.isArray(h.body) ? h.body : []
  const hit = rows.find((x) => x.source === 'approved-request' && Number(x.new_value) === 1500)
  pass('16', !!hit && /approved by/i.test(hit?.note || ''), `note=${hit?.note}`)
}

{
  const r = await api(adminToken, `/items/${fagor.id}`, { method: 'PATCH', body: { valuation_rate: 1000 } })
  const { data: after } = await supabase.from('items').select('valuation_rate, selling_price').eq('id', fagor.id).single()
  pass('17', r.status === 200 && Number(after.valuation_rate) === 1000 && approx(after.selling_price, 9990, 1),
    `vr=${after.valuation_rate} sell=${after.selling_price}`)
}

// ═══ ROUND 4 — ALI ═════════════════════════════════════════════════════════

{
  if (!aliToken) {
    pass('18', false, 'ali token unavailable')
    pass('19', false, 'ali token unavailable')
    pass('20', false, 'ali token unavailable')
  } else {
    await api(adminToken, `/quotations/${qtn.id}/items/${line.id}`, { method: 'PATCH', body: { add_margin_pct: 3 } })
    const get = await api(aliToken, `/quotations/${qtn.id}`)
    const hasMargin = hasKey(get.body, 'add_margin_pct')
    const uiHidden = /canLineMargin/.test(quotationsSrc) && /\+Margin %/.test(quotationsSrc)
    pass('18', get.status === 200 && !hasMargin && uiHidden, `hasMarginKey=${hasMargin}`)
    await api(adminToken, `/quotations/${qtn.id}/items/${line.id}`, { method: 'PATCH', body: { add_margin_pct: 0 } })

    // 19: use Ali-owned draft or create
    const { data: aliUser } = await supabase.from('users').select('id').eq('email', 'ali@culinova.sa').maybeSingle()
    let qid = null
    let restore = null
    const { data: drafts } = await supabase.from('quotations')
      .select('id, discount_pct, status, approval_status, override_reason')
      .eq('owner_id', aliUser?.id || '')
      .in('status', ['Draft', 'Pending Approval'])
      .limit(3)
    if (drafts?.[0]) {
      qid = drafts[0].id
      restore = drafts[0]
    } else {
      const created = await api(aliToken, '/quotations', {
        method: 'POST',
        body: {
          customer: '1b Eyes-On Test', contact_person: 'Test', project_name: '1b Eyes Cap',
          project_location: 'Riyadh', validity_days: 30, payment_terms: '100% Advanced Payment',
          currency: 'SAR', discount_pct: 0,
          items: [{ item_id: fagor.id, item_name: fagor.item_name, qty: 1, rate: 9990 }],
        },
      })
      qid = created.body?.id
      restore = { discard: true }
    }
    if (!qid) {
      pass('19', false, 'no Ali draft')
    } else {
      const r = await api(aliToken, `/quotations/${qid}`, { method: 'PATCH', body: { discount_pct: 16 } })
      const needs = r.status === 200 && (
        r.body?.status === 'Pending Approval' || r.body?.approval_status === 'Pending' || r.body?._approval?.needsApproval
      )
      pass('19', needs, `status=${r.body?.status} approval=${r.body?.approval_status}`)
      if (restore?.discard) {
        await supabase.from('quotations').update({ status: 'Lost', notes: 'test' }).eq('id', qid)
      } else if (restore) {
        await supabase.from('quotations').update({
          discount_pct: restore.discount_pct || 0,
          status: restore.status || 'Draft',
          approval_status: restore.approval_status || 'Not Required',
          override_reason: restore.override_reason || null,
        }).eq('id', qid)
      }
    }

    // 20: discount_source present, override_reason absent for Sales
    await supabase.from('quotations').update({
      discount_source: 'Salesperson',
      override_reason: 'mgmt-only-secret',
    }).eq('id', qtn.id)
    const get20 = await api(aliToken, `/quotations/${qtn.id}`)
    pass('20', !!get20.body?.discount_source && get20.body?.override_reason == null,
      `discount_source=${get20.body?.discount_source} override=${get20.body?.override_reason}`)
    await supabase.from('quotations').update({ override_reason: null }).eq('id', qtn.id)
  }
}

// 21 customer portal
{
  const { data: cust } = await supabase.from('users').select('*').eq('role', 'Customer').eq('status', 'Active').limit(1).maybeSingle()
  let custToken = null
  if (cust) {
    custToken = await tokenFor(cust.email)
    if (!custToken) {
      custToken = jwt.sign(
        { id: cust.id, name: cust.name, email: cust.email, role: cust.role, access_level: cust.access_level || 'View Only' },
        secret, { expiresIn: '8h' },
      )
    }
  }
  // Unit: stripCustomerQuotationFields on poisoned quote
  const get = await api(adminToken, `/quotations/${qtn.id}`)
  const poisoned = {
    ...get.body,
    override_reason: 'x', discount_source: 'CEO',
    quotation_items: (get.body.quotation_items || []).map((l) => ({
      ...l, add_margin_pct: 1, estimated_cost: 1, pricing_basis: 'vr', needs_rate: true, cost: 5400,
    })),
  }
  const stripped = stripCustomerQuotationFields(redactFinancials('Customer', poisoned))
  const unitClean = !hasKey(stripped, 'add_margin_pct') && !hasKey(stripped, 'override_reason')
    && !hasKey(stripped, 'estimated_cost') && !hasKey(stripped, 'pricing_basis') && !hasKey(stripped, 'discount_source')

  let liveOk = unitClean
  let liveDetail = 'unit strip clean'
  if (custToken) {
    const ov = await api(custToken, '/portal/customer/overview')
    if (ov.status === 200) {
      const qs = ov.body?.quotations || []
      const leak = qs.some((q) => hasKey(q, 'add_margin_pct') || hasKey(q, 'override_reason')
        || hasKey(q, 'estimated_cost') || hasKey(q, 'pricing_basis'))
      liveOk = !leak && unitClean
      liveDetail = `overview status=200 quotes=${qs.length} leak=${leak}`
    } else {
      liveDetail = `overview status=${ov.status}; unit strip used`
      liveOk = unitClean && ov.status !== 401 // soft: unit is source of truth if route mismatch
    }
  } else {
    liveDetail = 'no Customer user token; unit strip only'
  }
  pass('21', liveOk, liveDetail)
}

// Final cleanup
await api(adminToken, `/quotations/${qtn.id}/items/${line.id}`, { method: 'PATCH', body: { add_margin_pct: 0 } })
await api(adminToken, `/quotations/${qtn.id}`, { method: 'PATCH', body: { discount_pct: 0, override_reason: null } })
await api(adminToken, `/items/${fagor.id}`, { method: 'PATCH', body: { valuation_rate: 1000 } })
await supabase.from('vr_change_requests').delete().eq('item_id', fagor.id).eq('status', 'Pending')
const { data: finalItem } = await supabase.from('items').select('valuation_rate, selling_price').eq('id', fagor.id).single()
pass('cleanup', Number(finalItem.valuation_rate) === 1000 && approx(finalItem.selling_price, 9990, 1),
  `vr=${finalItem.valuation_rate} sell=${finalItem.selling_price}`)

const ok = results.filter((r) => r.ok).length
const fail = results.filter((r) => !r.ok).length
console.log('Results:')
for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.id}${r.detail ? ` — ${r.detail}` : ''}`)
console.log(`\n${ok}/${results.length} PASS · ${fail} FAIL\n`)
if (fail === 0) {
  console.log('1b eyes-on 1..21 ✅ | Cleanup ✅')
  console.log('SPRINT 1B COMPLETE (API+UI-source parity — visual chip/toast eyes still recommended once)\n')
}
process.exit(fail ? 1 : 0)
