import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'
import { logAudit } from '../../core/audit.js'
import { nextNumber } from '../../core/numbering.js'
import { findItem, postStock, defaultWarehouse } from '../../core/stockmove.js'
import { consumeReservationsForDelivery } from '../../core/inventory.js'

// These routers are mounted BEFORE the generic CRUD at the same paths and only intercept POST,
// so creating a document ALSO moves real stock (balances + ledger). GET/PATCH/DELETE fall through.

// ── STOCK ADJUSTMENT → moves stock in/out ──
export function adjustmentsRouter() {
  const r = Router()
  r.post('/', authRequired, authorize('warehouse', 'create'), asyncWrap(async (req, res) => {
    const b = req.body
    const raw = Number(b.qty_change) || 0
    const isOut = b.type === 'Remove' || raw < 0
    const abs = Math.abs(raw)
    if (!abs) return res.status(422).json({ error: 'Quantity change is required' })
    const item = await findItem({ item_name: b.item_name })
    if (!item) return res.status(422).json({ error: `Item "${b.item_name || ''}" not found in the Item Master` })
    const warehouse = b.warehouse || (await defaultWarehouse())
    const number = await nextNumber('stock_adjustments', 'ADJ')
    const { data, error } = await supabase.from('stock_adjustments').insert({
      number, warehouse, item_id: item.id, item_name: item.item_name || b.item_name,
      qty_change: isOut ? -abs : abs, type: isOut ? 'Remove' : 'Add', reason: b.reason || null, created_by: req.user.id,
    }).select().single()
    if (error) return res.status(500).json({ error: error.message })
    await postStock({ item, warehouse, qtyIn: isOut ? 0 : abs, qtyOut: isOut ? abs : 0, refType: 'Adjustment', refId: number, note: b.reason })
    await logAudit(req.user, 'stock_adjustment', data.id, 'created', { number, qty: isOut ? -abs : abs }).catch(() => {})
    res.status(201).json(data)
  }))
  return r
}

// ── STOCK TRANSFER → moves stock out of source + into destination ──
export function transfersRouter() {
  const r = Router()
  r.post('/', authRequired, authorize('warehouse', 'create'), asyncWrap(async (req, res) => {
    const b = req.body
    const qty = Math.abs(Number(b.qty) || 0)
    if (!qty) return res.status(422).json({ error: 'Quantity is required' })
    if (!b.from_warehouse || !b.to_warehouse) return res.status(422).json({ error: 'From and To warehouse are required' })
    if (b.from_warehouse === b.to_warehouse) return res.status(422).json({ error: 'From and To warehouse must differ' })
    const item = await findItem({ item_name: b.item_name })
    if (!item) return res.status(422).json({ error: `Item "${b.item_name || ''}" not found in the Item Master` })
    const status = b.status || 'Completed'
    const number = await nextNumber('stock_transfers', 'ST')
    const { data, error } = await supabase.from('stock_transfers').insert({
      number, from_warehouse: b.from_warehouse, to_warehouse: b.to_warehouse,
      item_id: item.id, item_name: item.item_name || b.item_name, qty, status,
      notes: b.notes || null, created_by: req.user.id,
    }).select().single()
    if (error) return res.status(500).json({ error: error.message })
    // a Draft transfer is not executed yet; anything else moves the stock
    if (status !== 'Draft') {
      await postStock({ item, warehouse: b.from_warehouse, qtyOut: qty, refType: 'Transfer', refId: number, note: `to ${b.to_warehouse}` })
      await postStock({ item, warehouse: b.to_warehouse, qtyIn: qty, refType: 'Transfer', refId: number, note: `from ${b.from_warehouse}` })
    }
    await logAudit(req.user, 'stock_transfer', data.id, 'created', { number, qty }).catch(() => {})
    res.status(201).json(data)
  }))
  return r
}

// ── DELIVERY NOTE → issues stock OUT of the warehouse ──
export function deliveryNotesRouter() {
  const r = Router()
  r.post('/', authRequired, authorize('warehouse', 'create'), asyncWrap(async (req, res) => {
    const b = req.body
    const qty = Math.abs(Number(b.qty) || 0) || 1
    const item = await findItem({ item_name: b.item_name, item_id: b.item_id })
    const warehouse = b.warehouse || (await defaultWarehouse())
    const number = await nextNumber('delivery_notes', 'DN')
    const salesOrderId = b.sales_order_id || null
    let projectId = b.project_id || null
    // Resolve SO from project when only project is supplied (SO-linked delivery)
    if (!salesOrderId && projectId) {
      const { data: proj } = await supabase.from('projects').select('sales_order_id').eq('id', projectId).maybeSingle()
      if (proj?.sales_order_id) {/* keep projectId; SO resolved below */}
    }
    let soId = salesOrderId
    if (!soId && projectId) {
      const { data: proj } = await supabase.from('projects').select('sales_order_id').eq('id', projectId).maybeSingle()
      soId = proj?.sales_order_id || null
    }

    let consumeNote = b.customer || null
    if (item && (soId || projectId)) {
      const { consumed, notes } = await consumeReservationsForDelivery({
        itemId: item.id,
        itemName: item.item_name || b.item_name,
        salesOrderId: soId,
        projectId,
        qty,
        warehouse,
      })
      if (consumed > 0) {
        consumeNote = [consumeNote, ...notes].filter(Boolean).join(' · ')
      }
    }

    const { data, error } = await supabase.from('delivery_notes').insert({
      number, project_id: projectId, customer: b.customer || null,
      item_name: b.item_name || null, qty, value: Number(b.value) || 0,
      area: b.area || null, position: b.position || null, status: b.status || 'Delivered',
    }).select().single()
    if (error) return res.status(500).json({ error: error.message })
    if (item) await postStock({ item, warehouse, qtyOut: qty, refType: 'Delivery Note', refId: number, note: consumeNote })
    await logAudit(req.user, 'delivery_note', data.id, 'created', { number, qty, reservation_note: consumeNote }).catch(() => {})
    res.status(201).json(data)
  }))
  return r
}

// ── GOODS RECEIPT → receive a PO: mark Received + bring stock IN ──
export function receiptsRouter() {
  const r = Router()
  r.post('/receive-po/:id', authRequired, authorize('warehouse', 'update'), asyncWrap(async (req, res) => {
    const { data: po } = await supabase.from('purchase_orders').select('*').eq('id', req.params.id).maybeSingle()
    if (!po) return res.status(404).json({ error: 'Purchase order not found' })
    if (po.status === 'Received') return res.status(422).json({ error: 'Already received' })
    const qty = Math.abs(Number(po.qty) || 0) || 1
    const item = await findItem({ item_name: po.item_name })
    const warehouse = req.body?.warehouse || (await defaultWarehouse())
    await supabase.from('purchase_orders').update({ status: 'Received' }).eq('id', po.id)
    const grnNumber = await nextNumber('goods_receipts', 'GRN')
    await supabase.from('goods_receipts').insert({ number: grnNumber, po_id: po.id, item_name: po.item_name, qty })
    let balance = null
    if (item) balance = await postStock({ item, warehouse, qtyIn: qty, refType: 'Goods Receipt', refId: grnNumber, note: po.supplier })
    await logAudit(req.user, 'goods_receipt', po.id, 'received', { grn: grnNumber, qty }).catch(() => {})
    res.json({ ok: true, grn: grnNumber, qty, warehouse, balance, matched: !!item })
  }))
  return r
}
