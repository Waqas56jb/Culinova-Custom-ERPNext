/**
 * Sprint 1a Block 2 verification — brand CRUD unblock, audit trail, delete guard.
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const BASE = (process.env.BASE || `http://localhost:${process.env.PORT || 5050}/api`).replace(/\/$/, '')
const DATABASE_URL = process.env.DATABASE_URL
const MARK = 'ZZ-BLK2'
const results = []
const pass = (name, ok, detail = '') => results.push({ name, ok, detail })
const createdIds = []

const j = async (res) => {
  const text = await res.text()
  try { return text ? JSON.parse(text) : {} } catch { return { error: text, status: res.status } }
}

const login = async () => {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@gmail.com', password: 'admin@123!' }),
  })
  const data = await j(res)
  return data.token
}

const token = await login()
if (!token) {
  console.error('Login failed — is the API running at', BASE, '?')
  process.exit(1)
}
const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

const api = async (path, opts = {}) => {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { ...H, ...(opts.headers || {}) } })
  const body = await j(res)
  return { status: res.status, body }
}

let brandA = null
let brandB = null

// ── (a) POST with factors 5.0/1.5 → 201, factors_pending=false ─────────────
try {
  const { status, body } = await api('/masters/brands', {
    method: 'POST',
    body: JSON.stringify({ brand: `${MARK}-A`, currency: 'EUR', exchange_factor: 5.0, price_factor: 1.5 }),
  })
  brandA = body
  if (body?.id) createdIds.push(body.id)
  pass('(a) POST brand factors 5.0/1.5 → 201, factors_pending=false',
    status === 201 && body.factors_pending === false,
    `status=${status} factors_pending=${body.factors_pending}`)
} catch (e) {
  pass('(a) POST brand factors 5.0/1.5 → 201, factors_pending=false', false, e.message)
}

// ── (b) POST with factors 1/1 → factors_pending=true ───────────────────────
try {
  const { status, body } = await api('/masters/brands', {
    method: 'POST',
    body: JSON.stringify({ brand: `${MARK}-B`, currency: 'SAR', exchange_factor: 1, price_factor: 1 }),
  })
  brandB = body
  if (body?.id) createdIds.push(body.id)
  pass('(b) POST brand factors 1/1 → factors_pending=true',
    status === 201 && body.factors_pending === true,
    `status=${status} factors_pending=${body.factors_pending}`)
} catch (e) {
  pass('(b) POST brand factors 1/1 → factors_pending=true', false, e.message)
}

// ── (c) PATCH identity field (description) → 200 (no 403) ─────────────────
try {
  const id = brandA?.id
  const { status, body } = await api(`/masters/brands/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ description: `${MARK} test description` }),
  })
  pass('(c) PATCH description → 200 (no 403)', status === 200 && body.description?.includes(MARK),
    `status=${status}`)
} catch (e) {
  pass('(c) PATCH description → 200 (no 403)', false, e.message)
}

// ── (d) PATCH exchange_factor → brand_audit_log row with old/new/user ─────
try {
  const id = brandA?.id
  const beforeEx = brandA?.exchange_factor
  const { status } = await api(`/masters/brands/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ exchange_factor: 5.5 }),
  })
  let auditOk = false
  let auditDetail = `patch status=${status}`
  if (DATABASE_URL && id) {
    const c = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })
    await c.connect()
    const { rows } = await c.query(
      `select field, old_value, new_value, changed_by from brand_audit_log
       where brand_id = $1 and field = 'exchange_factor' order by created_at desc limit 1`,
      [id],
    )
    await c.end()
    const row = rows[0]
    auditOk = status === 200 && row && String(row.old_value) === String(beforeEx) && String(row.new_value) === '5.5' && !!row.changed_by
    auditDetail = row ? `${row.field}: ${row.old_value} → ${row.new_value} by ${row.changed_by}` : 'no audit row'
  } else {
    auditOk = status === 200
    auditDetail += ' (DATABASE_URL not set — skipped DB audit check)'
  }
  pass('(d) PATCH exchange_factor → brand_audit_log row', auditOk, auditDetail)
} catch (e) {
  pass('(d) PATCH exchange_factor → brand_audit_log row', false, e.message)
}

// ── (e) DELETE in-use brand (CULINOVA) → 409 with count ────────────────────
try {
  const { body: brands } = await api('/masters/brands')
  const culinova = (brands || []).find((b) => String(b.brand || '').toUpperCase() === 'CULINOVA')
  if (!culinova?.id) {
    pass('(e) DELETE in-use brand → 409', false, 'CULINOVA brand not found in list')
  } else {
    const { status, body } = await api(`/masters/brands/${culinova.id}`, { method: 'DELETE' })
    pass('(e) DELETE in-use brand → 409 with count',
      status === 409 && body.error?.includes('in use') && Number(body.item_count) > 0,
      `status=${status} ${body.error || ''} count=${body.item_count ?? '?'}`)
  }
} catch (e) {
  pass('(e) DELETE in-use brand → 409 with count', false, e.message)
}

// ── (f) DELETE unused test brands → 200 + audit __deleted rows ─────────────
try {
  let allOk = true
  const details = []
  for (const id of [...createdIds]) {
    const { status, body } = await api(`/masters/brands/${id}`, { method: 'DELETE' })
    details.push(`${id.slice(0, 8)}… status=${status}`)
    if (status !== 200) allOk = false
    if (DATABASE_URL && status === 200) {
      const c = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })
      await c.connect()
      const { rows } = await c.query(
        `select field from brand_audit_log where brand_id = $1 and field = '__deleted' limit 1`,
        [id],
      )
      await c.end()
      if (!rows.length) { allOk = false; details.push('missing __deleted audit') }
    }
  }
  pass('(f) DELETE unused test brands → 200 + audit rows', allOk && createdIds.length >= 2, details.join('; '))
  createdIds.length = 0
} catch (e) {
  pass('(f) DELETE unused test brands → 200 + audit rows', false, e.message)
}

// ── Cleanup any leftover test brands ───────────────────────────────────────
try {
  const { body: brands } = await api('/masters/brands')
  for (const b of brands || []) {
    if (String(b.brand || '').startsWith(MARK)) {
      await api(`/masters/brands/${b.id}`, { method: 'DELETE' }).catch(() => {})
    }
  }
} catch { /* ignore */ }

// ── (g) PASS/FAIL table ────────────────────────────────────────────────────
console.log(`\n######## BLOCK 2 VERIFY — ${BASE} ########\n`)
const w = Math.max(...results.map((r) => r.name.length), 20)
for (const { name, ok, detail } of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(w)}  ${detail}`)
}
const passed = results.filter((r) => r.ok).length
console.log(`\n${passed}/${results.length} passed\n`)
process.exit(passed === results.length ? 0 : 1)
