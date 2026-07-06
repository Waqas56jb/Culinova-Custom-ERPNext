import { supabase } from '../config/supabase.js'

const OPEN_PO = (s) => !['Received', 'Closed', 'Delivered', 'Cancelled'].includes(s)

// Live availability for an item (matched by name) — physical, reserved, available, incoming.
export async function availabilityFor(name) {
  if (!name) return { matched: false, physical: 0, reserved: 0, available: 0, incoming: 0, eta_days: 0 }
  const { data: item } = await supabase.from('items').select('id, name, code, eta_days').ilike('name', name).limit(1).maybeSingle()
  if (!item) return { matched: false, physical: 0, reserved: 0, available: 0, incoming: 0, eta_days: 0 }
  const { data: bals } = await supabase.from('stock_balances').select('qty, reserved').eq('item_id', item.id)
  const physical = (bals || []).reduce((s, b) => s + (Number(b.qty) || 0), 0)
  const reserved = (bals || []).reduce((s, b) => s + (Number(b.reserved) || 0), 0)
  const { data: pos } = await supabase.from('purchase_orders').select('qty, status').ilike('item_name', name)
  const incoming = (pos || []).filter((p) => OPEN_PO(p.status)).reduce((s, p) => s + (Number(p.qty) || 0), 0)
  return { matched: true, item: item.name, code: item.code, physical, reserved, available: physical - reserved, incoming, eta_days: Number(item.eta_days) || 0 }
}

// INV-006: auto-reserve stock when a Sales Order is created. Matches each line to the
// Item Master by name; un-stocked custom/special items are skipped (nothing to reserve).
export async function reserveForSalesOrder({ items, sales_order_id, project_id, userId }) {
  for (const it of items || []) {
    const name = it.item_name || it.name
    const qty = Number(it.qty) || 0
    if (!name || qty <= 0) continue
    const { data: item } = await supabase.from('items').select('id').ilike('name', name).limit(1).maybeSingle()
    if (!item) continue
    // pick the warehouse with the most stock (else Main Store); reserve ATOMICALLY so concurrent
    // acceptances can't lose updates and reserved can never go negative (see reserve_stock RPC).
    const { data: bals } = await supabase.from('stock_balances').select('warehouse, qty').eq('item_id', item.id).order('qty', { ascending: false })
    const warehouse = bals?.[0]?.warehouse || 'Main Store'
    await supabase.rpc('reserve_stock', { p_item_id: item.id, p_warehouse: warehouse, p_qty: qty })
    await supabase.from('stock_reservations').insert({ item_id: item.id, item_name: name, warehouse, qty, sales_order_id, project_id, status: 'Active', requested_by: userId })
  }
}

// INV-007 / SEC-006: release a reservation back to free stock (only after Ops approval).
// Flip status FIRST, conditioned on it still being Active, so two concurrent releases can't
// both subtract the same qty (double-release race). Only the winner does the atomic release.
export async function releaseReservation(reservationId) {
  const { data: rv } = await supabase.from('stock_reservations').update({ status: 'Released' }).eq('id', reservationId).in('status', ['Active', 'Release Requested']).select().maybeSingle()
  if (!rv) return // already released / not found → nothing to free
  await supabase.rpc('release_stock', { p_item_id: rv.item_id, p_warehouse: rv.warehouse, p_qty: Number(rv.qty) || 0 })
}
