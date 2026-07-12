// End-to-end warehouse/stock flow: adjustment → transfer → receive PO → delivery note.
// Proves stock_balances + stock_ledger + KPI endpoints all move with real data. Self-cleaning.
import { supabase } from '../src/config/supabase.js'
import jwt from 'jsonwebtoken'
import { env } from '../src/config/env.js'
const BASE = process.env.BASE || 'http://localhost:5050/api'
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
let pass = 0, fail = 0
const ok = (c, m) => { c ? (pass++, console.log('  ✓', m)) : (fail++, console.log('  ✗ FAIL', m)) }

// act as the real warehouse user (Stock User) — proves RBAC works for the actual role
const { data: u } = await supabase.from('users').select('*').eq('email', 'warehouse@culinova.sa').single()
const token = jwt.sign({ id: u.id, name: u.name, email: u.email, role: u.role, access_level: u.access_level }, env.jwtSecret, { expiresIn: '1h' })
const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

console.log('\n######## WAREHOUSE / STOCK FLOW (as Stock User) ########')

console.log('\n[1] Warehouses load (was 500 — missing created_at)')
const whs = await fetch(`${BASE}/warehouses`, { headers: H }).then(j)
ok(Array.isArray(whs) && whs.length >= 1, `GET /warehouses -> ${Array.isArray(whs) ? whs.length + ' warehouses' : 'FAIL ' + JSON.stringify(whs)}`)
const WH1 = whs[0]?.name

// need a 2nd warehouse for the transfer test
let WH2 = whs[1]?.name
let createdWh = null
if (!WH2) { createdWh = await fetch(`${BASE}/warehouses`, { method: 'POST', headers: H, body: JSON.stringify({ name: 'ZZ Test Store', location: 'Jeddah', type: 'Store' }) }).then(j); WH2 = createdWh.name }
ok(!!WH1 && !!WH2, `warehouses: ${WH1} / ${WH2}`)

// pick a real item
const items = await fetch(`${BASE}/items`, { headers: H }).then(j)
const ITEM = items[0]?.item_name
ok(!!ITEM, `test item: ${ITEM}`)

const stockOf = async (name, wh) => {
  const rows = await fetch(`${BASE}/inventory/stock`, { headers: H }).then(j)
  const r = (rows || []).filter((x) => x.item === name && (!wh || x.warehouse === wh))
  return r.reduce((s, x) => s + (Number(x.physical) || 0), 0)
}
const before = await stockOf(ITEM)
console.log(`\n[2] ADJUSTMENT (+10) — must actually increase stock (was: record only)`)
const adj = await fetch(`${BASE}/stock-adjustments`, { method: 'POST', headers: H, body: JSON.stringify({ item_name: ITEM, qty_change: 10, type: 'Add', warehouse: WH1, reason: 'ZZ opening stock' }) }).then(j)
ok(adj.id && adj.number?.startsWith('ADJ-'), `adjustment created ${adj.number}`)
const afterAdj = await stockOf(ITEM, WH1)
ok(afterAdj === 10, `stock in ${WH1} = ${afterAdj} (expect 10)`)

console.log('\n[3] LEDGER posted')
const ledger = await fetch(`${BASE}/stock-ledger`, { headers: H }).then(j)
const le = (ledger || []).find((l) => l.ref_id === adj.number)
ok(!!le && Number(le.qty_in) === 10, `ledger entry: in ${le?.qty_in}, balance ${le?.balance}`)

console.log(`\n[4] TRANSFER 4 units ${WH1} -> ${WH2}`)
const tr = await fetch(`${BASE}/stock-transfers`, { method: 'POST', headers: H, body: JSON.stringify({ item_name: ITEM, qty: 4, from_warehouse: WH1, to_warehouse: WH2, status: 'Completed' }) }).then(j)
ok(tr.number?.startsWith('ST-'), `transfer ${tr.number}`)
ok((await stockOf(ITEM, WH1)) === 6, `${WH1} now ${await stockOf(ITEM, WH1)} (expect 6)`)
ok((await stockOf(ITEM, WH2)) === 4, `${WH2} now ${await stockOf(ITEM, WH2)} (expect 4)`)

console.log('\n[5] DELIVERY NOTE (2 out) — must reduce stock')
const dn = await fetch(`${BASE}/delivery-notes`, { method: 'POST', headers: H, body: JSON.stringify({ item_name: ITEM, qty: 2, customer: 'ZZ Customer', warehouse: WH1, status: 'Delivered' }) }).then(j)
ok(dn.number?.startsWith('DN-'), `delivery note ${dn.number}`)
ok((await stockOf(ITEM, WH1)) === 4, `${WH1} after delivery = ${await stockOf(ITEM, WH1)} (expect 4)`)

console.log('\n[6] GOODS RECEIPT (receive PO) — must bring stock IN')
// PO is created by procurement (Stock User correctly has no procurement panel) — use admin for setup
const { data: adminU } = await supabase.from('users').select('*').eq('email', 'admin@gmail.com').single()
const adminTok = jwt.sign({ id: adminU.id, name: adminU.name, email: adminU.email, role: adminU.role, access_level: adminU.access_level }, env.jwtSecret, { expiresIn: '1h' })
const AH = { authorization: `Bearer ${adminTok}`, 'content-type': 'application/json' }
const po = await fetch(`${BASE}/purchase-orders`, { method: 'POST', headers: AH, body: JSON.stringify({ supplier: 'ZZ Supplier', item_name: ITEM, qty: 5, amount: 1000, status: 'Pending' }) }).then(j)
let grn = null
if (po.id) {
  grn = await fetch(`${BASE}/goods-receipt/receive-po/${po.id}`, { method: 'POST', headers: H, body: JSON.stringify({ warehouse: WH1 }) }).then(j)
  ok(grn.ok && grn.grn?.startsWith('GRN-'), `received -> ${grn.grn}, qty ${grn.qty}`)
  ok((await stockOf(ITEM, WH1)) === 9, `${WH1} after receipt = ${await stockOf(ITEM, WH1)} (expect 9)`)
} else ok(false, 'could not create PO (procurement panel needed)')

console.log('\n[7] KPI endpoints now show real values')
const stockRows = await fetch(`${BASE}/inventory/stock`, { headers: H }).then(j)
ok(stockRows.length > 0, `/inventory/stock -> ${stockRows.length} balance rows (Stock/Items page will show these)`)
const led2 = await fetch(`${BASE}/stock-ledger`, { headers: H }).then(j)
ok(led2.length >= 5, `/stock-ledger -> ${led2.length} movements (Stock Movement chart)`)

console.log('\n[8] CLEANUP')
await supabase.from('stock_ledger').delete().eq('item_id', (await supabase.from('items').select('id').ilike('item_name', ITEM).maybeSingle()).data?.id)
await supabase.from('stock_balances').delete().eq('item_id', (await supabase.from('items').select('id').ilike('item_name', ITEM).maybeSingle()).data?.id)
await supabase.from('stock_adjustments').delete().eq('id', adj.id)
await supabase.from('stock_transfers').delete().eq('id', tr.id)
await supabase.from('delivery_notes').delete().eq('id', dn.id)
if (po.id) { await supabase.from('goods_receipts').delete().eq('po_id', po.id); await supabase.from('purchase_orders').delete().eq('id', po.id) }
if (createdWh?.id) await supabase.from('warehouses').delete().eq('id', createdWh.id)
console.log('  cleaned test stock + docs')

console.log(`\n######## RESULT: ${pass} passed, ${fail} failed ########`)
process.exit(fail ? 1 : 0)
