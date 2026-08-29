import { supabase } from '../config/supabase.js'
import { logAudit } from './audit.js'

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

/**
 * INV-006 / Sprint 2: reserve stock for an SO.
 * Warehouse pick = MAX unreserved (qty - reserved), not max qty (G71).
 * Caps via reserve_stock RPC; records short_qty when request > available.
 */
export async function reserveForSalesOrder({ items, sales_order_id, project_id, userId }) {
  const created = []
  for (const it of items || []) {
    const name = it.item_name || it.name
    const requested = Number(it.qty) || 0
    if (!name || requested <= 0) continue

    let item = null
    if (it.item_id) {
      const { data } = await supabase.from('items').select('id, item_name, name').eq('id', it.item_id).maybeSingle()
      item = data
    }
    if (!item) {
      const { data } = await supabase.from('items').select('id, item_name, name').ilike('item_name', name).limit(1).maybeSingle()
      item = data
    }
    if (!item) {
      const { data } = await supabase.from('items').select('id, item_name, name').ilike('name', name).limit(1).maybeSingle()
      item = data
    }
    if (!item) continue

    const { data: bals } = await supabase.from('stock_balances')
      .select('warehouse, qty, reserved')
      .eq('item_id', item.id)

    const ranked = (bals || [])
      .map((b) => ({
        warehouse: b.warehouse,
        qty: Number(b.qty) || 0,
        reserved: Number(b.reserved) || 0,
        unreserved: Math.max(0, (Number(b.qty) || 0) - (Number(b.reserved) || 0)),
      }))
      .sort((a, b) => b.unreserved - a.unreserved)

    const warehouse = ranked[0]?.warehouse || 'Main Store'
    const { data: reservedDelta, error: rpcErr } = await supabase.rpc('reserve_stock', {
      p_item_id: item.id, p_warehouse: warehouse, p_qty: requested,
    })
    if (rpcErr) throw new Error(rpcErr.message)

    const reserved = Number(reservedDelta) || 0
    const short_qty = Math.max(0, requested - reserved)
    if (reserved <= 0 && short_qty <= 0) continue

    const row = {
      item_id: item.id,
      item_name: item.item_name || item.name || name,
      warehouse,
      qty: reserved,
      requested_qty: requested,
      short_qty,
      sales_order_id,
      project_id,
      status: 'Active',
      requested_by: userId || null,
    }
    const { data: ins, error } = await supabase.from('stock_reservations').insert(row).select().single()
    if (error) throw error

    await logAudit(
      userId ? { id: userId } : null,
      'stock_reservation',
      ins.id,
      'reserved',
      { item: row.item_name, requested, reserved, short_qty, warehouse, sales_order_id },
    ).catch(() => {})

    created.push(ins)
  }
  return created
}

/** INV-007 / SEC-006: full release after Ops approval. */
export async function releaseReservation(reservationId) {
  const { data: rv } = await supabase.from('stock_reservations')
    .update({ status: 'Released' })
    .eq('id', reservationId)
    .in('status', ['Active', 'Release Requested'])
    .select()
    .maybeSingle()
  if (!rv) return null
  await supabase.rpc('release_stock', {
    p_item_id: rv.item_id, p_warehouse: rv.warehouse, p_qty: Number(rv.qty) || 0,
  })
  return rv
}

/**
 * Sprint 2 G64 — on SO-linked delivery, consume Active reservations for the item.
 * Decrements reservation qty / release_stock; marks Consumed at 0.
 * @returns {{ consumed: number, notes: string[] }}
 */
export async function consumeReservationsForDelivery({
  itemId, itemName, salesOrderId, projectId, qty, warehouse,
}) {
  const need = Math.max(0, Number(qty) || 0)
  if (need <= 0) return { consumed: 0, notes: [] }

  let q = supabase.from('stock_reservations')
    .select('*')
    .eq('status', 'Active')
    .order('created_at', { ascending: true })

  if (salesOrderId) q = q.eq('sales_order_id', salesOrderId)
  else if (projectId) q = q.eq('project_id', projectId)
  else return { consumed: 0, notes: [] }

  if (itemId) q = q.eq('item_id', itemId)
  else if (itemName) q = q.ilike('item_name', itemName)

  const { data: rows } = await q
  let left = need
  let consumed = 0
  const notes = []

  for (const rv of rows || []) {
    if (left <= 0) break
    const have = Number(rv.qty) || 0
    if (have <= 0) continue
    const take = Math.min(have, left)
    const remain = have - take
    const wh = warehouse || rv.warehouse

    await supabase.rpc('release_stock', {
      p_item_id: rv.item_id, p_warehouse: rv.warehouse, p_qty: take,
    })

    if (remain <= 0) {
      await supabase.from('stock_reservations').update({ qty: 0, status: 'Consumed' }).eq('id', rv.id)
    } else {
      await supabase.from('stock_reservations').update({ qty: remain }).eq('id', rv.id)
    }

    consumed += take
    left -= take
    notes.push(`reservation consumed: ${take} @ ${wh}`)
  }

  return { consumed, notes }
}
