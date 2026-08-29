/**
 * Sprint 1b Block 2 — Valuation Rate approval (Ali §3).
 * priceEngine chain untouched; this gates WHEN VR is written.
 */
import { supabase } from '../config/supabase.js'
import { getBrand, supplierPriceFor } from './itempricing.js'
import { priceItem, persistable } from './pricing.js'
import { notifyVrChangeRequest, notifyVrDecision } from './notify.js'

const strVal = (v) => (v == null ? null : String(v))
const nullEmpty = (o) => { for (const k of Object.keys(o || {})) if (o[k] === '') o[k] = null; return o }

async function repriceCols(merged) {
  const brandRec = await getBrand(merged.brand)
  const blank = (v) => (v === '' || v === undefined ? null : v)
  const supplier = blank(merged.supplier_price) ?? (await supplierPriceFor(merged.brand, merged.model))
  const resolved = {
    ...merged,
    supplier_price: supplier,
    exchange_factor: blank(merged.exchange_factor) ?? brandRec?.exchange_factor ?? null,
    price_factor: blank(merged.price_factor) ?? brandRec?.price_factor ?? null,
    currency: merged.currency || brandRec?.currency || null,
  }
  const chain = await priceItem(resolved, { applyDiscount: false })
  if (!chain.priced) return {}
  const cols = persistable(chain)
  cols.standard_rate = chain.selling_price
  return cols
}

export async function writeVrHistory({ itemId, oldVal, newVal, source, createdBy, note }) {
  if (strVal(oldVal) === strVal(newVal)) return
  await supabase.from('item_pricing_history').insert({
    item_id: itemId,
    field: 'valuation_rate',
    old_value: strVal(oldVal),
    new_value: strVal(newVal),
    source,
    created_by: createdBy || null,
    note: note || null,
  })
}

/** Apply VR to item + reprice selling (same path for Management direct and approve). */
export async function applyValuationRate({ item, newValue, actor, source, note }) {
  const newVr = Number(newValue)
  if (!Number.isFinite(newVr) || newVr < 0) {
    const err = new Error('valuation_rate must be a non-negative number')
    err.status = 422
    throw err
  }
  const oldVr = item.valuation_rate
  const priced = await repriceCols({ ...item, valuation_rate: newVr })
  const patch = nullEmpty({ valuation_rate: newVr, ...priced })
  const { data: updated, error } = await supabase.from('items').update(patch).eq('id', item.id).select().single()
  if (error) throw error

  await writeVrHistory({
    itemId: item.id,
    oldVal: oldVr,
    newVal: updated.valuation_rate,
    source,
    createdBy: actor?.id,
    note,
  })

  if (updated.standard_rate != null && updated.standard_rate !== item.standard_rate) {
    await supabase.from('item_prices')
      .update({ price_list_rate: Number(updated.standard_rate) })
      .eq('item_id', item.id)
      .eq('price_list', 'Standard Selling')
      .eq('selling', true)
  }

  return updated
}

export async function findPendingVrRequest(itemId) {
  const { data } = await supabase.from('vr_change_requests')
    .select('*')
    .eq('item_id', itemId)
    .eq('status', 'Pending')
    .limit(1)
    .maybeSingle()
  return data || null
}

export async function createPendingVrRequest({ item, newValue, reason, actor }) {
  const existing = await findPendingVrRequest(item.id)
  if (existing) {
    const err = new Error('A pending VR change already exists for this item')
    err.status = 409
    err.request_id = existing.id
    throw err
  }
  const newVr = Number(newValue)
  if (!Number.isFinite(newVr) || newVr < 0) {
    const err = new Error('valuation_rate must be a non-negative number')
    err.status = 422
    throw err
  }
  const row = {
    item_id: item.id,
    item_name: item.item_name || item.name || null,
    old_value: item.valuation_rate != null ? Number(item.valuation_rate) : null,
    new_value: newVr,
    status: 'Pending',
    reason: reason ? String(reason).trim() || null : null,
    requested_by: actor?.name || actor?.email || null,
    requested_by_id: actor?.id || null,
  }
  const { data, error } = await supabase.from('vr_change_requests').insert(row).select().single()
  if (error) throw error
  try { await notifyVrChangeRequest(data, actor?.name) } catch { /* best-effort */ }
  return data
}

