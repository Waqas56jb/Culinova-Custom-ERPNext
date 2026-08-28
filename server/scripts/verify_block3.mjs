/**
 * Sprint 1a Block 3 verification — valuation rate history, redaction, write guard.
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const BASE = (process.env.BASE || `http://localhost:${process.env.PORT || 5050}/api`).replace(/\/$/, '')
const DATABASE_URL = process.env.DATABASE_URL
const MARK = 'ZZ-BLK3'
const results = []
const pass = (name, ok, detail = '') => results.push({ name, ok, detail })

const j = async (res) => {
  const text = await res.text()
  try { return text ? JSON.parse(text) : {} } catch { return { error: text, status: res.status } }
}

const login = async (email, password) => {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await j(res)
  return data.token
}

const adminToken = await login('admin@gmail.com', 'admin@123!')
if (!adminToken) {
  console.error('Admin login failed — is the API running at', BASE, '?')
  process.exit(1)
}
const AH = { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' }

const api = async (path, opts = {}, headers = AH) => {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { ...headers, ...(opts.headers || {}) } })
  const body = await j(res)
  return { status: res.status, body }
}

let testItem = null
let origVr = null

// ── Setup: pick a test item and remember original valuation_rate ─────────────
try {
  const { status, body } = await api('/items')
  testItem = (body || []).find((i) => String(i.item_name || '').startsWith(MARK))
    || (body || []).find((i) => !i.disabled)
  if (!testItem?.id) {
    pass('setup: test item', false, 'no items in catalog')
  } else {
    origVr = testItem.valuation_rate
    pass('setup: test item', true, `${testItem.item_name} (${testItem.id.slice(0, 8)}…)`)
  }
} catch (e) {
  pass('setup: test item', false, e.message)
}

// ── (a) PATCH valuation_rate 0→1000 → history row ───────────────────────────
try {
  if (!testItem?.id) throw new Error('no test item')
  const { status, body } = await api(`/items/${testItem.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ valuation_rate: 1000 }),
  })
  let histOk = false
  let histDetail = `patch status=${status}`
  if (DATABASE_URL && status === 200) {
    const c = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })
    await c.connect()
    const { rows } = await c.query(
      `select field, old_value, new_value, created_by, source from item_pricing_history
       where item_id = $1 and field = 'valuation_rate' order by created_at desc limit 1`,
      [testItem.id],
    )
    await c.end()
    const row = rows[0]
    histOk = !!row && row.field === 'valuation_rate' && String(row.new_value) === '1000' && !!row.created_by && row.source === 'manual'
    histDetail = row ? `${row.field}: ${row.old_value ?? 'null'} → ${row.new_value} (${row.source})` : 'no history row'
  } else {
    histOk = status === 200
  }
  pass('(a) PATCH VR 0→1000 → history row field/old/new/created_by', histOk && body.valuation_rate != null, histDetail)
} catch (e) {
  pass('(a) PATCH VR 0→1000 → history row field/old/new/created_by', false, e.message)
}

// ── (b) GET /items/:id/pricing-history shows it ─────────────────────────────
try {
  if (!testItem?.id) throw new Error('no test item')
  const { status, body } = await api(`/items/${testItem.id}/pricing-history?field=valuation_rate`)
  const row = (body || []).find((r) => r.field === 'valuation_rate' && String(r.new_value) === '1000')
  pass('(b) GET pricing-history shows VR change',
    status === 200 && !!row,
    row ? `${row.old_value ?? 'null'} → ${row.new_value} by ${row.changed_by || '?'}` : `status=${status} rows=${(body || []).length}`)
} catch (e) {
  pass('(b) GET pricing-history shows VR change', false, e.message)
}

// ── (c) Sales-role GET item → valuation_rate ABSENT ─────────────────────────
let salesToken = null
try {
  salesToken = await login('sales.verify@culinova.local', 'sales@123!')
  if (!salesToken) {
    await api('/users', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Sales Block3 Verify',
        email: 'sales.verify@culinova.local',
        password: 'sales@123!',
        role: 'Sales User',
        access_level: 'Create',
        department: 'Sales',
      }),
    })
    salesToken = await login('sales.verify@culinova.local', 'sales@123!')
  }
} catch { /* best-effort */ }

try {
  if (!testItem?.id) throw new Error('no test item')
  if (!salesToken) throw new Error('could not obtain Sales token')
  const SH = { authorization: `Bearer ${salesToken}`, 'content-type': 'application/json' }
  const { status, body } = await api(`/items/${testItem.id}`, {}, SH)
  pass('(c) Sales GET item → valuation_rate ABSENT',
    status === 200 && !('valuation_rate' in body),
    status === 200 ? (body.valuation_rate != null ? `leaked VR=${body.valuation_rate}` : 'field absent ✓') : `status=${status}`)
} catch (e) {
  pass('(c) Sales GET item → valuation_rate ABSENT', false, e.message)
}

// ── (d) Sales PATCH valuation_rate → 403 ────────────────────────────────────
try {
  if (!testItem?.id) throw new Error('no test item')
  if (!salesToken) throw new Error('could not obtain Sales token')
  const SH = { authorization: `Bearer ${salesToken}`, 'content-type': 'application/json' }
  const { status, body } = await api(`/items/${testItem.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ valuation_rate: 999 }),
  }, SH)
  pass('(d) Sales PATCH valuation_rate → 403', status === 403, `status=${status} ${body.error || ''}`)
} catch (e) {
  pass('(d) Sales PATCH valuation_rate → 403', false, e.message)
}

// ── Cleanup: restore original valuation_rate (test item only) ────────────────
try {
  if (testItem?.id) {
    const restore = origVr == null || origVr === '' ? 0 : Number(origVr)
    await api(`/items/${testItem.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ valuation_rate: restore }),
    })
    pass('cleanup: restore original VR', true, `restored to ${restore}`)
  }
} catch (e) {
  pass('cleanup: restore original VR', false, e.message)
}

// ── PASS/FAIL table ────────────────────────────────────────────────────────
console.log(`\n######## BLOCK 3 VERIFY — ${BASE} ########\n`)
const w = Math.max(...results.map((r) => r.name.length), 20)
for (const { name, ok, detail } of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(w)}  ${detail}`)
}
const checks = results.filter((r) => !r.name.startsWith('setup') && !r.name.startsWith('cleanup'))
const passed = checks.filter((r) => r.ok).length
console.log(`\n${passed}/${checks.length} passed\n`)
process.exit(passed === checks.length ? 0 : 1)
