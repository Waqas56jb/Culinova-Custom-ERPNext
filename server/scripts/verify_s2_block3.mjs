/**
 * Sprint 2 Block 3 — EOS approval webhook + status surface (ERP side)
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'
import jwt from 'jsonwebtoken'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const { supabase } = await import('../src/config/supabase.js')
const { env } = await import('../src/config/env.js')

const BASE = (process.env.BASE || `http://localhost:${process.env.PORT || 5050}/api`).replace(/\/$/, '')
const results = []
const pass = (id, ok, detail = '') => results.push({ id, ok, detail })
const secret = process.env.JWT_SECRET || env.jwtSecret
const integKey = env.erpEosIntegrationKey

const j = async (res) => {
  const text = await res.text()
  try { return text ? JSON.parse(text) : {} } catch { return { error: text } }
}

async function tokenFor(email) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'admin@123!' }),
  })
  const body = await j(res)
  if (body.token) return body.token
  const { data: u } = await supabase.from('users').select('id, name, email, role, access_level, status').eq('email', email).maybeSingle()
  if (!u) return null
  return jwt.sign({ id: u.id, name: u.name, email: u.email, role: u.role, access_level: u.access_level }, secret, { expiresIn: '8h' })
}

console.log('\n######## SPRINT 2 BLOCK 3 — EOS WEBHOOK IMPORT (ERP) ########\n')

if (!integKey) {
  console.error('ERP_EOS_INTEGRATION_KEY / ERP_INTEGRATION_KEY not set in server/.env')
  process.exit(1)
}

const adminToken = await tokenFor('admin@gmail.com')
if (!adminToken) { console.error('Need admin'); process.exit(1) }

// Prefer an already-approved EOS-linked item (hash-check → cheap unchanged)
let entryId = null
{
  const { data: linked } = await supabase.from('items').select('eos_entry_id').not('eos_entry_id', 'is', null).limit(1).maybeSingle()
  entryId = linked?.eos_entry_id || null
}
if (!entryId) {
  // fall back: ask EOS pending catalog via ERP helper
  try {
    const { eosPending } = await import('../src/core/eos.js')
    const pend = await eosPending({ limit: 5 })
    entryId = (pend.entries || []).find((e) => e.id)?.id || null
  } catch (e) {
    console.warn('Could not resolve EOS entry via pending:', e.message)
  }
}

if (!entryId) {
  pass('a) POST items/import', false, 'no approved EOS entry id available — seed/link one first')
} else {
  // a) bad key → 401
  const bad = await fetch(`${BASE}/integrations/eos/items/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-erp-integration-key': 'definitely-wrong-key' },
    body: JSON.stringify({ eos_entry_ids: [entryId] }),
  })
  const badBody = await j(bad)
  pass('a1) bad key → 401', bad.status === 401, `status=${bad.status} ${badBody.error || ''}`)

  // a) valid key → import
  const okRes = await fetch(`${BASE}/integrations/eos/items/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-erp-integration-key': integKey },
    body: JSON.stringify({ eos_entry_ids: [entryId] }),
  })
  const okBody = await j(okRes)
  const modes = (okBody.items || []).map((i) => i.mode)
  const modeOk = okRes.status === 200 && (
    (okBody.created || 0) + (okBody.updated || 0) + (okBody.linked || 0) + (okBody.unchanged || 0) >= 1
    || modes.some((m) => ['created', 'updated', 'linked', 'unchanged'].includes(m))
  )
  pass(
    'a2) valid key → imported/linked/unchanged',
    modeOk,
    `status=${okRes.status} created=${okBody.created} updated=${okBody.updated} linked=${okBody.linked} unchanged=${okBody.unchanged} failed=${okBody.failed} source=${okBody.source}`
  )

  // b) status shows last_webhook_import_at
  const st = await fetch(`${BASE}/integrations/eos/status`, {
    headers: { authorization: `Bearer ${adminToken}` },
  })
  const stBody = await j(st)
  pass(
    'b) status last_webhook_import_at set',
    st.status === 200 && Boolean(stBody.last_webhook_import_at),
    `status=${st.status} webhook=${stBody.last_webhook_import_at || 'null'} timer=${stBody.last_timer_run_at || 'null'}`
  )
}

// policy default / cadence surface
{
  const { data: row } = await supabase.from('system_settings').select('value').eq('key', 'eos_auto_sync_minutes').maybeSingle()
  const mins = Number(row?.value)
  pass('c) eos_auto_sync_minutes fallback ≥ 60 (or unset→code default)', !row || mins >= 60, `db=${row?.value ?? 'unset'}`)
}

console.log('\n── Regressions (s2:block2 nests block1 + block4) ──')
{
  const r = spawnSync('node', [path.join(__dirname, 'verify_s2_block2.mjs')], {
    encoding: 'utf8', cwd: path.resolve(__dirname, '..'), timeout: 600000,
  })
  const out = `${r.stdout || ''}${r.stderr || ''}`
  const tail = out.split(/\r?\n/).filter(Boolean).slice(-6).join(' | ')
  pass('d) verify:s2:block2 (incl. block1 + block4)', r.status === 0, r.status === 0 ? 'exit 0' : `exit ${r.status} · ${tail.slice(0, 240)}`)
}

console.log('\n======== RESULTS ========')
let fails = 0
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id}${r.detail ? ` — ${r.detail}` : ''}`)
  if (!r.ok) fails++
}
console.log(fails ? `\n${fails} FAIL(s)\n` : '\nALL PASS\n')

console.log(`
MANUAL EYES-ON CHECKLIST (Sprint 2 Block 3 — cross-app)
───────────────────────────────────────────────────────
EOS admin (:5173-eos or local admin): approve an entry
  → toast "Approved · synced to ERP"
ERP Item Master (:5173): refresh list — item appears WITHOUT clicking Import
  → name / Brand / Model / Family; brand factors-pending badge if new brand
ERP: Engineering Request from Opportunity WITH attachment
  → EOS Inbox → attachment opens; link must still work later (permanent)
  → push back → ERP prefill
Integrations status: last_webhook_import_at + last_timer_run_at visible
Cleanup: mark/remove test entry/item/request

ENV (same names both repos — no new Vercel keys):
  ERP:  ERP_EOS_INTEGRATION_KEY  (fallback ERP_INTEGRATION_KEY)
  EOS:  ERP_INTEGRATION_KEY      (fallback ERP_EOS_INTEGRATION_KEY)
  EOS:  ERP_API_URL              (ERP base, e.g. http://localhost:5050)
  ERP:  EOS_API_URL              (EOS base, e.g. http://localhost:4400)
`)

process.exit(fails ? 1 : 0)
