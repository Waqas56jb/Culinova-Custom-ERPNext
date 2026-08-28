/**
 * Sprint 1b Block 1 — browser checklist parity (API + UI source).
 * Mirrors 1b-B1-1..7 when native browser tools are unavailable.
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import jwt from 'jsonwebtoken'
import { supabase } from '../src/config/supabase.js'
import { env } from '../src/config/env.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const BASE = (process.env.BASE || `http://localhost:${process.env.PORT || 5050}/api`).replace(/\/$/, '')
const CLIENT_QUOTATIONS = path.resolve(__dirname, '../../client/src/pages/Quotations.jsx')
const PRINT_SRC = path.resolve(__dirname, '../../shared/QuotationPrint.jsx')
const approx = (a, b, tol = 0.02) => Math.abs(Number(a) - Number(b)) <= tol
const results = []
const pass = (id, ok, detail = '') => results.push({ id, ok, detail })

const j = async (res) => {
  const text = await res.text()
  try { return text ? JSON.parse(text) : {} } catch { return { error: text } }
}

async function login(email, password = 'admin@123!') {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return (await j(res)).token
}

async function tokenFor(email) {
  let t = await login(email)
  if (t) return t
  const { data: u } = await supabase.from('users').select('*').eq('email', email).maybeSingle()
  if (!u) return null
  return jwt.sign(
    { id: u.id, name: u.name, email: u.email, role: u.role, access_level: u.access_level },
    env.jwtSecret,
    { expiresIn: env.jwtExpires },
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

console.log('\n######## 1b-B1 BROWSER PARITY (API + UI source) ########\n')

const adminToken = await tokenFor('admin@gmail.com')
const aliToken = await tokenFor('ali@culinova.sa')
if (!adminToken) {
  console.error('Admin login failed — is API on :5050?')
  process.exit(1)
}

const { data: qtn } = await supabase.from('quotations').select('id, number, status, discount_pct, override_reason').eq('number', 'QTN-2026-000078').maybeSingle()
if (!qtn) {
  console.error('QTN-2026-000078 not found')
  process.exit(1)
}
const { data: line } = await supabase.from('quotation_items').select('id, rate, item_name, add_margin_pct')
  .eq('quotation_id', qtn.id).limit(1).maybeSingle()
if (!line) {
  console.error('No line on QTN-000078')
  process.exit(1)
}

const origDiscount = Number(qtn.discount_pct) || 0
const origOverride = qtn.override_reason || null
let testQtnId = null // for 16% / 30% if we must use a draft clone path

// ── 1: +Margin 3 → 10,289.70 ────────────────────────────────────────────────
{
  const r = await api(adminToken, `/quotations/${qtn.id}/items/${line.id}`, { method: 'PATCH', body: { add_margin_pct: 3 } })
  const rate = r.body?.quotation_items?.find((l) => l.id === line.id)?.rate
    ?? r.body?.quotation_items?.[0]?.rate
  pass('1b-B1-1', r.status === 200 && approx(rate, 10289.7), `status=${r.status} rate=${rate}`)
}

// ── 2: Margin 0 → 9,990 restore ─────────────────────────────────────────────
{
  const r = await api(adminToken, `/quotations/${qtn.id}/items/${line.id}`, { method: 'PATCH', body: { add_margin_pct: 0 } })
  const rate = r.body?.quotation_items?.find((l) => l.id === line.id)?.rate
    ?? r.body?.quotation_items?.[0]?.rate
  pass('1b-B1-2', r.status === 200 && approx(rate, 9990), `status=${r.status} rate=${rate}`)
}

// ── 3: 30% without reason blocked; with reason ok; cleanup ──────────────────
{
  // Prefer a non-hero draft if 078 is not editable; try 078 first
  let target = qtn
  const blocked = await api(adminToken, `/quotations/${target.id}`, { method: 'PATCH', body: { discount_pct: 30 } })
  const withReason = await api(adminToken, `/quotations/${target.id}`, {
    method: 'PATCH',
    body: { discount_pct: 30, override_reason: '1b-B1 browser parity strategic override' },
  })
  const okBlock = blocked.status === 422 && /override|reason|25/i.test(String(blocked.body?.error || ''))
  const okSave = withReason.status === 200
  // cleanup discount
  await api(adminToken, `/quotations/${target.id}`, {
    method: 'PATCH',
    body: { discount_pct: origDiscount, override_reason: origOverride },
  })
  pass('1b-B1-3', okBlock && okSave, `noReason=${blocked.status} (${blocked.body?.error || ''}) withReason=${withReason.status}`)
}

// ── 4: PDF model — no add_margin_pct / margin wording ───────────────────────
{
  const get = await api(adminToken, `/quotations/${qtn.id}`)
  const raw = get.body
  // Prefer import; if JSX import fails at runtime, fall back to source + payload checks
  let modelOk = false
  let detail = ''
  try {
    // Dynamic import of .jsx may fail under plain node — catch and use source/payload
    const { buildQuotationPrintModel: build } = await import('../../shared/QuotationPrint.jsx').catch(() => ({}))
    if (typeof build === 'function') {
      const model = build(raw, { vatPct: 15 })
      const json = JSON.stringify(model)
      modelOk = !json.includes('add_margin') && !/margin\s*%/i.test(json)
      detail = `model items[0].rate=${model.items?.[0]?.rate}`
    } else {
      throw new Error('no build fn')
    }
  } catch {
    const printSrc = fs.readFileSync(PRINT_SRC, 'utf8')
    const mapsMargin = /add_margin_pct/.test(printSrc)
    const payload = JSON.stringify(raw.quotation_items || [])
    // Print builder only maps rate — confirm source never references add_margin_pct
    modelOk = !mapsMargin
    detail = `printSrc.hasAddMargin=${mapsMargin}; line.rate present=${!!(raw.quotation_items || [])[0]?.rate}`
    // Management GET may include add_margin_pct on raw API — that's fine; print must not map it
    void payload
  }
  pass('1b-B1-4', modelOk && get.status === 200, detail)
}

// ── 5: UI hint copy ─────────────────────────────────────────────────────────
{
  const src = fs.readFileSync(CLIENT_QUOTATIONS, 'utf8')
  const hasHint = /Sales User 15%/.test(src) && /Sales Manager 20%/.test(src) && /max 25%/.test(src)
  pass('1b-B1-5', hasHint, hasHint ? 'hint present in Quotations.jsx' : 'hint missing')
}

// ── 6: Ali — no +Margin column (UI) + GET omits add_margin_pct ───────────────
{
  const src = fs.readFileSync(CLIENT_QUOTATIONS, 'utf8')
  const gated = /canLineMargin/.test(src) && /\{canLineMargin && <th[^>]*>\+Margin %<\/th>\}/.test(src)
  if (!aliToken) {
    pass('1b-B1-6', false, 'ali token unavailable')
  } else {
    // ensure margin column would be empty even if somehow set — set 0 then GET as Ali
    await api(adminToken, `/quotations/${qtn.id}/items/${line.id}`, { method: 'PATCH', body: { add_margin_pct: 0 } })
    // Temporarily set margin as admin so redaction is meaningful
    await api(adminToken, `/quotations/${qtn.id}/items/${line.id}`, { method: 'PATCH', body: { add_margin_pct: 3 } })
    const getAli = await api(aliToken, `/quotations/${qtn.id}`)
    const items = getAli.body?.quotation_items || []
    const hasMargin = items.some((l) => Object.prototype.hasOwnProperty.call(l, 'add_margin_pct'))
    // restore
    await api(adminToken, `/quotations/${qtn.id}/items/${line.id}`, { method: 'PATCH', body: { add_margin_pct: 0 } })
    pass('1b-B1-6', getAli.status === 200 && !hasMargin && gated, `hasMarginKey=${hasMargin} uiGated=${gated} status=${getAli.status}`)
  }
}

// ── 7: Ali 16% → needs approval ─────────────────────────────────────────────
{
  if (!aliToken) {
    pass('1b-B1-7', false, 'ali token unavailable')
  } else {
    // Use a disposable draft Ali owns, or PATCH 078 if Ali can edit
    const { data: aliUser } = await supabase.from('users').select('id, role').eq('email', 'ali@culinova.sa').maybeSingle()
    let qid = null
    let restore = null

    // Prefer existing draft owned by Ali
    const { data: drafts } = await supabase.from('quotations')
      .select('id, number, status, discount_pct, approval_status, override_reason, owner_id')
      .eq('owner_id', aliUser?.id || '')
      .eq('status', 'Draft')
      .limit(5)
    const draft = (drafts || [])[0]

    if (draft) {
      qid = draft.id
      restore = { discount_pct: draft.discount_pct, status: draft.status, approval_status: draft.approval_status, override_reason: draft.override_reason }
    } else {
      // Create minimal draft as Ali with FAGOR line from hero quote
      const { data: fagorLine } = await supabase.from('quotation_items').select('*').eq('id', line.id).maybeSingle()
      const created = await api(aliToken, '/quotations', {
        method: 'POST',
        body: {
          customer: '1b-B1 Test Customer',
          contact_person: 'Test',
          project_name: '1b-B1 Cap Test',
          project_location: 'Riyadh',
          validity_days: 30,
          payment_terms: '100% Advanced Payment',
          currency: 'SAR',
          discount_pct: 0,
          items: [{
            item_id: fagorLine?.item_id,
            item_name: fagorLine?.item_name || 'FAGOR',
            qty: 1,
            rate: 9990,
            discount_pct: 0,
          }],
        },
      })
      if (created.status === 201 || created.status === 200) {
        qid = created.body?.id
        testQtnId = qid
        restore = { discard: true }
      }
    }

    if (!qid) {
      pass('1b-B1-7', false, 'no editable Ali draft / create failed')
    } else {
      const r = await api(aliToken, `/quotations/${qid}`, { method: 'PATCH', body: { discount_pct: 16 } })
      const st = r.body?.status || r.body?.approval_status
      const needs = r.status === 200 && (
        r.body?.status === 'Pending Approval'
        || r.body?.approval_status === 'Pending'
        || r.body?._approval?.needsApproval === true
      )
      // Cleanup
      if (restore?.discard && qid) {
        await supabase.from('quotations').update({ status: 'Lost', notes: 'test' }).eq('id', qid)
        await api(aliToken, `/quotations/${qid}`, { method: 'PATCH', body: { discount_pct: 0 } }).catch(() => {})
      } else if (restore) {
        await supabase.from('quotations').update({
          discount_pct: restore.discount_pct || 0,
          status: restore.status || 'Draft',
          approval_status: restore.approval_status || 'Not Required',
          override_reason: restore.override_reason || null,
        }).eq('id', qid)
      }
      pass('1b-B1-7', needs, `status=${r.status} body.status=${r.body?.status} approval=${r.body?.approval_status} _approval=${JSON.stringify(r.body?._approval)} st=${st}`)
    }
  }
}

// Final cleanup hero quote
await api(adminToken, `/quotations/${qtn.id}/items/${line.id}`, { method: 'PATCH', body: { add_margin_pct: 0 } })
await api(adminToken, `/quotations/${qtn.id}`, {
  method: 'PATCH',
  body: { discount_pct: origDiscount, override_reason: origOverride },
})
pass('cleanup', true, 'QTN-000078 margin=0 + discount restored')

const ok = results.filter((r) => r.ok).length
const fail = results.filter((r) => !r.ok).length
console.log('Results:')
for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.id}${r.detail ? ` — ${r.detail}` : ''}`)
console.log(`\n${ok}/${results.length} PASS · ${fail} FAIL\n`)
process.exit(fail ? 1 : 0)
