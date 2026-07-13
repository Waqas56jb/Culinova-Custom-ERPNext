// STOCK-FIRST ALLOCATION — the CEO's rule:
//   "When creating a quotation, the system should first check the available stock. Only after
//    utilizing the available stock should it allow purchasing or adding items that are not
//    available. This maximizes profitability and minimizes unnecessary purchasing."
//
// So for every line we split the quantity in two:
//   from_stock  = what we can serve out of stock we ALREADY OWN (already paid for → pure margin)
//   to_purchase = the shortfall, and ONLY this may ever become a Purchase Requisition
//
// The split is computed here, once, and then travels with the document:
//   quotation_items.from_stock / to_purchase
//     → project_boq.from_stock / to_purchase        (on customer acceptance)
//       → purchase_requisition_items.qty = to_purchase   (Procurement buys the shortfall ONLY)
//
// Availability = physical − reserved. Reserved stock belongs to an accepted order, so it is NOT
// available to a new quotation, however much is sitting on the shelf.
import { supabase } from '../config/supabase.js'

const n0 = (v) => Number(v) || 0
const OPEN_PO = (s) => !['Received', 'Closed', 'Delivered', 'Cancelled'].includes(s)

// Live availability for many items at once, keyed by item id.
export async function availabilityByIds(itemIds = []) {
  const ids = [...new Set(itemIds.filter(Boolean))]
  if (!ids.length) return {}

  const [{ data: items }, { data: bals }] = await Promise.all([
    supabase.from('items').select('id, item_name, item_code, eta_days, lead_time_days').in('id', ids),
    supabase.from('stock_balances').select('item_id, warehouse, qty, reserved').in('item_id', ids),
  ])

  // incoming = quantity already on an open purchase order (it is coming, but it is not here yet, so it
  // is reported separately and NEVER counted as available)
  const names = (items || []).map((i) => i.item_name).filter(Boolean)
  let pos = []
  if (names.length) {
    const { data } = await supabase.from('purchase_orders').select('item_name, qty, status').in('item_name', names)
    pos = data || []
  }

  const out = {}
  for (const it of items || []) {
    const mine = (bals || []).filter((b) => b.item_id === it.id)
    const physical = mine.reduce((s, b) => s + n0(b.qty), 0)
    const reserved = mine.reduce((s, b) => s + n0(b.reserved), 0)
    const incoming = pos.filter((p) => p.item_name === it.item_name && OPEN_PO(p.status)).reduce((s, p) => s + n0(p.qty), 0)
    out[it.id] = {
      item_id: it.id,
      item_name: it.item_name,
      item_code: it.item_code,
      physical,
      reserved,
      available: Math.max(0, physical - reserved),
      incoming,
      lead_time_days: n0(it.lead_time_days) || n0(it.eta_days) || null,
      warehouses: mine.map((b) => ({ warehouse: b.warehouse, qty: n0(b.qty), reserved: n0(b.reserved) })),
    }
  }
  return out
}

// Allocate a set of lines against live stock, STOCK FIRST.
// Lines are consumed in order, and the running pool is shared per item — so the same item appearing
// on two lines cannot be promised from the same unit of stock twice.
//   lines: [{ item_id, item_name, qty }]
//   → [{ ...line, available, from_stock, to_purchase, in_stock, partial, lead_time_days }]
export async function allocateLines(lines = []) {
  const clean = (lines || []).filter((l) => l && (l.item_id || l.item_name))
  const avail = await availabilityByIds(clean.map((l) => l.item_id))

  // running pool of what is still free to promise, per item
  const pool = {}
  for (const [id, a] of Object.entries(avail)) pool[id] = a.available

  return clean.map((l) => {
    const a = l.item_id ? avail[l.item_id] : null
    const qty = Math.max(0, n0(l.qty))
    // an item with no Item Master link (a one-off / custom fabrication) has no stock by definition —
    // it is honestly 100% to_purchase, never silently treated as available
    const free = a ? Math.max(0, pool[l.item_id] ?? 0) : 0
    const from_stock = Math.min(qty, free)
    const to_purchase = Math.max(0, qty - from_stock)
    if (a) pool[l.item_id] = free - from_stock

    return {
      ...l,
      qty,
      available: a ? a.available : 0,
      physical: a ? a.physical : 0,
      reserved: a ? a.reserved : 0,
      incoming: a ? a.incoming : 0,
      lead_time_days: a ? a.lead_time_days : null,
      from_stock,
      to_purchase,
      in_stock: to_purchase === 0 && qty > 0,     // fully served from stock
      partial: from_stock > 0 && to_purchase > 0, // part stock, part purchase
      stocked_item: !!a,                          // is this even an Item-Master item?
    }
  })
}

// The one-line summary a quotation / project carries: how much of it we already own, and how much of
// it we still have to buy. `needs_procurement` is what makes the purchase step legitimate — the stock
// was utilised first.
export function allocationSummary(allocated = []) {
  const qty = allocated.reduce((s, l) => s + n0(l.qty), 0)
  const from_stock = allocated.reduce((s, l) => s + n0(l.from_stock), 0)
  const to_purchase = allocated.reduce((s, l) => s + n0(l.to_purchase), 0)
  return {
    lines: allocated.length,
    total_qty: qty,
    from_stock,
    to_purchase,
    fully_from_stock: qty > 0 && to_purchase === 0,
    needs_procurement: to_purchase > 0,
    stock_coverage_pct: qty > 0 ? Math.round((from_stock / qty) * 100) : 0,
    purchase_lines: allocated.filter((l) => n0(l.to_purchase) > 0).map((l) => ({
      item_id: l.item_id || null, item_name: l.item_name, qty: n0(l.qty),
      from_stock: n0(l.from_stock), to_purchase: n0(l.to_purchase),
      lead_time_days: l.lead_time_days ?? null,
    })),
  }
}

// The persisted columns for a quotation / BOQ line.
export const allocationColumns = (l) => ({
  available_qty: n0(l.available),
  from_stock: n0(l.from_stock),
  to_purchase: n0(l.to_purchase),
})
