import { supabase } from '../config/supabase.js'

const OPEN_PO = (s) => !['Received', 'Closed', 'Delivered', 'Cancelled'].includes(s)

// Live availability for an item (matched by name) — physical, reserved, available, incoming.
export async function availabilityFor(name) {
  if (!name) return { matched: false, physical: 0, reserved: 0, available: 0, incoming: 0 }
  const { data: item } = await supabase.from('items').select('id, name, code').ilike('name', name).limit(1).maybeSingle()
  if (!item) return { matched: false, physical: 0, reserved: 0, available: 0, incoming: 0 }
  const { data: bals } = await supabase.from('stock_balances').select('qty, reserved').eq('item_id', item.id)
  const physical = (bals || []).reduce((s, b) => s + (Number(b.qty) || 0), 0)
  const reserved = (bals || []).reduce((s, b) => s + (Number(b.reserved) || 0), 0)
  const { data: pos } = await supabase.from('purchase_orders').select('qty, status').ilike('item_name', name)
  const incoming = (pos || []).filter((p) => OPEN_PO(p.status)).reduce((s, p) => s + (Number(p.qty) || 0), 0)
  return { matched: true, item: item.name, code: item.code, physical, reserved, available: physical - reserved, incoming }
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
    const { data: bals } = await supabase.from('stock_balances').select('*').eq('item_id', item.id).order('qty', { ascending: false })
    let bal = bals?.[0]
    if (!bal) { const { data: nb } = await supabase.from('stock_balances').insert({ item_id: item.id, warehouse: 'Main Store', qty: 0, reserved: 0 }).select().single(); bal = nb }
    await supabase.from('stock_balances').update({ reserved: (Number(bal.reserved) || 0) + qty }).eq('id', bal.id)
    await supabase.from('stock_reservations').insert({ item_id: item.id, item_name: name, warehouse: bal.warehouse, qty, sales_order_id, project_id, status: 'Active', requested_by: userId })
  }
}

// INV-007 / SEC-006: release a reservation back to free stock (only after Ops approval).
export async function releaseReservation(reservationId) {
  const { data: rv } = await supabase.from('stock_reservations').select('*').eq('id', reservationId).single()
  if (!rv || rv.status === 'Released') return
  const { data: bal } = await supabase.from('stock_balances').select('*').eq('item_id', rv.item_id).eq('warehouse', rv.warehouse).maybeSingle()
  if (bal) await supabase.from('stock_balances').update({ reserved: Math.max(0, (Number(bal.reserved) || 0) - (Number(rv.qty) || 0)) }).eq('id', bal.id)
}