/** Management direct write — apply + auto-Approved register (requester = approver = self). */
export async function applyVrDirectAsApprover({ item, newValue, actor }) {
  const updated = await applyValuationRate({
    item,
    newValue,
    actor,
    source: 'manual',
    note: `direct apply by ${actor?.name || 'Management'}`,
  })
  const { data: reg, error } = await supabase.from('vr_change_requests').insert({
    item_id: item.id,
    item_name: item.item_name || item.name || null,
    old_value: item.valuation_rate != null ? Number(item.valuation_rate) : null,
    new_value: Number(updated.valuation_rate),
    status: 'Approved',
    reason: null,
    requested_by: actor?.name || null,
    requested_by_id: actor?.id || null,
    decided_by: actor?.name || null,
    decided_by_id: actor?.id || null,
    decided_at: new Date().toISOString(),
    decision_note: 'Direct apply by approver',
  }).select().single()
  if (error) throw error
  return { item: updated, request: reg }
}

export async function approveVrRequest(requestId, actor) {
  const { data: req } = await supabase.from('vr_change_requests').select('*').eq('id', requestId).maybeSingle()
  if (!req) { const e = new Error('Request not found'); e.status = 404; throw e }
  if (req.status !== 'Pending') { const e = new Error(`Request is already ${req.status}`); e.status = 422; throw e }

  const { data: item } = await supabase.from('items').select('*').eq('id', req.item_id).single()
  if (!item) { const e = new Error('Item not found'); e.status = 404; throw e }

  const note = `requested by ${req.requested_by || '—'} → approved by ${actor?.name || '—'}`
  const updated = await applyValuationRate({
    item,
    newValue: req.new_value,
    actor,
    source: 'approved-request',
    note,
  })

  const { data: decided, error } = await supabase.from('vr_change_requests').update({
    status: 'Approved',
    decided_by: actor?.name || null,
    decided_by_id: actor?.id || null,
    decided_at: new Date().toISOString(),
  }).eq('id', req.id).select().single()
  if (error) throw error

  try { await notifyVrDecision(decided, 'Approved', actor?.name) } catch { /* best-effort */ }
  return { item: updated, request: decided }
}

export async function rejectVrRequest(requestId, actor, decisionNote) {
  const note = String(decisionNote || '').trim()
  if (!note) { const e = new Error('Reject reason is required'); e.status = 422; throw e }

  const { data: req } = await supabase.from('vr_change_requests').select('*').eq('id', requestId).maybeSingle()
  if (!req) { const e = new Error('Request not found'); e.status = 404; throw e }
  if (req.status !== 'Pending') { const e = new Error(`Request is already ${req.status}`); e.status = 422; throw e }

  const { data: decided, error } = await supabase.from('vr_change_requests').update({
    status: 'Rejected',
    decided_by: actor?.name || null,
    decided_by_id: actor?.id || null,
    decided_at: new Date().toISOString(),
    decision_note: note,
  }).eq('id', req.id).select().single()
  if (error) throw error

  try { await notifyVrDecision(decided, 'Rejected', actor?.name) } catch { /* best-effort */ }
  return { request: decided }
}

export async function cancelVrRequest(requestId, actor, { isApprover }) {
  const { data: req } = await supabase.from('vr_change_requests').select('*').eq('id', requestId).maybeSingle()
  if (!req) { const e = new Error('Request not found'); e.status = 404; throw e }
  if (req.status !== 'Pending') { const e = new Error(`Request is already ${req.status}`); e.status = 422; throw e }
  const isRequester = req.requested_by_id && req.requested_by_id === actor?.id
  if (!isApprover && !isRequester) {
    const e = new Error('Only the requester or Management may cancel')
    e.status = 403
    throw e
  }
  const { data: decided, error } = await supabase.from('vr_change_requests').update({
    status: 'Cancelled',
    decided_by: actor?.name || null,
    decided_by_id: actor?.id || null,
    decided_at: new Date().toISOString(),
    decision_note: isApprover && !isRequester ? 'Cancelled by Management' : 'Cancelled by requester',
  }).eq('id', req.id).select().single()
  if (error) throw error
  return { request: decided }
}

export async function listVrRequests({ status, user, isApprover }) {
  let q = supabase.from('vr_change_requests').select('*').order('requested_at', { ascending: false }).limit(200)
  if (status) q = q.eq('status', status)
  if (!isApprover) q = q.eq('requested_by_id', user.id)
  const { data, error } = await q
  if (error) throw error
  return data || []
}
