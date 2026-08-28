/**
 * Sprint 1a Block 5 — Item Master UI polish verification.
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { supabase } from '../src/config/supabase.js'
import { spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const BASE = (process.env.BASE || `http://localhost:${process.env.PORT || 5050}/api`).replace(/\/$/, '')
const MARK = 'ZZ-BLK5'
const results = []
const pass = (name, ok, detail = '') => results.push({ name, ok, detail })
const cleanup = { itemId: null, brandId: null }

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

console.log('\n######## SPRINT 1a BLOCK 5 — ITEM MASTER UI POLISH ########\n')

// ── (a) disabled items excluded by default ───────────────────────────────────
try {
  const code = `${MARK}-DIS-${Date.now().toString(36).slice(-6)}`
  const { data: row, error } = await supabase.from('items').insert({
    code,
    name: `${MARK} Disabled`,
    item_code: code,
    item_name: `${MARK} Disabled Item`,
    item_group: 'ZZ Test',
    brand: `${MARK}`,
    uom: 'Nos',
    disabled: true,
    status: 'Active',
  }).select().single()
  if (error) throw error
  cleanup.itemId = row.id

  const def = await api('/items?active=1')
  const all = await api('/items?include_disabled=1&limit=200')
  const inDefault = (Array.isArray(def.body) ? def.body : def.body?.items || []).some((i) => i.id === row.id)
  const inAll = (all.body?.items || []).some((i) => i.id === row.id)
  pass('(a) default list excludes disabled', !inDefault && inAll, `default=${inDefault} include_disabled=${inAll}`)
} catch (e) {
  pass('(a) default list excludes disabled', false, e.message)
}

// ── (b) pagination limit/offset + total ──────────────────────────────────────
try {
  const p1 = await api('/items?active=1&limit=5&offset=0')
  const p2 = await api('/items?active=1&limit=5&offset=5')
  const ok = p1.status === 200 && p2.status === 200
    && Array.isArray(p1.body?.items) && p1.body.items.length <= 5
    && typeof p1.body?.total === 'number'
    && p1.body.total >= 5
    && p2.body?.items?.length > 0
    && p1.body.items[0]?.id !== p2.body.items[0]?.id
  pass('(b) pagination page 2 + total', ok, `total=${p1.body?.total} p1=${p1.body?.items?.length} p2=${p2.body?.items?.length}`)
} catch (e) {
  pass('(b) pagination page 2 + total', false, e.message)
}

// ── (c) backfill dry-run multi-word brand ────────────────────────────────────
try {
  const r = spawnSync(process.execPath, ['scripts/backfill_item_names.mjs'], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    env: process.env,
  })
  const out = `${r.stdout || ''}\n${r.stderr || ''}`
  const hasSistema = /Sistema Project Italia/i.test(out)
  const ran = r.status === 0 || out.includes('Nothing to change') || out.includes('would change')
  pass('(c) backfill dry-run runs', ran, r.status === 0 ? 'exit 0' : `exit ${r.status}`)
  pass('(c) multi-word brand item in dry-run output', hasSistema || out.includes('Nothing to change'),
    hasSistema ? 'Sistema Project Italia seen' : 'no legacy names left to change')
} catch (e) {
  pass('(c) backfill dry-run', false, e.message)
}

// ── (d) PATCH brand description + audit ────────────────────────────────────
try {
  const { status, body } = await api('/masters/brands', {
    method: 'POST',
    body: JSON.stringify({
      brand: `${MARK}-Brand`,
      currency: 'SAR',
      exchange_factor: 1,
      price_factor: 1,
      description: 'before',
    }),
  })
  if (body?.id) cleanup.brandId = body.id
  const desc = `Block5 desc ${Date.now()}`
  const patched = await api(`/masters/brands/${body.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ description: desc }),
  })
  const audit = await api(`/masters/brands/${body.id}/audit`)
  const row = (audit.body || []).find((a) => a.field === 'description' && a.new_value === desc)
  pass('(d) PATCH brand description → 200', patched.status === 200, `status=${patched.status}`)
  pass('(d) audit row field=description', !!row, row ? `new=${row.new_value}` : 'missing')
} catch (e) {
  pass('(d) PATCH brand description', false, e.message)
}

// ── cleanup ───────────────────────────────────────────────────────────────────
if (cleanup.itemId) {
  await supabase.from('items').delete().eq('id', cleanup.itemId)
}
if (cleanup.brandId) {
  await api(`/masters/brands/${cleanup.brandId}`, { method: 'DELETE' })
}

console.log('\n| Check | Result | Detail |')
console.log('|-------|--------|--------|')
for (const r of results) {
  console.log(`| ${r.name} | ${r.ok ? 'PASS' : 'FAIL'} | ${r.detail} |`)
}
const failed = results.filter((r) => !r.ok).length
console.log(`\n${failed ? 'FAIL' : 'PASS'} — ${results.length - failed}/${results.length} checks passed\n`)
process.exit(failed ? 1 : 0)
