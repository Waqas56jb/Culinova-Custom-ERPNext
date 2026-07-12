import { supabase } from '../config/supabase.js'

// Resolve an item by name (case-insensitive) or id.
export async function findItem({ item_id, item_name }) {
  if (item_id) {
    const { data } = await supabase.from('items').select('id, item_name, name, stock_uom').eq('id', item_id).maybeSingle()
    if (data) return data
  }
  if (item_name) {
    const { data } = await supabase.from('items').select('id, item_name, name, stock_uom').ilike('item_name', item_name).limit(1).maybeSingle()
    if (data) return data
  }
  return null
}

// Default warehouse when none supplied (first warehouse, else 'Main Store').
export async function defaultWarehouse() {
  const { data } = await supabase.from('warehouses').select('name').order('name').limit(1).maybeSingle()
  return data?.name || 'Main Store'
}

// THE single place stock actually moves: updates stock_balances atomically AND posts a
// stock_ledger entry. Every receipt / delivery / adjustment / transfer goes through here,
// so Stock Value, Available, Stock Movement chart and the ledger are always in sync.
export async function postStock({ item, warehouse, qtyIn = 0, qtyOut = 0, refType, refId, note }) {
  if (!item?.id) return null
  const wh = warehouse || (await defaultWarehouse())
  const delta = (Number(qtyIn) || 0) - (Number(qtyOut) || 0)
  const { data: balance, error } = await supabase.rpc('move_stock', { p_item_id: item.id, p_warehouse: wh, p_qty: delta })
  if (error) throw new Error(error.message)
  await supabase.from('stock_ledger').insert({
    item_id: item.id, item_name: item.item_name || item.name, warehouse: wh,
    qty_in: Number(qtyIn) || 0, qty_out: Number(qtyOut) || 0,
    balance: Number(balance) || 0, ref_type: refType || null, ref_id: refId ? String(refId) : null, note: note || null,
  })
  return Number(balance) || 0
}
