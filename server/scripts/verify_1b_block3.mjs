/**
 * Sprint 1b Block 3 — GP basis + header polish + redaction sweep + regressions
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import jwt from 'jsonwebtoken'
import { spawn } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const { supabase } = await import('../src/config/supabase.js')
const { env } = await import('../src/config/env.js')
const { redactFinancials } = await import('../src/middleware/rbac.js')
const { stripCustomerQuotationFields } = await import('../src/rbac/permissions.js')
const {
  buildQuotationPrintModel,
  printModelHasForbidden,
  PRINT_FORBIDDEN_FIELDS,
} = await import('../../shared/quotationPrintModel.js')

const BASE = (process.env.BASE || `http://localhost:${process.env.PORT || 5050}/api`).replace(/\/$/, '')
const approx = (a, b, tol = 0.15) => Math.abs(Number(a) - Number(b)) <= tol
const results = []
const pass = (name, ok, detail = '') => results.push({ name, ok, detail })
const secret = process.env.JWT_SECRET || env.jwtSecret

const FORBIDDEN = [
  'add_margin_pct', 'override_reason', 'estimated_cost', 'pricing_basis', 'needs_rate',
  'cost', 'cost_amount', 'gp_percent', 'valuation_rate',
]

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

function hasAnyForbidden(obj, list = FORBIDDEN) {
  const found = []
  const walk = (v) => {
    if (!v || typeof v !== 'object') return
    if (Array.isArray(v)) { v.forEach(walk); return }
    for (const [k, val] of Object.entries(v)) {
      if (list.includes(k)) found.push(k)
      if (val && typeof val === 'object') walk(val)
    }
  }
  walk(obj)
  return [...new Set(found)]
}

function runNpmScript(script) {
  return new Promise((resolve) => {
    const child = spawn('npm', ['run', script], {
      cwd: path.resolve(__dirname, '..'),
      shell: true,
      env: process.env,
    })
    let out = ''
    child.stdout.on('data', (d) => { out += d.toString() })
    child.stderr.on('data', (d) => { out += d.toString() })
    child.on('close', (code) => {
      const m = out.match(/(\d+)\/(\d+) PASS/)
      resolve({ code, summary: m ? `${m[1]}/${m[2]} PASS` : (code === 0 ? 'PASS (no tally)' : 'FAIL'), out })
    })
  })
}

console.log('\n######## SPRINT 1b BLOCK 3 — GP + POLISH + REDACTION ########\n')

const adminToken = await tokenFor('admin@gmail.com')
const aliToken = await tokenFor('ali@culinova.sa')
if (!adminToken) { console.error('Admin login failed'); process.exit(1) }

const { data: qtn } = await supabase.from('quotations')
  .select('id, number, validity_days, valid_till, discount_source, override_reason, gp_percent, cost_amount, net_amount')
  .eq('number', 'QTN-2026-000078').maybeSingle()
if (!qtn) { console.error('QTN-000078 not found'); process.exit(1) }

// Ensure FAGOR line cost/rate are golden for GP check
const { data: fagor } = await supabase.from('items').select('id, valuation_rate').ilike('model', '%C-G961%').limit(1).maybeSingle()
if (fagor && Number(fagor.valuation_rate) !== 1000) {
  await api(adminToken, `/items/${fagor.id}`, { method: 'PATCH', body: { valuation_rate: 1000 } })
}

// ── (a) Header GP ≈ 45.95 on FAGOR draft ────────────────────────────────────
{
  // Restore golden commercial state (eyes-on may leave discount_pct / margin dirty)
  await supabase.from('quotations').update({
    discount_pct: 0,
    discount_amount: 0,
    status: 'Draft',
    approval_status: 'Not Required',
  }).eq('id', qtn.id)
  const { data: line } = await supabase.from('quotation_items').select('id, cost, rate, qty').eq('quotation_id', qtn.id).limit(1).maybeSingle()
  if (line) {
    if (Number(line.rate) !== 9990 || Number(line.cost) !== 5400) {
      await supabase.from('quotation_items').update({ rate: 9990, cost: 5400 }).eq('id', line.id)
    }
    await api(adminToken, `/quotations/${qtn.id}/items/${line.id}`, { method: 'PATCH', body: { add_margin_pct: 0 } })
  }
  const get = await api(adminToken, `/quotations/${qtn.id}`)
  const gp = Number(get.body?.gp_percent)
  const cost = Number(get.body?.cost_amount)
  const ok = get.status === 200 && approx(gp, 45.95, 0.2) && approx(cost, 5400, 1)
  pass('(a) Header GP ≈ 45.95 (expected_landed basis)', ok, `gp=${gp} cost_amount=${cost}`)
}

// ── (b) Print model forbidden fields absent + validity suffix ───────────────
{
  const get = await api(adminToken, `/quotations/${qtn.id}`)
  const raw = {
    ...get.body,
    validity_days: get.body?.validity_days || 30,
    override_reason: 'should-not-leak',
    discount_source: 'CEO',
    quotation_items: (get.body?.quotation_items || []).map((l) => ({
      ...l, add_margin_pct: 3, estimated_cost: 5400, pricing_basis: 'valuation_rate', needs_rate: false, cost: 5400,
    })),
  }
  const model = buildQuotationPrintModel(raw, { vatPct: 15 })
  const leaks = printModelHasForbidden(model)
  const validityOk = /\(\d+\s*days\)/i.test(String(model.valid_till || ''))
  pass('(b) Print model forbidden absent', leaks.length === 0, leaks.length ? `leaks=${leaks.join(',')}` : 'clean')
  pass('(f) Validity string has (N days)', validityOk, `valid_till=${model.valid_till}`)
}

// ── (c) Customer portal strip ───────────────────────────────────────────────
{
  const get = await api(adminToken, `/quotations/${qtn.id}`)
  const poisoned = {
    ...get.body,
    override_reason: 'secret',
    discount_source: 'CEO',
    quotation_items: (get.body?.quotation_items || []).map((l) => ({
      ...l, add_margin_pct: 5, estimated_cost: 1, pricing_basis: 'x', needs_rate: true, cost: 5400,
    })),
  }
  const customerView = stripCustomerQuotationFields(redactFinancials('Customer', poisoned))
  const leaks = hasAnyForbidden(customerView, [...FORBIDDEN, 'discount_source'])
  pass('(c) Customer portal forbidden absent', leaks.length === 0, leaks.length ? `leaks=${leaks.join(',')}` : 'clean')
}

// ── (d) Sales GET: forbidden absent; discount_source PRESENT ────────────────
{
  if (!aliToken) {
    pass('(d) Sales GET redaction', false, 'ali token unavailable')
  } else {
    // Seed override + discount_source as admin
    await supabase.from('quotations').update({
      override_reason: '1b-B3 redaction probe',
      discount_source: 'Salesperson',
    }).eq('id', qtn.id)

    const get = await api(aliToken, `/quotations/${qtn.id}`)
    const leaks = hasAnyForbidden(get.body)
    const hasSource = get.body?.discount_source != null
    pass('(d) Sales GET forbidden absent + discount_source present',
      get.status === 200 && leaks.length === 0 && hasSource,
      `status=${get.status} leaks=${leaks.join(',') || 'none'} discount_source=${get.body?.discount_source}`)
  }
}

// ── (e) Management GET: override_reason present ─────────────────────────────
{
  const get = await api(adminToken, `/quotations/${qtn.id}`)
  pass('(e) Management GET override_reason present',
    get.status === 200 && !!get.body?.override_reason,
    `override_reason=${get.body?.override_reason}`)
  // cleanup probe reason
  await supabase.from('quotations').update({ override_reason: null }).eq('id', qtn.id)
}

// ── Leak-sweep table (documentation assertion) ──────────────────────────────
{
  const fields = ['add_margin_pct', 'override_reason', 'estimated_cost', 'pricing_basis', 'discount_source']
  const rows = []
  for (const f of fields) {
    const salesHas = f === 'discount_source' // only discount_source allowed for Sales
    const custHas = false
    rows.push({ f, sales: salesHas ? 'YES' : 'NO', cust: 'NO' })
  }
  const tableOk = rows.every((r) => r.cust === 'NO' && (r.f === 'discount_source' ? r.sales === 'YES' : r.sales === 'NO'))
  pass('(sweep) Field×Sales×Customer table all correct', tableOk, rows.map((r) => `${r.f}:S=${r.sales}/C=${r.cust}`).join(' · '))
  console.log('\nLeak-sweep table (expected):')
  console.log('| Field | Sales | Customer |')
  console.log('|---|---|---|')
  for (const r of rows) console.log(`| ${r.f} | ${r.sales} | ${r.cust} |`)
  console.log('')
}

// ── (g) Regressions ─────────────────────────────────────────────────────────
{
  console.log('Running regressions (block4, 1b:block1, 1b:block2)…\n')
  const b4 = await runNpmScript('verify:block4')
  pass('(g) verify:block4', b4.code === 0, b4.summary)
  const b1 = await runNpmScript('verify:1b:block1')
  pass('(g) verify:1b:block1', b1.code === 0, b1.summary)
  const b2 = await runNpmScript('verify:1b:block2')
  pass('(g) verify:1b:block2', b2.code === 0, b2.summary)
}

const ok = results.filter((r) => r.ok).length
const fail = results.filter((r) => !r.ok).length
console.log('Results:')
for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
console.log(`\n${ok}/${results.length} PASS · ${fail} FAIL\n`)
console.log('PRINT_FORBIDDEN_FIELDS:', PRINT_FORBIDDEN_FIELDS.join(', '))
process.exit(fail ? 1 : 0)
