/**
 * Sprint 2 Block 2 — stock-first procurement guard (G66).
 * Block PR/PO for lines fully (or partially) covered by unreserved stock unless
 * Management override + reason, or buy_shortfall_only (auto-reduce to shortfall).
 */
import { supabase } from '../config/supabase.js'
import { availabilityByIds } from './availability.js'
import { isManagement } from '../rbac/permissions.js'
import { logAudit } from './audit.js'
import { notifyStockOverridePurchase } from './notify.js'

const n0 = (v) => Number(v) || 0
const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

/** Resolve item_id from name when missing. */
async function resolveLines(lines = []) {
  const out = (lines || []).map((l) => ({
    item_id: isUuid(l.item_id) ? l.item_id : null,
    item_name: (l.item_name || l.name || '').trim() || null,
    qty: Math.max(0, n0(l.qty)),
  })).filter((l) => l.item_id || l.item_name)

  const needName = out.filter((l) => !l.item_id && l.item_name)
  if (needName.length) {
    const names = [...new Set(needName.map((l) => l.item_name))]
    const { data } = await supabase.from('items').select('id, item_name, name').in('item_name', names)
    const byName = {}
    for (const it of data || []) {
      byName[(it.item_name || '').toLowerCase()] = it.id
      byName[(it.name || '').toLowerCase()] = it.id
    }
    for (const l of out) {
      if (!l.item_id && l.item_name) l.item_id = byName[l.item_name.toLowerCase()] || null
    }
  }
  return out
}

/**
 * @param {Array<{item_id?:string, item_name?:string, qty:number}>} lines
 * @returns {Promise<Array>}
 */
export async function checkLines(lines = []) {
  const resolved = await resolveLines(lines)
  const avail = await availabilityByIds(resolved.map((l) => l.item_id).filter(Boolean))

  return resolved.map((l) => {
    const a = l.item_id ? avail[l.item_id] : null
    const available_unreserved = a ? n0(a.available) : 0
    const qty = l.qty
    const allowed_qty = Math.max(0, qty - available_unreserved) // shortfall
    const excess_qty = Math.min(qty, available_unreserved) // covered by stock
    const fully_covered = qty > 0 && available_unreserved >= qty
    const partial = available_unreserved > 0 && available_unreserved < qty
    const in_stock_conflict = fully_covered || partial

    return {
      item_id: l.item_id,
      item_name: l.item_name || a?.item_name || null,
      qty,
      available_unreserved,
      physical: a ? n0(a.physical) : 0,
      reserved: a ? n0(a.reserved) : 0,
      incoming: a ? n0(a.incoming) : 0,
      fully_covered,
      partial,
      in_stock_conflict,
      allowed_qty,
      excess_qty,
      suggested_shortfall: allowed_qty,
      suggestion_buy_shortfall: `Buy shortfall only (${allowed_qty})`,
      suggestion_override: 'Override full qty (Management reason required)',
    }
  })
}

/**
 * Enforce guard before PR/PO insert.
 * @returns {{ ok:true, lines, override_reason, buy_shortfall_only, adjusted_lines } | { ok:false, status, body }}
 */
export async function assertPurchaseAllowed({
  lines,
  actor,
  override,
  buy_shortfall_only = false,
  docLabel = 'purchase',
} = {}) {
  const checked = await checkLines(lines)
  if (!checked.length) {
    return { ok: false, status: 422, body: { error: 'At least one item line is required' } }
  }

  const reason = (override?.reason || override || '').toString().trim()
  const wantsOverride = !!reason
  const canOverride = isManagement(actor?.role)

  if (wantsOverride && !canOverride) {
    return {
      ok: false,
      status: 403,
      body: { error: 'Only Management / System Admin may override the stock-first purchase guard', conflicts: checked.filter((c) => c.in_stock_conflict) },
    }
  }

  const conflicts = checked.filter((c) => c.in_stock_conflict)

  if (buy_shortfall_only) {
    const adjusted = checked.map((c) => ({
      ...c,
      qty: c.suggested_shortfall,
    })).filter((c) => c.qty > 0)
    if (!adjusted.length) {
      return {
        ok: false,
        status: 422,
        body: {
          error: 'Nothing to purchase — all lines are fully covered by stock',
          conflicts,
        },
      }
    }
    return {
      ok: true,
      lines: checked,
      adjusted_lines: adjusted,
      override_reason: null,
      buy_shortfall_only: true,
    }
  }

  if (conflicts.length && !wantsOverride) {
    return {
      ok: false,
      status: 422,
      body: {
        error: 'Item(s) available in stock',
        conflicts,
        suggestions: conflicts.map((c) => ({
          item_id: c.item_id,
          item_name: c.item_name,
          requested: c.qty,
          available: c.available_unreserved,
          buy_shortfall_only: c.suggested_shortfall,
          message: c.fully_covered
            ? `Fully in stock (${c.available_unreserved}) — do not purchase, or Management override with reason.`
            : `${c.suggestion_buy_shortfall} vs ${c.suggestion_override}`,
        })),
      },
    }
  }

  return {
    ok: true,
    lines: checked,
    adjusted_lines: checked,
    override_reason: wantsOverride ? reason : null,
    buy_shortfall_only: false,
    docLabel,
  }
}

/** Persist override + audit + bell after a guarded create succeeds. */
export async function recordStockOverride({
  actor,
  docType, // 'purchase_requisition' | 'purchase_order'
  docId,
  docNumber,
  override_reason,
  lines = [],
}) {
  if (!override_reason || !docId) return
  await logAudit(actor, docType, docId, 'stock_override_purchase', {
    number: docNumber,
    reason: override_reason,
    lines: lines.map((l) => ({ item: l.item_name, qty: l.qty, available: l.available_unreserved })),
  })
  await notifyStockOverridePurchase({
    actor,
    docType,
    docNumber,
    reason: override_reason,
    lines,
  })
}
