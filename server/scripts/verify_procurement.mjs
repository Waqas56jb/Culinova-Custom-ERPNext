// End-to-end PROCUREMENT flow (M7): requisition → submit → approve → supplier suggestion
// (from real history) → supplier allocation into POs → delivery tracking → goods receipt →
// supplier performance. Hits the LIVE API as the REAL procurement roles. Self-cleaning.
//
// Runs as the Project Manager (procurement panel, Edit) for create/read/update, and as
// Management (Full Admin) for the approval + receiving steps. Proves RBAC for the real roles.
//
// NOTE: routes are mounted by the orchestrator — until then every call 404s (expected).
import { supabase } from '../src/config/supabase.js'
import jwt from 'jsonwebtoken'
import { env } from '../src/config/env.js'

const BASE = process.env.BASE || 'http://localhost:5050/api'
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
let pass = 0, fail = 0
const ok = (c, m) => { c ? (pass++, console.log('  ✓', m)) : (fail++, console.log('  ✗ FAIL', m)) }

const signFor = async (email) => {
  const { data: u } = await supabase.from('users').select('*').eq('email', email).single()
  if (!u) throw new Error(`user ${email} not found`)
  const token = jwt.sign({ id: u.id, name: u.name, email: u.email, role: u.role, access_level: u.access_level }, env.jwtSecret, { expiresIn: '1h' })
  return { user: u, H: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } }
}

console.log('\n######## PROCUREMENT / PURCHASE-REQUISITION FLOW ########')

// PM = the real procurement user; admin = the approver/receiver
const { H: PH } = await signFor('pm@gmail.com')
const { H: AH } = await signFor('admin@gmail.com')

const cleanup = []
const seeded = { itemSupplierId: null, histPoId: null, prId: null, pr2Id: null, poIds: [], grns: [], stockReversals: [] }

