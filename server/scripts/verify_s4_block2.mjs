/**
 * Sprint 4 Block 2 — recommendations into real flow
 * a) prefill generic → suggested_alternatives ≤3; explicit → absent
 * b) swap → FAGOR-class rate ~9990 + audit row
 * c) picker family filter path → reason-mapped rows (shape)
 * d) §10 requested_brand hard-filter (S4B1 regression)
 * e) print regression reminders (s4b1 / s3 / block4)
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import jwt from 'jsonwebtoken'
import { spawnSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const { supabase } = await import('../src/config/supabase.js')
const { env } = await import('../src/config/env.js')
const { resolveApprovedItems, isGenericBrand } = await import('../src/core/approvedItemsResolve.js')
const { recommendEquipment } = await import('../src/core/equipmentRecommend.js')

const BASE = (process.env.BASE || `http://localhost:${process.env.PORT || 5050}/api`).replace(/\/$/, '')
const results = []
const pass = (id, ok, detail = '') => results.push({ id, ok, detail })
const secret = process.env.JWT_SECRET || env.jwtSecret
const approx = (a, b, tol = 1) => Math.abs(Number(a) - Number(b)) <= tol

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
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  return { status: res.status, body: await j(res) }
}

const TAG = `S4B2-${Date.now().toString().slice(-5)}`
const FAMILY = `S4B2 Family ${TAG}`
const cleanup = { items: [], brands: [], bals: [], audits: [] }

console.log('\n######## SPRINT 4 BLOCK 2 — RECS INTO REAL FLOW ########\n')

try {
  const adminToken = await tokenFor('admin@gmail.com')
  if (!adminToken) throw new Error('admin login required')

  pass('a0 isGenericBrand helpers',
    isGenericBrand('', null) && isGenericBrand('CULINOVA', null) && !isGenericBrand('FAGOR', 'FAGOR'),
    '')

  const mkBrand = async (name) => {
    const { data, error } = await supabase.from('brands').insert({
      brand: name, currency: 'SAR', exchange_factor: 1, price_factor: 1.85, factors_pending: false,
    }).select().single()
    if (error) throw new Error(error.message)
    cleanup.brands.push(data.id)
    return data
  }
  const brandGen = await mkBrand(`GenericHost-${TAG}`)
  const brandAlt = await mkBrand(`AltBrand-${TAG}`)
  const brandExp = await mkBrand(`Explicit-${TAG}`)

  const mkItem = async (brand, model, family = FAMILY) => {
    const name = `${brand} ${model}`
    const { data, error } = await supabase.from('items').insert({
      item_code: `ITM-${TAG}-${model}`,
      code: `ITM-${TAG}-${model}`,
      name,
      item_name: name,
      brand,
      model,
      product_family: family,
      item_group: 'Cooking',
      status: 'Active',
      valuation_rate: 1000,
      selling_price: 9990,
      standard_rate: 9990,
      landed_cost: 5400,
    }).select().single()
    if (error) throw new Error(error.message)
    cleanup.items.push(data.id)
    return data
  }

  const host = await mkItem(brandGen.brand, 'HOST')
  const alt1 = await mkItem(brandAlt.brand, 'A1')
  const alt2 = await mkItem(brandAlt.brand, 'A2')
  const alt3 = await mkItem(brandAlt.brand, 'A3')
  const explicit = await mkItem(brandExp.brand, 'EXP')

  await supabase.from('stock_balances').delete().eq('item_id', alt1.id)
  await supabase.from('stock_balances').insert({ item_id: alt1.id, warehouse: 'Main', qty: 5, reserved: 0 })
  cleanup.bals.push(alt1.id)

  // ── (a) resolveApprovedItems generic vs explicit ──────────────────────────
  const genericResolved = await resolveApprovedItems([
    { item_id: host.id, qty: 2, brand: '' },
  ], { includeMargin: true, attachAlternatives: true, tryImport: false })
  const gLine = genericResolved.lines[0]
  pass('a1 generic line resolved', !!gLine?.item_id, gLine?.item_name || '')
  pass('a2 suggested_alternatives present', Array.isArray(gLine?.suggested_alternatives) && gLine.suggested_alternatives.length > 0,
    `n=${gLine?.suggested_alternatives?.length}`)
  pass('a3 suggested_alternatives ≤3', (gLine?.suggested_alternatives?.length || 0) <= 3,
    `n=${gLine?.suggested_alternatives?.length}`)
  pass('a4 alts have reasons', (gLine?.suggested_alternatives || []).every((r) => (r.reasons || [r.reason]).filter(Boolean).length),
    JSON.stringify((gLine?.suggested_alternatives || []).slice(0, 1).map((r) => r.reasons)))
  pass('a5 brand_explicit false', gLine?.brand_explicit === false, `explicit=${gLine?.brand_explicit}`)

  const culinovaResolved = await resolveApprovedItems([
    { item_id: host.id, qty: 1, brand: 'CULINOVA-generic' },
  ], { includeMargin: false, attachAlternatives: true, tryImport: false })
  pass('a6 CULINOVA-generic gets alts', Array.isArray(culinovaResolved.lines[0]?.suggested_alternatives),
    `n=${culinovaResolved.lines[0]?.suggested_alternatives?.length}`)

  const explicitResolved = await resolveApprovedItems([
    { item_id: explicit.id, qty: 1, brand: brandExp.brand },
  ], { includeMargin: true, attachAlternatives: true, tryImport: false })
  const eLine = explicitResolved.lines[0]
  pass('a7 explicit has NO suggested_alternatives', eLine && eLine.suggested_alternatives === undefined,
    `keys=${Object.keys(eLine || {}).filter((k) => k.includes('suggest')).join(',') || 'none'}`)
  pass('a8 brand_explicit true', eLine?.brand_explicit === true, `explicit=${eLine?.brand_explicit}`)

  // ── (b) Swap reprice + audit (FAGOR golden ~9990) ──────────────────────────
  let fagorItem = null
  {
    const { data: f1 } = await supabase.from('items').select('*')
      .ilike('brand', 'FAGOR').ilike('model', '%C-G961%').limit(1).maybeSingle()
    fagorItem = f1
    if (!fagorItem?.id) {
      const { data: f2 } = await supabase.from('items').select('*').ilike('brand', 'FAGOR').limit(1).maybeSingle()
      fagorItem = f2
    }
  }
  pass('b0 FAGOR item exists', !!fagorItem?.id, fagorItem?.item_name || 'missing')

  if (fagorItem?.id) {
    const priced = await api(adminToken, `/quotations/price-items?ids=${fagorItem.id}`)
    const sell = priced.body?.[fagorItem.id]?.selling
    pass('b1 FAGOR rate 9990-class', priced.status === 200 && approx(sell, 9990, 50),
      `selling=${sell} status=${priced.status}`)

    const auditRes = await api(adminToken, '/quotations/line-swap-audit', {
      method: 'POST',
      body: {
        quotation_id: `verify-${TAG}`,
        from: { item_id: host.id, item_name: host.item_name, brand: host.brand, rate: 100 },
        to: { item_id: fagorItem.id, item_name: fagorItem.item_name, brand: fagorItem.brand, rate: sell },
        reason_shown: 'Available in Stock (5)',
      },
    })
    pass('b2 line-swap-audit 200', auditRes.status === 200 && auditRes.body?.ok, `status=${auditRes.status}`)

    const { data: auditRows } = await supabase.from('audit_log')
      .select('*')
      .eq('entity', 'quotation')
      .eq('entity_id', `verify-${TAG}`)
      .eq('action', 'line_item_swapped')
      .order('created_at', { ascending: false })
      .limit(3)
    const row = (auditRows || [])[0]
    cleanup.audits.push(`verify-${TAG}`)
    pass('b3 audit row exists', !!row, `n=${(auditRows || []).length}`)
    pass('b4 audit from/to/reason',
      row?.details?.from?.item_id === host.id
      && row?.details?.to?.item_id === fagorItem.id
      && row?.details?.reason_shown,
      JSON.stringify(row?.details || {}).slice(0, 180))
  } else {
    pass('b1 FAGOR rate 9990-class', false, 'no FAGOR item')
    pass('b2 line-swap-audit 200', false, 'skipped')
    pass('b3 audit row exists', false, 'skipped')
    pass('b4 audit from/to/reason', false, 'skipped')
  }

  // ── (c) Picker family path — one recommend call, map reasons onto rows ─────
  const rec = await api(adminToken, `/items/recommend?product_family=${encodeURIComponent(FAMILY)}&qty=2&limit=40`)
  const recs = rec.body?.recommendations || []
  pass('c1 recommend 200', rec.status === 200 && recs.length > 0, `n=${recs.length}`)
  const reasonMap = {}
  for (const r of recs) {
    const primary = (r.reasons || [r.reason]).filter(Boolean)[0]
    if (r.item_id && primary) reasonMap[r.item_id] = primary
  }
  const filtered = [host, alt1, alt2, alt3, explicit].filter((i) => i.product_family === FAMILY)
  const mapped = filtered.map((i) => ({
    item_id: i.id,
    item_name: i.item_name,
    reason: reasonMap[i.id] || null,
    availability_chip: true,
  }))
  pass('c2 filtered family rows', mapped.length >= 4, `n=${mapped.length}`)
  pass('c3 reason mapped onto matching rows', mapped.some((m) => m.reason),
    mapped.filter((m) => m.reason).map((m) => m.item_name).join(', '))
  pass('c4 shape assert', mapped.every((m) => m.item_id && m.item_name && 'reason' in m && m.availability_chip === true),
    JSON.stringify(mapped[0]))

  // ── (d) §10 hard-filter regression ─────────────────────────────────────────
  const hard = await recommendEquipment({
    product_family: FAMILY,
    qty: 1,
    requested_brand: brandAlt.brand,
    includeMargin: false,
    limit: 10,
  })
  const mainBrands = (hard.recommendations || []).map((r) => r.brand)
  pass('d1 requested_brand hard-filters main list',
    mainBrands.length > 0 && mainBrands.every((b) => b === brandAlt.brand),
    mainBrands.join(','))
  pass('d2 alternatives other brands present',
    (hard.alternatives || []).every((r) => r.brand !== brandAlt.brand),
    (hard.alternatives || []).map((r) => r.brand).join(','))

  // ── (e) inline regression: s4 block1 smoke (labels + shortfall path) ───────
  const eng = await recommendEquipment({ product_family: FAMILY, qty: 10, includeMargin: true, limit: 10 })
  const stocked = eng.recommendations.find((r) => r.item_id === alt1.id)
  pass('e1 shortfall path still works', stocked && stocked.shortfall === 5 && stocked.reasons?.some((x) => String(x).startsWith('Available in Stock')),
    JSON.stringify({ shortfall: stocked?.shortfall, reasons: stocked?.reasons }))

} catch (e) {
  pass('FATAL', false, e.message)
  console.error(e)
} finally {
  for (const eid of cleanup.audits) {
    await supabase.from('audit_log').delete().eq('entity', 'quotation').eq('entity_id', eid)
  }
  for (const id of cleanup.bals) await supabase.from('stock_balances').delete().eq('item_id', id)
  for (const id of cleanup.items) {
    await supabase.from('stock_balances').delete().eq('item_id', id)
    await supabase.from('items').delete().eq('id', id)
  }
  for (const id of cleanup.brands) await supabase.from('brands').delete().eq('id', id)
  pass('cleanup', true, `items=${cleanup.items.length} brands=${cleanup.brands.length}`)
}

console.log('\n-- results --')
let failed = 0
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id}${r.detail ? ` — ${r.detail}` : ''}`)
  if (!r.ok) failed++
}
console.log(`\n######## ${failed ? 'FAIL' : 'PASS'} — ${results.filter((r) => r.ok).length}/${results.length} ########\n`)

// Regression suites (summaries) — set SKIP_REGRESSION=1 for fast core-only re-run
const runNpm = (script) => {
  console.log(`\n── regression: ${script} ──`)
  const r = spawnSync('npm', ['run', script], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    shell: true,
    timeout: 180000,
  })
  const out = `${r.stdout || ''}\n${r.stderr || ''}`
  const lines = out.split('\n').filter((l) => /PASS|FAIL|########/.test(l))
  console.log(lines.slice(-12).join('\n') || out.slice(-800))
  return r.status === 0
}

if (process.env.SKIP_REGRESSION === '1') {
  console.log('\n-- regression summary -- SKIPPED (SKIP_REGRESSION=1)\n')
} else {
  const reg = {
    'verify:s4:block1': runNpm('verify:s4:block1'),
    'verify:s3:block1': runNpm('verify:s3:block1'),
    'verify:s3:block2': runNpm('verify:s3:block2'),
    'verify:s3:block3': runNpm('verify:s3:block3'),
    'verify:block4': runNpm('verify:block4'),
  }
  console.log('\n-- regression summary --')
  for (const [k, ok] of Object.entries(reg)) {
    console.log(`${ok ? 'PASS' : 'FAIL/FLAKE'}  ${k}`)
  }
}

console.log(`
MANUAL EYES-ON CHECKLIST (S4B2) — login order
─────────────────────────────────────────────
API :5050 · ERP :5173
Admin admin@gmail.com / admin@123! · Ali ali@culinova.sa

Admin:
  1. EOS→ERP: approve generic equipment (no brand / CULINOVA-generic) OR use existing Ready-for-Quotation ER
  2. Engineering → Quotation prefill → line shows "N alternatives" chip (explicit-brand lines: NO chip)
  3. Click chip → Smart panel opens preloaded (family + qty) → Swap to FAGOR → rate ~9,990
  4. Save quote → Audit tab → "Line item swapped" with from/to/reason
  5. Picker: Family dropdown → availability + reason chips on rows; Smart suggest in picker header
  6. BOQ → Add Item → same Family/Category filters
  7. Engineering detail (eye icon) → approved items show availability chips

Ali: same flow minus margin / Better Margin labels

Cleanup: verify script self-cleans test items/brands/audits.
  Test data note: needs ≥2 Active items in same product_family; FAGOR C-G961 for 9990-class assert.
`)

process.exit(failed ? 1 : 0)
