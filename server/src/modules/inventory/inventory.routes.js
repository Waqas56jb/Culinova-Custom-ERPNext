import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'
import { availabilityFor, releaseReservation } from '../../core/inventory.js'
import { availabilityByIds } from '../../core/availability.js'
import { analyse as analyseOpeningStock, commit as commitOpeningStock } from '../../core/openingStock.js'
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

/**
 * Bulk availability for the quotation item picker.
 *   GET /inventory/availability-bulk?ids=<uuid>,<uuid>,…
 *
 * One call for the whole result list — asking per row would fire a request per keystroke. Returns
 * the states an estimator needs before committing a line:
 *   in_stock   = physical − reserved (what this quotation may actually promise)
 *   reserved   = already committed to an accepted order, never available here
 *   in_transit = quantity on an OPEN purchase order — coming, but not on the shelf yet
 *
 * "To purchase" is deliberately NOT here: it is the shortfall against a quantity, so it belongs to
 * the stock-first allocation on the quotation itself, which already computes it per line.
 */
r.get('/availability-bulk', authRequired, asyncWrap(async (req, res) => {
  const ids = String(req.query.ids || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200)
  if (!ids.length) return res.json({})
  const map = await availabilityByIds(ids)
  const out = {}
  for (const [id, a] of Object.entries(map)) {
    out[id] = {
      in_stock: a.available,
      reserved: a.reserved,
      in_transit: a.incoming,
      physical: a.physical,
      lead_time_days: a.lead_time_days,
    }
  }
  res.json(out)
}))

/**
 * OPENING STOCK IMPORT (feedback item 8) — two steps, so nothing is written until it has been seen.
 *
 *   POST /inventory/opening-stock/preview  { headers, rows }  → every row resolved, nothing written
 *   POST /inventory/opening-stock/commit   { lines }          → posts the rows marked ok
 *
 * The client parses the workbook (the Item Master import already works this way) and posts rows as
 * JSON, so no upload handling is needed here.
 *
 * Quantities post through the stock engine, never straight into stock_balances, so the ledger and
 * every stock report stay in agreement. An opening valuation rate also updates items.valuation_rate,
 * which is the cost basis the automatic quotation pricing reads.
 */
r.post('/opening-stock/preview', authRequired, authorize('warehouse', 'create'), asyncWrap(async (req, res) => {
  const { headers, rows } = req.body || {}
  if (!Array.isArray(headers) || !Array.isArray(rows)) {
    return res.status(422).json({ error: 'Send { headers: [...], rows: [[...]] }' })
  }
  res.json(await analyseOpeningStock(headers, rows))
}))

r.post('/opening-stock/commit', authRequired, authorize('warehouse', 'create'), asyncWrap(async (req, res) => {
  const lines = Array.isArray(req.body?.lines) ? req.body.lines : []
  if (!lines.length) return res.status(422).json({ error: 'No lines to import.' })
  const result = await commitOpeningStock(lines, { actorId: req.user?.id })
  await logAudit(req.user, 'opening_stock', null, 'imported', {
    posted: result.posted, rate_updated: result.rate_updated, failed: result.errors.length,
  }).catch(() => {})
  res.json(result)
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
