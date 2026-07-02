import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'
import { availabilityFor, releaseReservation } from '../../core/inventory.js'
import { logAudit } from '../../core/audit.js'

const r = Router()
const OPEN_PO = (s) => !['Received', 'Closed', 'Delivered', 'Cancelled'].includes(s)
const days = (d) => (d ? Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000)) : 0)

// INV-001..005: enriched stock — physical, reserved, available, incoming, aging.
r.get('/stock', authRequired, authorize('warehouse', 'read'), asyncWrap(async (req, res) => {
  const [{ data: bals }, { data: pos }] = await Promise.all([
    supabase.from('stock_balances').select('*, items(name, code, item_group, reorder_level, selling_rate, standard_rate, cost, uom)'),
    supabase.from('purchase_orders').select('item_name, qty, status'),
  ])
  const incomingByName = {}
  for (const p of pos || []) if (OPEN_PO(p.status)) incomingByName[(p.item_name || '').toLowerCase()] = (incomingByName[(p.item_name || '').toLowerCase()] || 0) + (Number(p.qty) || 0)
  const rows = (bals || []).map((b) => {
    const name = b.items?.name || ''
    const physical = Number(b.qty) || 0
    const reserved = Number(b.reserved) || 0
    return {
      id: b.id, item: name, code: b.items?.code || '', group: b.items?.item_group || '', warehouse: b.warehouse,
      physical, reserved, available: physical - reserved,
      incoming: incomingByName[name.toLowerCase()] || 0,
      aging_days: days(b.received_at), reorder_level: Number(b.items?.reorder_level) || 0,
      rate: Number(b.items?.standard_rate) || Number(b.items?.selling_rate) || 0, cost: Number(b.items?.cost) || 0, uom: b.items?.uom || 'Nos',
    }
  })
  res.json(rows)
}))

// INV-008/009: availability lookup for quotation / BOQ preparation.
r.get('/availability', authRequired, asyncWrap(async (req, res) => {
  res.json(await availabilityFor(req.query.name || ''))
}))

// reservations list (Operations / warehouse view)
r.get('/reservations', authRequired, authorize('warehouse', 'read'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('stock_reservations').select('*').order('created_at', { ascending: false })
  if (error) throw error
  res.json(data || [])
}))

// INV-007: anyone with stock access can REQUEST a release …
r.post('/reservations/:id/request-release', authRequired, authorize('warehouse', 'update'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('stock_reservations').update({ status: 'Release Requested', release_reason: (req.body.reason || '').trim(), requested_by: req.user.id }).eq('id', req.params.id).eq('status', 'Active').select().single()
  if (error) throw error
  res.json(data)
}))

// … but only Operations approval (approve access) actually frees the stock (SEC-006).
r.post('/reservations/:id/approve-release', authRequired, authorize('warehouse', 'approve'), asyncWrap(async (req, res) => {
  await releaseReservation(req.params.id)
  const { data, error } = await supabase.from('stock_reservations').update({ status: 'Released', released_by: req.user.id }).eq('id', req.params.id).select().single()
  if (error) throw error
  await logAudit(req.user, 'stock_reservation', req.params.id, 'released', { item: data.item_name, qty: data.qty })
  res.json(data)
}))

export default r