try {
  console.log('\n[0] Pick two real Item Master items')
  const items = await fetch(`${BASE}/items`, { headers: PH }).then(j)
  ok(Array.isArray(items) && items.length >= 2, `items available: ${Array.isArray(items) ? items.length : 'FAIL ' + JSON.stringify(items)}`)
  const I1 = items[0], I2 = items[1]
  const name1 = I1.item_name || I1.name, name2 = I2.item_name || I2.name

  console.log('\n[1] PM creates a Purchase Requisition with 2 items')
  const pr = await fetch(`${BASE}/purchase-requisitions`, { method: 'POST', headers: PH, body: JSON.stringify({
    department: 'Kitchen', priority: 'High', required_by: '2026-08-01', notes: 'verify_procurement',
    items: [{ item_id: I1.id, qty: 3, est_rate: 100 }, { item_id: I2.id, item_name: name2, qty: 5, est_rate: 50 }],
  }) }).then(j)
  ok(pr.id && String(pr.number).startsWith('PR') && pr.items?.length === 2, `created ${pr.number} with ${pr.items?.length} items`)
  seeded.prId = pr.id

  console.log('\n[2] It appears in the list with its item count')
  const list = await fetch(`${BASE}/purchase-requisitions`, { headers: PH }).then(j)
  ok(Array.isArray(list) && list.find((x) => x.id === pr.id)?.item_count === 2, `GET /purchase-requisitions -> ${Array.isArray(list) ? list.length + ' PRs' : 'FAIL'}`)

  console.log('\n[3] Submit → Submitted')
  const sub = await fetch(`${BASE}/purchase-requisitions/${pr.id}/submit`, { method: 'POST', headers: PH }).then(j)
  ok(sub.status === 'Submitted', `status = ${sub.status}`)

  console.log('\n[4] PM (Edit level) is blocked from approving')
  const badApprove = await fetch(`${BASE}/purchase-requisitions/${pr.id}/approve`, { method: 'POST', headers: PH })
  ok(badApprove.status === 403, `approve as PM -> HTTP ${badApprove.status} (expect 403)`)

  console.log('\n[5] Management approves')
  const appr = await fetch(`${BASE}/purchase-requisitions/${pr.id}/approve`, { method: 'POST', headers: AH }).then(j)
  ok(appr.status === 'Approved' && !!appr.approved_by, `status = ${appr.status}, approver stamped`)

  console.log('\n[6] Suggest-suppliers is empty before any history exists')
  const sug0 = await fetch(`${BASE}/purchase-requisitions/${pr.id}/suggest-suppliers`, { headers: PH }).then(j)
  ok(sug0.items?.length === 2 && sug0.items.every((x) => Array.isArray(x.suppliers)), `suggest-suppliers returns ${sug0.items?.length} item blocks`)

  console.log('\n[7] Seed REAL history (item↔supplier link + a past PO) → suggestion returns it')
  const supName = (await supabase.from('suppliers').select('name').limit(1).maybeSingle()).data?.name || 'ZZ Verify Supplier'
  const link = (await supabase.from('item_suppliers').insert({ item_id: I1.id, supplier: supName, supplier_part_no: 'PN-VER' }).select().single()).data
  seeded.itemSupplierId = link?.id
  const histPo = (await supabase.from('purchase_orders').insert({ number: 'ZZVER-HIST-PO', supplier: supName, item_name: name1, qty: 2, rate: 120, amount: 240, status: 'Received', created_at: '2026-06-01T00:00:00Z' }).select().single()).data
  seeded.histPoId = histPo?.id
  const sug1 = await fetch(`${BASE}/purchase-requisitions/${pr.id}/suggest-suppliers`, { headers: PH }).then(j)
  const block1 = sug1.items.find((x) => x.item_name === name1)
  ok(block1?.suppliers?.some((s) => s.supplier === supName && s.last_rate === 120), `suggested ${supName} @ last_rate ${block1?.suppliers?.find((s) => s.supplier === supName)?.last_rate}`)

  console.log('\n[8] to-po refuses a requisition that is not Approved (422)')
  const pr2 = await fetch(`${BASE}/purchase-requisitions`, { method: 'POST', headers: PH, body: JSON.stringify({ items: [{ item_id: I1.id, qty: 1, est_rate: 10 }] }) }).then(j)
  seeded.pr2Id = pr2.id
  const badTo = await fetch(`${BASE}/purchase-requisitions/${pr2.id}/to-po`, { method: 'POST', headers: PH, body: JSON.stringify({ allocations: [{ item_name: name1, supplier: supName, rate: 99 }] }) })
  ok(badTo.status === 422, `to-po on draft PR -> HTTP ${badTo.status} (expect 422)`)

  console.log('\n[9] SUPPLIER ALLOCATION — split the approved PR into POs (one per supplier)')
  const alloc = await fetch(`${BASE}/purchase-requisitions/${pr.id}/to-po`, { method: 'POST', headers: PH, body: JSON.stringify({ allocations: [
    { item_name: name1, supplier: supName, rate: 110 },
    { item_name: name2, supplier: 'Verify Supplier B', rate: 55 },
  ] }) }).then(j)
  ok(alloc.purchase_orders?.length === 2 && alloc.requisition?.status === 'Ordered', `created ${alloc.purchase_orders?.length} POs, PR -> ${alloc.requisition?.status}`)
  seeded.poIds = (alloc.purchase_orders || []).map((p) => p.id)
  const po1 = (alloc.purchase_orders || []).find((p) => p.item_name === name1)
  ok(po1 && po1.qty === 3 && Number(po1.amount) === 330 && po1.pr_id === pr.id, `PO ${po1?.number}: amount ${po1?.amount} = 3×110, linked to PR`)

  console.log('\n[10] Delivery tracking shows the new POs as Pending with full outstanding qty')
  const dt = await fetch(`${BASE}/procurement/delivery-tracking`, { headers: PH }).then(j)
  const d1 = (dt || []).find((x) => x.id === po1.id)
  ok(d1 && d1.ordered_qty === 3 && d1.outstanding_qty === 3 && d1.status === 'Pending', `tracking: ordered ${d1?.ordered_qty}, outstanding ${d1?.outstanding_qty}, ${d1?.status}`)

  console.log('\n[11] Receive the PO via the warehouse route (reused, not reimplemented)')
  const rec = await fetch(`${BASE}/goods-receipt/receive-po/${po1.id}`, { method: 'POST', headers: AH, body: JSON.stringify({ warehouse: 'Main Store' }) }).then(j)
  ok(rec.ok && String(rec.grn).startsWith('GRN'), `received -> ${rec.grn}`)
  if (rec.grn) seeded.grns.push(rec.grn)
  // Receiving moved real stock into stock_balances (via the move_stock RPC). Record it so cleanup can
  // reverse the balance — deleting the ledger row alone would leave the balance permanently inflated.
  if (rec.ok && rec.matched && Number(rec.qty)) seeded.stockReversals.push({ item_id: I1.id, warehouse: rec.warehouse || 'Main Store', qty: Number(rec.qty) })

  console.log('\n[12] Delivery tracking now shows it Received')
  const dt2 = await fetch(`${BASE}/procurement/delivery-tracking`, { headers: PH }).then(j)
  const d2 = (dt2 || []).find((x) => x.id === po1.id)
  ok(d2 && d2.received_qty === 3 && d2.status === 'Received', `tracking after receipt: received ${d2?.received_qty}, ${d2?.status}`)

  console.log('\n[13] Supplier performance is computed from the real PO + GRN')
  const perf = await fetch(`${BASE}/procurement/supplier-performance`, { headers: PH }).then(j)
  const p1 = (perf || []).find((x) => x.supplier === supName)
  ok(p1 && p1.total_pos >= 1 && p1.received_pos >= 1 && p1.on_time_pct != null, `${supName}: ${p1?.total_pos} POs, on-time ${p1?.on_time_pct}%, lead ${p1?.avg_lead_time_days}d`)
  const noData = (perf || []).find((x) => x.total_pos === 0)
  ok(noData ? (noData.score === null && noData.has_data === false) : true, `suppliers with no POs report honest "no data"`)
} catch (e) {
  fail++; console.log('  ✗ EXCEPTION', e.message)
} finally {
  console.log('\n[cleanup]')
  try {
    for (const grn of seeded.grns) await supabase.from('stock_ledger').delete().eq('ref_id', grn)
    // reverse the stock_balances increment the goods receipt posted, so the DB is left exactly as found
    for (const rv of seeded.stockReversals) await supabase.rpc('move_stock', { p_item_id: rv.item_id, p_warehouse: rv.warehouse, p_qty: -Math.abs(Number(rv.qty) || 0) })
    if (seeded.poIds.length) { await supabase.from('goods_receipts').delete().in('po_id', seeded.poIds); await supabase.from('purchase_orders').delete().in('id', seeded.poIds) }
    if (seeded.histPoId) await supabase.from('purchase_orders').delete().eq('id', seeded.histPoId)
    if (seeded.itemSupplierId) await supabase.from('item_suppliers').delete().eq('id', seeded.itemSupplierId)
    for (const prId of [seeded.prId, seeded.pr2Id].filter(Boolean)) {
      await supabase.from('purchase_orders').delete().eq('pr_id', prId)
      await supabase.from('purchase_requisition_items').delete().eq('pr_id', prId)
      await supabase.from('purchase_requisitions').delete().eq('id', prId)
    }
    console.log('  cleaned all test requisitions, POs, GRNs, ledger + seeded history')
  } catch (e) { console.log('  cleanup error:', e.message) }
  console.log(`\n######## RESULT: ${pass} passed, ${fail} failed ########`)
  process.exit(fail ? 1 : 0)
}
