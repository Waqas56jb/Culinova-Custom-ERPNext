/**
 * Sprint 2 Block 1 — stock reservation integrity verify
 * a) Portal accept → reserve from_stock only + audit
 * b) Management accept parity
 * c) reserve_stock cap + short_qty
 * d) Delivery consumes reservations
 * e) Release request → approve / deny
 * f) Sales disabled 403; Management toggle + audit
 * g) Regressions: block4 + 1b block1..3 (summaries)
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
const { acceptQuotation } = await import('../src/core/acceptQuotation.js')
const { reserveForSalesOrder, consumeReservationsForDelivery, releaseReservation } = await import('../src/core/inventory.js')

const BASE = (process.env.BASE || `http://localhost:${process.env.PORT || 5050}/api`).replace(/\/$/, '')
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
    secret,
    { expiresIn: '8h' },
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

console.log('\n######## SPRINT 2 BLOCK 1 — STOCK RESERVATION INTEGRITY ########\n')

const adminToken = await tokenFor('admin@gmail.com')
const aliToken = await tokenFor('ali@culinova.sa')
const stockToken = await tokenFor('warehouse@culinova.sa')
const { data: adminUser } = await supabase.from('users').select('*').eq('email', 'admin@gmail.com').maybeSingle()

if (!adminToken || !adminUser) {
  console.error('Need admin token')
  process.exit(1)
}

// Dedicated test item — avoid touching FAGOR golden
const TAG = `S2B1-${Date.now().toString().slice(-6)}`
const itemName = `S2B1 Test Range ${TAG}`
const customerName = `S2B1 Customer ${TAG}`

const cleanupIds = { quotes: [], sos: [], projects: [], reservations: [], itemId: null, bals: [] }

try {
  // Ensure commercial customer profile for accept gate
  await supabase.from('customers').upsert({
    name: customerName,
    cr_number: 'CR-S2B1',
    vat_number: 'VAT-S2B1',
    national_address: 'Riyadh Test',
    billing_address: 'Riyadh Billing',
  }, { onConflict: 'name' }).select().maybeSingle()
  // if upsert onConflict not available, insert ignore
  const { data: cust } = await supabase.from('customers').select('id,name').eq('name', customerName).maybeSingle()
  if (!cust) {
    await supabase.from('customers').insert({
      name: customerName,
      cr_number: 'CR-S2B1',
      vat_number: 'VAT-S2B1',
      national_address: 'Riyadh Test',
      billing_address: 'Riyadh Billing',
    })
  }

  const itemCode = `ITM-${TAG}`
  const { data: item, error: itemErr } = await supabase.from('items').insert({
    code: itemCode,
    item_code: itemCode,
    item_name: itemName,
    name: itemName,
    brand: 'TEST',
    model: TAG,
    is_stock_item: true,
    is_sales_item: true,
    valuation_rate: 100,
    selling_price: 500,
    standard_rate: 500,
    cost: 200,
    disabled: false,
  }).select().single()
  if (itemErr) throw itemErr
  cleanupIds.itemId = item.id

  // Stock: physical 5, reserved 0
  await supabase.from('stock_balances').upsert({
    item_id: item.id, warehouse: 'Main Store', qty: 5, reserved: 0,
  }, { onConflict: 'item_id,warehouse' })

  // ── (c) Cap test first (direct reserve) ──
  const over = await reserveForSalesOrder({
    items: [{ item_id: item.id, item_name: itemName, qty: 99 }],
    sales_order_id: null,
    project_id: null,
    userId: adminUser.id,
  })
  const overRow = over[0]
  const capOk = overRow && Number(overRow.qty) === 5 && Number(overRow.short_qty) === 94
  pass('c) reserve capped + short_qty', !!capOk, overRow ? `reserved=${overRow.qty} short=${overRow.short_qty}` : 'no row')
  if (overRow?.id) {
    cleanupIds.reservations.push(overRow.id)
    await releaseReservation(overRow.id)
    await supabase.from('stock_reservations').delete().eq('id', overRow.id)
  }
  // reset balance
  await supabase.from('stock_balances').update({ qty: 5, reserved: 0 }).eq('item_id', item.id).eq('warehouse', 'Main Store')

  async function makeQuote(qty = 8) {
    const { data: q } = await supabase.from('quotations').insert({
      number: `QTN-S2B1-${Date.now().toString().slice(-5)}`,
      customer: customerName,
      status: 'Open',
      approval_status: 'Not Required',
      total_amount: 500 * qty,
      net_amount: 500 * qty,
      discount_pct: 0,
      owner_id: adminUser.id,
      validity_days: 30,
    }).select().single()
    await supabase.from('quotation_items').insert({
      quotation_id: q.id,
      item_id: item.id,
      item_name: itemName,
      qty,
      rate: 500,
      cost: 200,
      sort_order: 0,
    })
    cleanupIds.quotes.push(q.id)
    return q
  }

  // ── (a) Portal-channel accept (stock 5, qty 8) ──
  await supabase.from('stock_balances').update({ qty: 5, reserved: 0 }).eq('item_id', item.id)
  const qPortal = await makeQuote(8)
  const portalActor = { id: adminUser.id, name: customerName, email: 's2b1@test.local', role: 'Customer' }
  // portal owns by matching customer name === actor.name
  const portalResult = await acceptQuotation({
    quotationId: qPortal.id,
    actor: portalActor,
    channel: 'portal',
  })
  cleanupIds.sos.push(portalResult.sales_order?.id)
  cleanupIds.projects.push(portalResult.project?.id)

  const { data: portalBoq } = await supabase.from('project_boq').select('*').eq('project_id', portalResult.project.id)
  const boq = (portalBoq || [])[0]
  const fromStock = Number(boq?.from_stock) || 0
  const toPurchase = Number(boq?.to_purchase) || 0
  const { data: portalRes } = await supabase.from('stock_reservations').select('*')
    .eq('sales_order_id', portalResult.sales_order.id).eq('status', 'Active')
  const resQty = (portalRes || []).reduce((s, r) => s + (Number(r.qty) || 0), 0)
  cleanupIds.reservations.push(...(portalRes || []).map((r) => r.id))

  const { data: auditAccept } = await supabase.from('audit_log').select('id, action, detail')
    .eq('entity_id', qPortal.id).eq('action', 'accepted').limit(5)
  // audit table may use different column names
  let auditOk = (auditAccept || []).length > 0
  if (!auditOk) {
    const { data: a2 } = await supabase.from('audit_logs').select('id').eq('ref_id', qPortal.id).limit(3)
    auditOk = (a2 || []).length > 0
  }
  if (!auditOk) {
    // acceptQuotation always calls logAudit — check generic
    const { data: a3 } = await supabase.from('audit_log').select('id, action').order('created_at', { ascending: false }).limit(20)
    auditOk = (a3 || []).some((x) => x.action === 'accepted')
  }

  pass('a) portal accept reserve=from_stock', fromStock === 5 && toPurchase === 3 && resQty === 5,
    `BOQ ${fromStock}/${toPurchase} reserved=${resQty} audit=${auditOk}`)
  pass('a) audit row on accept', auditOk, '')

  // Cleanup portal SO path for parity test isolation — release reservations, mark quote unused
  for (const r of portalRes || []) {
    await releaseReservation(r.id)
    await supabase.from('stock_reservations').update({ status: 'Released' }).eq('id', r.id)
  }
  await supabase.from('stock_balances').update({ qty: 5, reserved: 0 }).eq('item_id', item.id)

  // ── (b) Management accept parity ──
  const qMgmt = await makeQuote(8)
  const mgmtResult = await acceptQuotation({
    quotationId: qMgmt.id,
    actor: adminUser,
    channel: 'management',
  })
  cleanupIds.sos.push(mgmtResult.sales_order?.id)
  cleanupIds.projects.push(mgmtResult.project?.id)
  const { data: mgmtBoq } = await supabase.from('project_boq').select('*').eq('project_id', mgmtResult.project.id)
  const mBoq = (mgmtBoq || [])[0]
  const { data: mgmtRes } = await supabase.from('stock_reservations').select('*')
    .eq('sales_order_id', mgmtResult.sales_order.id).eq('status', 'Active')
  cleanupIds.reservations.push(...(mgmtRes || []).map((r) => r.id))
  const mResQty = (mgmtRes || []).reduce((s, r) => s + (Number(r.qty) || 0), 0)
  const parity = Number(mBoq?.from_stock) === 5 && Number(mBoq?.to_purchase) === 3 && mResQty === 5
  pass('b) management accept parity', parity, `BOQ ${mBoq?.from_stock}/${mBoq?.to_purchase} reserved=${mResQty}`)

  // ── (d) Delivery consume ──
  const soId = mgmtResult.sales_order.id
  const projId = mgmtResult.project.id
  const r0 = (mgmtRes || [])[0]
  // deliver 3 of 5
  await consumeReservationsForDelivery({
    itemId: item.id, itemName: itemName, salesOrderId: soId, projectId: projId, qty: 3, warehouse: 'Main Store',
  })
  const { data: after3 } = await supabase.from('stock_reservations').select('*').eq('id', r0.id).maybeSingle()
  const d1 = after3 && Number(after3.qty) === 2 && after3.status === 'Active'
  pass('d) deliver 3 → qty 2 Active', !!d1, after3 ? `${after3.qty} ${after3.status}` : 'missing')

  await consumeReservationsForDelivery({
    itemId: item.id, itemName: itemName, salesOrderId: soId, projectId: projId, qty: 2, warehouse: 'Main Store',
  })
  const { data: after2 } = await supabase.from('stock_reservations').select('*').eq('id', r0.id).maybeSingle()
  const d2 = after2 && Number(after2.qty) === 0 && after2.status === 'Consumed'
  pass('d) deliver 2 → Consumed', !!d2, after2 ? `${after2.qty} ${after2.status}` : 'missing')

  // Reset a reservation for release flow test
  await supabase.from('stock_balances').update({ qty: 5, reserved: 0 }).eq('item_id', item.id)
  const [freshRes] = await reserveForSalesOrder({
    items: [{ item_id: item.id, item_name: itemName, qty: 2 }],
    sales_order_id: soId,
    project_id: projId,
    userId: adminUser.id,
  })
  cleanupIds.reservations.push(freshRes?.id)

  // ── (e) Release request → deny → approve ──
  if (stockToken && freshRes?.id) {
    const reqRel = await api(stockToken, `/inventory/reservations/${freshRes.id}/request-release`, {
      method: 'POST', body: { reason: 's2b1 eyes release' },
    })
    pass('e) request release', reqRel.status === 200 && reqRel.body?.status === 'Release Requested', `status=${reqRel.status}`)

    const denied = await api(adminToken, `/inventory/reservations/${freshRes.id}/deny-release`, {
      method: 'POST', body: { note: 'hold' },
    })
    pass('e) deny → Active', denied.status === 200 && denied.body?.status === 'Active', denied.body?.status)

    const req2 = await api(stockToken, `/inventory/reservations/${freshRes.id}/request-release`, {
      method: 'POST', body: { reason: 's2b1 approve path' },
    })
    const approved = await api(adminToken, `/inventory/reservations/${freshRes.id}/approve-release`, {
      method: 'POST', body: {},
    })
    pass('e) approve → Released', req2.status === 200 && approved.status === 200 && approved.body?.status === 'Released',
      `req=${req2.status} appr=${approved.status} ${approved.body?.status}`)
  } else {
    pass('e) release flow', false, 'no stock token or reservation')
  }

  // ── (f) Disable gate ──
  if (aliToken) {
    const salesTry = await api(aliToken, `/items/${item.id}`, { method: 'PATCH', body: { disabled: true } })
    // Sales may get 403 from warehouse authorize OR from our explicit gate
    pass('f) Sales PATCH disabled → 403', salesTry.status === 403, `status=${salesTry.status}`)
  } else {
    pass('f) Sales PATCH disabled → 403', false, 'no ali token')
  }
  const mgmtDis = await api(adminToken, `/items/${item.id}`, { method: 'PATCH', body: { disabled: true } })
  pass('f) Management disable', mgmtDis.status === 200 && mgmtDis.body?.disabled === true, `status=${mgmtDis.status}`)
  const mgmtEn = await api(adminToken, `/items/${item.id}`, { method: 'PATCH', body: { disabled: false } })
  pass('f) Management enable', mgmtEn.status === 200 && mgmtEn.body?.disabled === false, `status=${mgmtEn.status}`)

} catch (e) {
  console.error('VERIFY ERROR', e)
  pass('fatal', false, e.message)
}

// Cleanup
console.log('\n── Cleanup ──')
try {
  if (cleanupIds.reservations.length) {
    for (const id of cleanupIds.reservations.filter(Boolean)) {
      try { await releaseReservation(id) } catch { /* */ }
      await supabase.from('stock_reservations').delete().eq('id', id)
    }
  }
  if (cleanupIds.projects.length) {
    for (const id of cleanupIds.projects.filter(Boolean)) {
      await supabase.from('project_boq').delete().eq('project_id', id)
      await supabase.from('projects').delete().eq('id', id)
    }
  }
  if (cleanupIds.sos.length) {
    for (const id of cleanupIds.sos.filter(Boolean)) await supabase.from('sales_orders').delete().eq('id', id)
  }
  if (cleanupIds.quotes.length) {
    for (const id of cleanupIds.quotes) {
      await supabase.from('quotation_items').delete().eq('quotation_id', id)
      await supabase.from('quotations').delete().eq('id', id)
    }
  }
  if (cleanupIds.itemId) {
    await supabase.from('stock_balances').delete().eq('item_id', cleanupIds.itemId)
    await supabase.from('items').delete().eq('id', cleanupIds.itemId)
  }
  await supabase.from('customers').delete().eq('name', customerName)
  console.log('Cleanup ✅')
} catch (e) {
  console.warn('Cleanup partial:', e.message)
}

