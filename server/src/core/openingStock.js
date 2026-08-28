import { supabase } from '../config/supabase.js'
import { postStock } from './stockmove.js'

/**
 * OPENING STOCK IMPORT (feedback item 8).
 *
 * Brings the current warehouse position into the ERP before go-live. The client specified the
 * columns: Item, Warehouse, Quantity, Opening Valuation Rate.
 *
 * Two things this deliberately does NOT do:
 *
 *  • It does not write stock_balances directly. Stock moves only through postStock() → the
 *    move_stock RPC + the stock ledger, so the balance, the ledger and every stock report agree.
 *    A direct insert would look right on the Stock page and be invisible in the ledger.
 *
 *  • It does not invent an item. A row whose item cannot be matched in the Item Master is
 *    REPORTED, not created — an opening balance against an item nobody defined is how a stock
 *    file quietly becomes fiction.
 *
 * Column names are matched by alias, so the client's own spreadsheet headings work without being
 * renamed to match ours.
 */

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const ALIASES = {
  item: ['item', 'item code', 'item name', 'code', 'sku', 'model', 'product', 'description'],
  warehouse: ['warehouse', 'store', 'location', 'site', 'branch'],
  qty: ['quantity', 'qty', 'opening qty', 'opening quantity', 'stock', 'balance', 'on hand'],
  rate: [
    'opening valuation rate', 'valuation rate', 'rate', 'unit cost', 'cost', 'unit price',
    'value per unit', 'opening rate',
  ],
}

/** Map the sheet's headers onto the four fields we need. */
export function planColumns(headers = []) {
  const plan = {}
  headers.forEach((h, i) => {
    const n = norm(h)
    if (!n) return
    for (const [field, names] of Object.entries(ALIASES)) {
      if (plan[field] != null) continue
      if (names.includes(n)) { plan[field] = i; return }
    }
  })
  // second pass: allow a partial match ("opening valuation rate (SAR)")
  headers.forEach((h, i) => {
    const n = norm(h)
    if (!n) return
    for (const [field, names] of Object.entries(ALIASES)) {
      if (plan[field] != null) continue
      if (names.some((name) => n.includes(name))) plan[field] = i
    }
  })
  return plan
}

const num = (v) => {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(/[, ]/g, ''))
  return Number.isFinite(n) ? n : null
}

/**
 * Parse rows against the plan and resolve every item / warehouse.
 * Nothing is written — this is what the preview shows.
 */
export async function analyse(headers, rows) {
  const plan = planColumns(headers)
  const missing = ['item', 'qty'].filter((f) => plan[f] == null)
  if (missing.length) {
    const err = new Error(
      `The sheet needs a column for: ${missing.join(', ')}. Found headers: ${headers.filter(Boolean).join(', ')}`,
    )
    err.status = 422
    throw err
  }

  const parsed = rows
    .map((r, i) => ({
      row: i + 2, // 1-based, plus the header
      item: r[plan.item] == null ? '' : String(r[plan.item]).trim(),
      warehouse: plan.warehouse != null && r[plan.warehouse] != null ? String(r[plan.warehouse]).trim() : '',
      qty: num(plan.qty != null ? r[plan.qty] : null),
      rate: num(plan.rate != null ? r[plan.rate] : null),
    }))
    .filter((r) => r.item || r.qty != null)

  // resolve items by code first, then by name — one query each, not one per row
  const keys = [...new Set(parsed.map((r) => r.item).filter(Boolean))]
  const byCode = new Map()
  const byName = new Map()
  if (keys.length) {
    const [{ data: c }, { data: n }] = await Promise.all([
      supabase.from('items').select('id, item_code, item_name, valuation_rate').in('item_code', keys),
      supabase.from('items').select('id, item_code, item_name, valuation_rate').in('item_name', keys),
    ])
    for (const it of c || []) byCode.set(String(it.item_code).toLowerCase(), it)
    for (const it of n || []) byName.set(String(it.item_name).toLowerCase(), it)
  }

  const { data: whRows } = await supabase.from('warehouses').select('name')
  const warehouses = new Set((whRows || []).map((w) => String(w.name).toLowerCase()))

  const lines = parsed.map((r) => {
    const key = r.item.toLowerCase()
    const item = byCode.get(key) || byName.get(key) || null
    const problems = []
    if (!item) problems.push('item not found in the Item Master')
    if (r.qty == null) problems.push('quantity is missing or not a number')
    else if (r.qty < 0) problems.push('quantity is negative')
    if (r.rate != null && r.rate < 0) problems.push('valuation rate is negative')
    if (r.warehouse && !warehouses.has(r.warehouse.toLowerCase())) problems.push(`warehouse "${r.warehouse}" does not exist`)
    return {
      ...r,
      item_id: item?.id || null,
      item_name: item?.item_name || null,
      item_code: item?.item_code || null,
      current_valuation_rate: item ? Number(item.valuation_rate) || 0 : null,
      ok: problems.length === 0,
      problems,
    }
  })

  return {
    plan: Object.fromEntries(Object.entries(plan).map(([k, i]) => [k, headers[i]])),
    total: lines.length,
    ready: lines.filter((l) => l.ok).length,
    blocked: lines.filter((l) => !l.ok).length,
    warehouses_in_file: [...new Set(lines.map((l) => l.warehouse).filter(Boolean))],
    lines,
  }
}

/**
 * Commit the rows that are ready. Each posts through the stock engine and, where an opening
 * valuation rate was given, updates items.valuation_rate — which is the cost basis the automatic
 * quotation pricing then uses.
 */
export async function commit(lines, { actorId = null } = {}) {
  const out = { posted: 0, rate_updated: 0, skipped: 0, errors: [] }

  for (const l of lines) {
    if (!l.ok || !l.item_id) { out.skipped++; continue }
    try {
      await postStock({
        item: { id: l.item_id, item_name: l.item_name },
        warehouse: l.warehouse || null,
        qtyIn: l.qty,
        refType: 'Opening Stock',
        refId: actorId ? String(actorId) : null,
        note: `Opening balance import (row ${l.row})`,
      })
      out.posted++

      if (l.rate != null && l.rate > 0) {
        const { data: before } = await supabase.from('items').select('valuation_rate').eq('id', l.item_id).maybeSingle()
        const oldVr = before?.valuation_rate
        const { error } = await supabase.from('items').update({ valuation_rate: l.rate }).eq('id', l.item_id)
        if (error) out.errors.push({ row: l.row, error: `valuation rate: ${error.message}` })
        else {
          out.rate_updated++
          if (String(oldVr ?? '') !== String(l.rate)) {
            await supabase.from('item_pricing_history').insert({
              item_id: l.item_id,
              field: 'valuation_rate',
              old_value: oldVr != null ? String(oldVr) : null,
              new_value: String(l.rate),
              source: 'opening-stock',
              created_by: actorId || null,
            })
          }
        }
      }
    } catch (e) {
      out.errors.push({ row: l.row, item: l.item, error: e.message })
    }
  }
  return out
}
