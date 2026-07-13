// DATA REPAIR — orphan / phantom stock reservations.
//
// Two problems this fixes, both created by the OLD behaviour that the CEO's stock-first rule replaces:
//   1. ORPHAN reservations — the sales order they belonged to no longer exists.
//   2. PHANTOM reservations — reserved > qty, i.e. stock was reserved that we never actually owned
//      (the old accept path reserved the FULL quantity sold, whether or not it was on the shelf).
//
// Reserved stock is invisible to a new quotation, so a phantom reservation makes real stock look
// unavailable — the exact opposite of what the CEO asked for. This puts reserved back in step with
// what is genuinely committed.
//
// DRY RUN BY DEFAULT.  Apply with:  node scripts/repair_stock_reservations.mjs --apply
import { supabase } from '../src/config/supabase.js'

const APPLY = process.argv.includes('--apply')
const n0 = (v) => Number(v) || 0

console.log(`\n######## STOCK RESERVATION REPAIR ${APPLY ? '(APPLYING)' : '(DRY RUN — pass --apply to write)'} ########\n`)

// ── 1. orphan reservations ───────────────────────────────────────────────────
const { data: reservations } = await supabase.from('stock_reservations').select('*').eq('status', 'Active')
const { data: orders } = await supabase.from('sales_orders').select('id')
const liveOrders = new Set((orders || []).map((o) => o.id))

const orphans = (reservations || []).filter((r) => !r.sales_order_id || !liveOrders.has(r.sales_order_id))
console.log(`[1] ORPHAN reservations (their sales order is gone): ${orphans.length}`)
for (const r of orphans) console.log(`    - ${r.item_name} · qty ${r.qty} · ${r.warehouse} · SO ${r.sales_order_id || 'none'}`)

if (APPLY && orphans.length) {
  for (const r of orphans) {
    // give the quantity back to free stock, then drop the reservation
    await supabase.rpc('release_stock', { p_item_id: r.item_id, p_warehouse: r.warehouse, p_qty: n0(r.qty) }).catch(() => {})
    await supabase.from('stock_reservations').delete().eq('id', r.id)
  }
  console.log(`    → released and removed ${orphans.length}`)
}

// ── 2. phantom reserved (reserved > qty) ─────────────────────────────────────
const { data: balances } = await supabase.from('stock_balances').select('*')
const phantom = (balances || []).filter((b) => n0(b.reserved) > n0(b.qty))
console.log(`\n[2] PHANTOM balances (reserved > on hand — stock reserved that we never owned): ${phantom.length}`)
for (const b of phantom) {
  const { data: it } = await supabase.from('items').select('item_name').eq('id', b.item_id).maybeSingle()
  console.log(`    - ${it?.item_name || b.item_id} · ${b.warehouse} · qty ${b.qty} but reserved ${b.reserved}`)
}
if (APPLY && phantom.length) {
  for (const b of phantom) {
    await supabase.from('stock_balances').update({ reserved: n0(b.qty) }).eq('id', b.id)
  }
  console.log(`    → reserved capped at what is actually on hand for ${phantom.length} row(s)`)
}

// ── 3. reserved that no longer matches the live Active reservations ──────────
const { data: after } = await supabase.from('stock_reservations').select('item_id, warehouse, qty, status')
const expected = {}
for (const r of (after || []).filter((r) => r.status === 'Active')) {
  const k = `${r.item_id}|${r.warehouse}`
  expected[k] = (expected[k] || 0) + n0(r.qty)
}
const { data: bal2 } = await supabase.from('stock_balances').select('*')
const drift = (bal2 || []).filter((b) => n0(b.reserved) !== (expected[`${b.item_id}|${b.warehouse}`] || 0))
console.log(`\n[3] DRIFT (balance.reserved ≠ sum of its Active reservations): ${drift.length}`)
for (const b of drift) {
  const want = expected[`${b.item_id}|${b.warehouse}`] || 0
  const { data: it } = await supabase.from('items').select('item_name').eq('id', b.item_id).maybeSingle()
  console.log(`    - ${it?.item_name || b.item_id} · ${b.warehouse} · reserved ${b.reserved} → should be ${want}`)
  if (APPLY) await supabase.from('stock_balances').update({ reserved: want }).eq('id', b.id)
}
if (APPLY && drift.length) console.log(`    → re-synced ${drift.length} balance row(s) to their real reservations`)

console.log(`\n######## ${APPLY ? 'REPAIRED' : 'DRY RUN COMPLETE — nothing was changed'} ########\n`)
process.exit(0)