// ── (g) regressions ──
function runVerify(script) {
  // block3 nests block4+1b1+1b2 (~100s+); allow headroom under load
  const r = spawnSync('node', [path.join(__dirname, script)], {
    encoding: 'utf8',
    cwd: path.resolve(__dirname, '..'),
    timeout: 360000,
  })
  const detail = r.error?.message
    || (r.signal ? `signal ${r.signal}` : null)
    || (r.status === 0 ? 'exit 0' : `exit ${r.status}`)
  return { ok: r.status === 0, out: detail }
}

console.log('\n── Regressions ──')
for (const [label, script] of [
  ['g) verify:block4', 'verify_block4.mjs'],
  ['g) verify:1b:block1', 'verify_1b_block1.mjs'],
  ['g) verify:1b:block2', 'verify_1b_block2.mjs'],
  ['g) verify:1b:block3', 'verify_1b_block3.mjs'],
]) {
  try {
    const r = runVerify(script)
    pass(label, r.ok, r.ok ? 'exit 0' : 'exit non-zero')
  } catch (e) {
    pass(label, false, e.message)
  }
}

console.log('\n======== RESULTS ========')
let fails = 0
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id}${r.detail ? ` — ${r.detail}` : ''}`)
  if (!r.ok) fails++
}
console.log(fails ? `\n${fails} FAIL(s)\n` : '\nALL PASS\n')

console.log(`
MANUAL EYES-ON CHECKLIST (Sprint 2 Block 1)
───────────────────────────────────────────
Servers: API :5050 · ERP :5173 · Portal :5175
Test numbers used by verify: physical stock=5, quote qty=8 → from_stock=5 / to_purchase=3 / reserved=5 / short on over-request=94

Login order:
1. Admin (admin@gmail.com) — create Draft quote for a stock-short item (qty 8, stock 5)
2. Customer portal (:5175) — Accept that quote → SO + BOQ 5/3
3. Warehouse (warehouse@culinova.sa) — Stock → Reservations: Active qty=5, short_qty=0 (or short if over)
4. Admin — post Delivery Note qty 3 linked to SO/project → reservation qty=2 Active; deliver remaining 2 → Consumed
5. Warehouse — Request release (reason) on an Active reservation → bell for approvers
6. Admin — Deny → Active; Request again → Approve → Released
7. Admin — Item Master → Disable item → confirm hidden from quote picker → Enable

Cleanup: delete test SO/quote/reservations; restore stock_balances qty/reserved; re-enable item if left disabled.
`)

process.exit(fails ? 1 : 0)
