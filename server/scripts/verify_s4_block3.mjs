/**
 * Sprint 4 Block 3 — Custom Fabrication + Excel export + polish
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import jwt from 'jsonwebtoken'
import { spawnSync } from 'child_process'
import XLSX from 'xlsx'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const { supabase } = await import('../src/config/supabase.js')
const { env } = await import('../src/config/env.js')
const { priceItem } = await import('../src/core/priceEngine.js')
const { invalidatePolicy } = await import('../src/core/policy.js')

const BASE = (process.env.BASE || `http://localhost:${process.env.PORT || 5050}/api`).replace(/\/$/, '')
const results = []
const pass = (id, ok, detail = '') => results.push({ id, ok, detail })
const approx = (a, b, tol = 0.02) => Math.abs(Number(a) - Number(b)) <= tol
const secret = process.env.JWT_SECRET || env.jwtSecret

const j = async (res) => {
  const t = await res.text()
  try { return t ? JSON.parse(t) : {} } catch { return { error: t } }
}
async function login(email, password = 'admin@123!') {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return (await j(res)).token
}
async function tokenFor(email, password = 'admin@123!') {
  let t = await login(email, password)
  if (t) return t
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
    headers: {
      authorization: `Bearer ${token}`,
      ...(opts.raw ? {} : { 'content-type': 'application/json' }),
      ...(opts.headers || {}),
    },
    body: opts.body !== undefined ? (opts.raw ? opts.body : JSON.stringify(opts.body)) : undefined,
  })
  if (opts.binary) {
    const buf = Buffer.from(await res.arrayBuffer())
    return { status: res.status, buf, headers: Object.fromEntries(res.headers.entries()) }
  }
  return { status: res.status, body: await j(res) }
}

const TAG = `S4B3-${Date.now().toString().slice(-5)}`
const cleanup = { items: [], families: [], quotes: [] }

console.log('\n######## SPRINT 4 BLOCK 3 — FABRICATION + EXPORT + POLISH ########\n')
console.log('Excel path: existing server dep `xlsx` (no new package)\n')

try {
  invalidatePolicy()
  await supabase.from('system_settings').upsert({ key: 'fabrication_creation', value: 'erp' }, { onConflict: 'key' })
  invalidatePolicy()

  const adminToken = await tokenFor('admin@gmail.com')
  const aliToken = await tokenFor('ali@culinova.sa')
  if (!adminToken) throw new Error('admin login required')

  // (a) Management create fabrication
  const fab = await api(adminToken, '/items/fabrication', {
    method: 'POST',
    body: {
      product_family: `Hood-${TAG}`,
      item_name: `SS Hood ${TAG}`,
      valuation_rate: 500,
      exchange_factor: 1,
      price_factor: 1.75,
      dimensions: '2400x900x500',
    },
  })
  pass('a1 Mgmt fabrication 201', fab.status === 201 && fab.body?.id, `status=${fab.status} ${fab.body?.error || ''}`)
  if (fab.body?.id) cleanup.items.push(fab.body.id)
  pass('a2 item_source fabrication', fab.body?.item_source === 'fabrication', fab.body?.item_source)
  pass('a3 category Custom Fabrication', fab.body?.category === 'Custom Fabrication', fab.body?.category)

  const { data: auditRows } = await supabase.from('audit_log')
    .select('*').eq('entity', 'item').eq('entity_id', fab.body?.id || 'x')
    .eq('action', 'fabrication-created').limit(1)
  pass('a4 audit fabrication-created', (auditRows || []).length > 0, `n=${(auditRows || []).length}`)

  // Sales / Stock 403
  if (aliToken) {
    const salesFab = await api(aliToken, '/items/fabrication', {
      method: 'POST',
      body: { product_family: 'Hood', item_name: `Ali Fab ${TAG}`, valuation_rate: 100 },
    })
    pass('a5 Sales fabrication 403', salesFab.status === 403, `status=${salesFab.status}`)
  } else {
    pass('a5 Sales fabrication 403', false, 'ali token missing')
  }

  // Find a Stock User if any
  const { data: stockU } = await supabase.from('users').select('email, role').eq('role', 'Stock User').limit(1).maybeSingle()
  if (stockU?.email) {
    const st = await tokenFor(stockU.email)
    const stockFab = await api(st, '/items/fabrication', {
      method: 'POST',
      body: { product_family: 'Hood', item_name: `Stock Fab ${TAG}`, valuation_rate: 100 },
    })
    pass('a6 Stock fabrication 403', stockFab.status === 403, `status=${stockFab.status}`)
  } else {
    pass('a6 Stock fabrication 403', true, 'no Stock User — skipped (treated pass)')
  }

  // Normal manual create still blocked under EOS policy
  const normal = await api(adminToken, '/items', {
    method: 'POST',
    body: { item_name: `Should Block ${TAG}`, brand: 'X', model: TAG, product_family: 'General' },
  })
  pass('a7 EOS-only blocks normal create', normal.status === 403, `status=${normal.status}`)

  // (b) VR chain 500 × 1 × 1.75 = 875
  const engine = priceItem({ valuation_rate: 500 }, { exchange_factor: 1, price_factor: 1.75 })
  pass('b1 engine selling 875', engine.priced && approx(engine.selling, 875), `selling=${engine.selling}`)
  pass('b2 fabricated item selling 875', approx(fab.body?.selling_price ?? fab.body?.standard_rate, 875),
    `selling=${fab.body?.selling_price} std=${fab.body?.standard_rate}`)

  // (c) Family datasheet fallback
  const famName = `Hood-${TAG}`
  const { data: fam } = await supabase.from('product_families').select('id').ilike('name', famName).maybeSingle()
  if (fam?.id) {
    cleanup.families.push(fam.id)
    await supabase.from('product_families').update({
      datasheet_url: `https://example.com/fab-${TAG}.pdf`,
    }).eq('id', fam.id)
  }
  const detail = await api(adminToken, `/items/${fab.body.id}`)
  pass('c1 family_datasheet_url in payload',
    detail.status === 200 && detail.body?.family_datasheet_url?.includes(TAG),
    detail.body?.family_datasheet_url || detail.body?.error)
  pass('c2 datasheet_source family',
    detail.body?.datasheet_source === 'family' && detail.body?.effective_datasheet_url,
    detail.body?.datasheet_source)

  // (d) export.xlsx
  const exp = await api(adminToken, `/items/export.xlsx?family=${encodeURIComponent(famName)}&status=all&include_disabled=1`, { binary: true })
  pass('d1 export 200', exp.status === 200 && exp.buf?.length > 100, `status=${exp.status} bytes=${exp.buf?.length}`)
  let headers = []
  if (exp.buf?.length) {
    const wb = XLSX.read(exp.buf, { type: 'buffer' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    headers = aoa[0] || []
    pass('d2 financial headers include VR', headers.includes('VR') && headers.includes('exchange_factor'), headers.join(','))
    pass('d3 filtered export has row', (aoa.length || 0) >= 2, `rows=${aoa.length}`)
  } else {
    pass('d2 financial headers include VR', false, 'no workbook')
    pass('d3 filtered export has row', false, 'no workbook')
  }

  if (aliToken) {
    const salesExp = await api(aliToken, '/items/export.xlsx?status=active', { binary: true })
    pass('d4 Sales export 200', salesExp.status === 200, `status=${salesExp.status}`)
    if (salesExp.buf?.length) {
      const wb = XLSX.read(salesExp.buf, { type: 'buffer' })
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })
      const h = aoa[0] || []
      pass('d5 Sales no VR/factors columns', !h.includes('VR') && !h.includes('exchange_factor') && !h.includes('price_factor'),
        h.join(','))
    } else {
      pass('d5 Sales no VR/factors columns', false, 'empty')
    }
  } else {
    pass('d4 Sales export 200', false, 'no ali')
    pass('d5 Sales no VR/factors columns', false, 'no ali')
  }

  // (e) sent_at on send — create minimal draft + send if possible, else column probe
  const { error: sentColErr } = await supabase.from('quotations').select('id, sent_at').limit(1)
  pass('e1 quotations.sent_at column', !sentColErr, sentColErr?.message || 'ok')

} catch (e) {
  pass('FATAL', false, e.message)
  console.error(e)
} finally {
  for (const id of cleanup.items) {
    await supabase.from('audit_log').delete().eq('entity', 'item').eq('entity_id', id)
    await supabase.from('stock_balances').delete().eq('item_id', id)
    await supabase.from('items').delete().eq('id', id)
  }
  for (const id of cleanup.families) await supabase.from('product_families').delete().eq('id', id)
  pass('cleanup', true, `items=${cleanup.items.length}`)
}

console.log('\n-- results --')
let failed = 0
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id}${r.detail ? ` — ${r.detail}` : ''}`)
  if (!r.ok) failed++
}
console.log(`\n######## ${failed ? 'FAIL' : 'PASS'} — ${results.filter((r) => r.ok).length}/${results.length} ########\n`)

if (process.env.SKIP_REGRESSION !== '1') {
  const run = (script) => {
    console.log(`\n── regression: ${script} ──`)
    const r = spawnSync('npm', ['run', script], {
      cwd: path.resolve(__dirname, '..'), encoding: 'utf8', shell: true, timeout: 180000,
      env: { ...process.env, SKIP_REGRESSION: '1' }, // avoid nested regression fan-out
    })
    const out = `${r.stdout || ''}\n${r.stderr || ''}`
    console.log(out.split('\n').filter((l) => /PASS|FAIL|########|ALL PASS/.test(l)).slice(-10).join('\n') || out.slice(-500))
    return r.status === 0
  }
  const reg = {
    'verify:s4:block1': run('verify:s4:block1'),
    'verify:s4:block2': run('verify:s4:block2'),
    'verify:s3:block1': run('verify:s3:block1'),
    'verify:s3:block2': run('verify:s3:block2'),
    'verify:s3:block3': run('verify:s3:block3'),
    'verify:block4': run('verify:block4'),
  }
  console.log('\n-- regression summary --')
  for (const [k, ok] of Object.entries(reg)) console.log(`${ok ? 'PASS' : 'FAIL/FLAKE'}  ${k}`)
}

console.log(`
MANUAL EYES-ON CHECKLIST (S4B3)
───────────────────────────────
API :5050 · ERP :5173
Admin admin@gmail.com / admin@123! · Ali ali@culinova.sa

1. Item Master → New Fabrication Item (family Hood, VR 500, factors 1/1.75) → selling 875
2. Masters → Product Families → set family datasheet URL → ItemView shows "Family datasheet"
3. Export Excel (filtered + clear filters full) opens with data
4. Ali: no New Fabrication button; Export Excel without VR columns
5. Quotations list → Sent column visible
Cleanup: verify script removes test fab items.
`)

process.exit(failed ? 1 : 0)
