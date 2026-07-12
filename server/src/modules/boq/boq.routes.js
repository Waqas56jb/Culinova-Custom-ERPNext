// M6 — BOQ (Bill of Quantities) Management  ·  panel: 'projects'
// Generate a BOQ from EOS/Item-Master items or a quotation, group equipment, manage quantities,
// see a live cost/sell/GP summary, push the BOQ into a project's equipment list, and export to
// Excel (CSV) / PDF (print-ready HTML). Prices come from THE pricing chain (core/pricing.js) — never
// recomputed here — and every money-bearing response is passed through redactFinancials so Sales /
// Engineering never see cost, margin or supplier price.
import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize, redactFinancials } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'
import { nextNumber } from '../../core/numbering.js'
import { logAudit } from '../../core/audit.js'
import { priceItem } from '../../core/pricing.js'
import { canSeeFinancials } from '../../rbac/permissions.js'

const round = (n) => Math.round((Number(n) || 0) * 100) / 100
const num = (v) => { if (v === '' || v === null || v === undefined) return null; const n = Number(v); return Number.isFinite(n) ? n : null } // '' / non-numeric → null (never NaN to the DB or past a > 0 guard)
const uuid = (v) => (v === '' || v === undefined ? null : v) // never send '' to a uuid column (22P02)
const nowIso = () => new Date().toISOString()

// Resolve a line's cost & sell rate: prefer the item's stored chain output; if either is missing run
// THE pricing chain (priceItem) so a never-priced item still gets a real number instead of a crash.
async function ratesForItem(item) {
  let cost = num(item.landed_cost)
  let sell = num(item.selling_price)
  if (cost == null || sell == null) {
    const chain = await priceItem(item).catch(() => null)
    if (chain?.priced) {
      if (cost == null) cost = chain.landed_cost
      if (sell == null) sell = chain.selling_price
    }
  }
  return { cost_rate: round(cost || 0), sell_rate: round(sell || 0) }
}

// Recompute the BOQ header totals + GP% straight from its lines — the client total is never trusted.
async function recomputeTotals(boqId) {
  const { data: lines } = await supabase.from('boq_items').select('cost_amount, sell_amount').eq('boq_id', boqId)
  const total_cost = round((lines || []).reduce((s, l) => s + (Number(l.cost_amount) || 0), 0))
  const total_sell = round((lines || []).reduce((s, l) => s + (Number(l.sell_amount) || 0), 0))
  const gross_profit = round(total_sell - total_cost)
  const gp_percent = total_sell > 0 ? round((gross_profit / total_sell) * 100) : 0
  const { data } = await supabase.from('boqs')
    .update({ total_cost, total_sell, gross_profit, gp_percent, updated_at: nowIso() })
    .eq('id', boqId).select().single()
  return data
}

// Group lines by group_name with a per-group cost/sell/GP subtotal (Equipment Grouping + Cost Summary).
function groupItems(items = []) {
  const map = new Map()
  for (const it of items) {
    const g = it.group_name || 'General'
    if (!map.has(g)) map.set(g, [])
    map.get(g).push(it)
  }
  const groups = []
  for (const [group_name, lines] of map) {
    const total_cost = round(lines.reduce((s, l) => s + (Number(l.cost_amount) || 0), 0))
    const sell_total = round(lines.reduce((s, l) => s + (Number(l.sell_amount) || 0), 0))
    const qty = round(lines.reduce((s, l) => s + (Number(l.qty) || 0), 0))
    const gp_percent = sell_total > 0 ? round(((sell_total - total_cost) / sell_total) * 100) : 0
    groups.push({ group_name, items: lines, total_cost, sell_total, qty, gp_percent, line_count: lines.length })
  }
  return groups
}

function summarize(items = [], groups = []) {
  const total_cost = round(items.reduce((s, l) => s + (Number(l.cost_amount) || 0), 0))
  const total_sell = round(items.reduce((s, l) => s + (Number(l.sell_amount) || 0), 0))
  const gross_profit = round(total_sell - total_cost)
  const gp_percent = total_sell > 0 ? round((gross_profit / total_sell) * 100) : 0
  return { total_cost, total_sell, gross_profit, gp_percent, line_count: items.length, group_count: groups.length }
}

async function loadLines(boqId) {
  const { data } = await supabase.from('boq_items').select('*').eq('boq_id', boqId)
    .order('sort_order', { ascending: true }).order('created_at', { ascending: true })
  return data || []
}

// ── EXPORT builders ──────────────────────────────────────────────────────────
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
const money = (n) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function boqCsv(boq, groups, fin) {
  const head = ['Group', 'Code', 'Item', 'UOM', 'Qty', 'Sell Rate', 'Sell Amount']
  if (fin) head.push('Cost Rate', 'Cost Amount')
  const rows = [head]
  let tCost = 0, tSell = 0
  for (const g of groups) {
    for (const l of g.items) {
      const row = [g.group_name, l.item_code || '', l.item_name || '', l.uom || '', l.qty, round(l.sell_rate), round(l.sell_amount)]
      if (fin) row.push(round(l.cost_rate), round(l.cost_amount))
      rows.push(row)
    }
    tSell += g.sell_total; tCost += g.total_cost
    const sub = ['', '', `Subtotal — ${g.group_name}`, '', '', '', round(g.sell_total)]
    if (fin) sub.push('', round(g.total_cost))
    rows.push(sub)
  }
  const grand = ['', '', 'GRAND TOTAL', '', '', '', round(tSell)]
  if (fin) grand.push('', round(tCost))
  rows.push(grand)
  // BOM so Excel reads UTF-8 (currency / Arabic) correctly; CRLF line endings
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
}

function boqHtml(boq, groups, fin) {
  const cur = boq.currency || 'SAR'
  const colspan = fin ? 6 : 4
  const rowsHtml = groups.map((g) => {
    const lines = g.items.map((l) => `
      <tr>
        <td>${esc(l.item_code || '')}</td>
        <td>${esc(l.item_name || '')}<div class="spec">${esc(l.description || l.specifications || '')}</div></td>
        <td class="c">${esc(l.uom || '')}</td>
        <td class="r">${round(l.qty)}</td>
        <td class="r">${money(l.sell_rate)}</td>
        <td class="r">${money(l.sell_amount)}</td>
        ${fin ? `<td class="r cost">${money(l.cost_rate)}</td><td class="r cost">${money(l.cost_amount)}</td>` : ''}
      </tr>`).join('')
    return `
      <tr class="grp"><td colspan="${fin ? 8 : 6}">${esc(g.group_name)}</td></tr>
      ${lines}
      <tr class="sub"><td colspan="${colspan}"></td><td class="r">Subtotal</td><td class="r">${money(g.sell_total)}</td>${fin ? `<td class="r"></td><td class="r cost">${money(g.total_cost)}</td>` : ''}</tr>`
  }).join('')
  const s = summarize(groups.flatMap((g) => g.items), groups)
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(boq.number || 'BOQ')}</title>
<style>
  *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;margin:32px;font-size:12px}
  h1{font-size:20px;margin:0 0 2px} .muted{color:#64748b;font-size:11px}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;margin-top:8px} th,td{padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top}
  th{background:#f1f5f9;font-size:11px;text-transform:uppercase;letter-spacing:.03em} .r{text-align:right} .c{text-align:center}
  tr.grp td{background:#0f172a;color:#fff;font-weight:700} tr.sub td{font-weight:600;background:#f8fafc}
  .spec{color:#94a3b8;font-size:10px;margin-top:2px} .cost{color:#b45309}
  .totals{margin-top:18px;width:320px;margin-left:auto} .totals td{border:none;padding:3px 8px} .totals .g{font-weight:800;font-size:14px;border-top:2px solid #0f172a}
  @media print{ .noprint{display:none} body{margin:12mm} }
</style></head><body>
<div class="head">
  <div><h1>Bill of Quantities</h1><div class="muted">${esc(boq.number || '')}${boq.name ? ' · ' + esc(boq.name) : ''}</div></div>
  <div class="muted" style="text-align:right">
    ${boq.customer ? 'Customer: <b>' + esc(boq.customer) + '</b><br>' : ''}
    Currency: <b>${esc(cur)}</b><br>Status: <b>${esc(boq.status || 'Draft')}</b><br>${esc(new Date().toISOString().slice(0, 10))}
  </div>
</div>
<table><thead><tr>
  <th>Code</th><th>Item</th><th class="c">UOM</th><th class="r">Qty</th><th class="r">Sell Rate</th><th class="r">Sell Amt</th>
  ${fin ? '<th class="r">Cost Rate</th><th class="r">Cost Amt</th>' : ''}
</tr></thead><tbody>${rowsHtml || `<tr><td colspan="${fin ? 8 : 6}" class="muted">No items in this BOQ.</td></tr>`}</tbody></table>
<table class="totals">
  <tr><td>Total (Sell)</td><td class="r">${cur} ${money(s.total_sell)}</td></tr>
  ${fin ? `<tr><td>Total Cost</td><td class="r cost">${cur} ${money(s.total_cost)}</td></tr>
  <tr><td>Gross Profit</td><td class="r">${cur} ${money(s.gross_profit)} (${s.gp_percent}%)</td></tr>` : ''}
  <tr class="g"><td>Grand Total</td><td class="r">${cur} ${money(s.total_sell)}</td></tr>
</table>
<script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
</body></html>`
}

// ──────────────────────────────────────────────────────────────────────────────
export function boqRouter() {
  const r = Router()

  // LIST
  r.get('/', authRequired, authorize('projects', 'read'), asyncWrap(async (req, res) => {
    const { data, error } = await supabase.from('boqs').select('*').order('created_at', { ascending: false })
    if (error) throw error
    res.json(redactFinancials(req.user.role, data || []))
  }))

  // READ one — items grouped by group_name + a per-group and overall cost summary
  r.get('/:id', authRequired, authorize('projects', 'read'), asyncWrap(async (req, res) => {
    const { data: boq, error } = await supabase.from('boqs').select('*').eq('id', req.params.id).maybeSingle()
    if (error) throw error
    if (!boq) return res.status(404).json({ error: 'BOQ not found' })
    const items = await loadLines(boq.id)
    const groups = groupItems(items)
    const summary = summarize(items, groups)
    res.json(redactFinancials(req.user.role, { ...boq, items, groups, summary }))
  }))

  // EXPORT — csv (Excel) or print-ready html (PDF). Cost columns only for financial roles.
  r.get('/:id/export', authRequired, authorize('projects', 'read'), asyncWrap(async (req, res) => {
    const { data: boq } = await supabase.from('boqs').select('*').eq('id', req.params.id).maybeSingle()
    if (!boq) return res.status(404).json({ error: 'BOQ not found' })
    const items = await loadLines(boq.id)
    const groups = groupItems(items)
    const fin = canSeeFinancials(req.user.role)
    const fname = String(boq.number || 'BOQ').replace(/[^A-Za-z0-9_-]/g, '_')
    if (String(req.query.format || 'csv').toLowerCase() === 'html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      return res.send(boqHtml(boq, groups, fin))
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${fname}.csv"`)
    return res.send(boqCsv(boq, groups, fin))
  }))

  // CREATE
  r.post('/', authRequired, authorize('projects', 'create'), asyncWrap(async (req, res) => {
    const b = req.body || {}
    if (!b.name && !uuid(b.project_id) && !b.customer) {
      return res.status(422).json({ error: 'Provide at least a name, a customer or a project for the BOQ.' })
    }
    const number = await nextNumber('boqs', 'BOQ')
    const row = {
      number,
      name: b.name || null,
      project_id: uuid(b.project_id),
      quotation_id: uuid(b.quotation_id),
      customer: b.customer || null,
      currency: b.currency || null,
      status: b.status || 'Draft',
      notes: b.notes || null,
      total_cost: 0, total_sell: 0, gross_profit: 0, gp_percent: 0,
      created_by: req.user.id,
    }
    const { data, error } = await supabase.from('boqs').insert(row).select().single()
    if (error) return res.status(400).json({ error: error.message })
    await logAudit(req.user, 'boq', data.id, 'create', { number })
    res.status(201).json(redactFinancials(req.user.role, data))
  }))

  // UPDATE header
  r.patch('/:id', authRequired, authorize('projects', 'update'), asyncWrap(async (req, res) => {
    const b = req.body || {}
    const patch = {}
    for (const k of ['name', 'customer', 'currency', 'status', 'notes']) if (k in b) patch[k] = b[k] || null
    if ('project_id' in b) patch.project_id = uuid(b.project_id)
    if ('quotation_id' in b) patch.quotation_id = uuid(b.quotation_id)
    patch.updated_at = nowIso()
    const { data, error } = await supabase.from('boqs').update(patch).eq('id', req.params.id).select().maybeSingle()
    if (error) return res.status(400).json({ error: error.message })
    if (!data) return res.status(404).json({ error: 'BOQ not found' })
    await logAudit(req.user, 'boq', data.id, 'update', patch)
    res.json(redactFinancials(req.user.role, data))
  }))

  // DELETE the whole BOQ (Full-Admin action)
  r.delete('/:id', authRequired, authorize('projects', 'delete'), asyncWrap(async (req, res) => {
    const { data: lines } = await supabase.from('boq_items').select('id').eq('boq_id', req.params.id)
    const ids = (lines || []).map((l) => l.id)
    if (ids.length) await supabase.from('project_equipment').update({ boq_item_id: null }).in('boq_item_id', ids)
    await supabase.from('boq_items').delete().eq('boq_id', req.params.id)
    const { error } = await supabase.from('boqs').delete().eq('id', req.params.id)
    if (error) return res.status(400).json({ error: error.message })
    await logAudit(req.user, 'boq', req.params.id, 'delete', null)
    res.json({ ok: true })
  }))

  // ADD a line from the Item Master — snapshot the item + resolve rates from the pricing chain
  r.post('/:id/items', authRequired, authorize('projects', 'create'), asyncWrap(async (req, res) => {
    const b = req.body || {}
    const { data: boq } = await supabase.from('boqs').select('id').eq('id', req.params.id).maybeSingle()
    if (!boq) return res.status(404).json({ error: 'BOQ not found' })
    const qty = num(b.qty)
    if (qty == null || qty <= 0) return res.status(422).json({ error: 'Quantity must be greater than zero.' })

    let item = null
    if (uuid(b.item_id)) { const { data } = await supabase.from('items').select('*').eq('id', b.item_id).maybeSingle(); item = data }
    if (!item && b.item_code) { const { data } = await supabase.from('items').select('*').ilike('item_code', b.item_code).maybeSingle(); item = data }
    if (!item && b.item_name) { const { data } = await supabase.from('items').select('*').ilike('item_name', b.item_name).maybeSingle(); item = data }
    if (!item) return res.status(422).json({ error: 'Select a valid item from the Item Master.' })

    const rates = await ratesForItem(item)
    const fin = canSeeFinancials(req.user.role)
    const cost_rate = fin && num(b.cost_rate) != null ? round(num(b.cost_rate)) : rates.cost_rate
    const sell_rate = num(b.sell_rate) != null ? round(num(b.sell_rate)) : rates.sell_rate

    const { data: last } = await supabase.from('boq_items').select('sort_order').eq('boq_id', boq.id)
      .order('sort_order', { ascending: false }).limit(1).maybeSingle()
    const sort_order = num(b.sort_order) != null ? Number(b.sort_order) : (Number(last?.sort_order) || 0) + 1

    const line = {
      boq_id: boq.id,
      group_name: b.group_name || item.item_group || item.product_family || 'General',
      item_id: item.id,
      item_code: item.item_code || item.code || null,
      item_name: item.item_name || item.name || null,
      description: b.description ?? item.description ?? null,
      specifications: b.specifications ?? item.specifications ?? null,
      image_url: item.image_url || null,
      uom: b.uom || item.uom || item.stock_uom || 'Nos',
      qty,
      cost_rate, sell_rate,
      cost_amount: round(qty * cost_rate),
      sell_amount: round(qty * sell_rate),
      sort_order,
    }
    const { data, error } = await supabase.from('boq_items').insert(line).select().single()
    if (error) return res.status(400).json({ error: error.message })
    const boqUpdated = await recomputeTotals(boq.id)
    await logAudit(req.user, 'boq', boq.id, 'add-item', { item: line.item_name, qty })
    res.status(201).json(redactFinancials(req.user.role, { line: data, boq: boqUpdated }))
  }))

  // UPDATE a line (qty / grouping / description / rate) — recompute amounts + BOQ totals
  r.patch('/:id/items/:lineId', authRequired, authorize('projects', 'update'), asyncWrap(async (req, res) => {
    const b = req.body || {}
    const { data: line } = await supabase.from('boq_items').select('*').eq('id', req.params.lineId).eq('boq_id', req.params.id).maybeSingle()
    if (!line) return res.status(404).json({ error: 'BOQ line not found' })
    const fin = canSeeFinancials(req.user.role)
    const patch = {}
    if ('group_name' in b) patch.group_name = b.group_name || 'General'
    if ('description' in b) patch.description = b.description || null
    if ('specifications' in b) patch.specifications = b.specifications || null
    if ('uom' in b) patch.uom = b.uom || 'Nos'
    if (num(b.sort_order) != null) patch.sort_order = Number(b.sort_order)
    if ('cost_rate' in b && fin && num(b.cost_rate) != null) patch.cost_rate = round(num(b.cost_rate))
    if ('sell_rate' in b && num(b.sell_rate) != null) patch.sell_rate = round(num(b.sell_rate))
    let qty = Number(line.qty) || 0
    if ('qty' in b) {
      const q = num(b.qty)
      if (q == null || q <= 0) return res.status(422).json({ error: 'Quantity must be greater than zero.' })
      qty = q; patch.qty = q
    }
    const cRate = patch.cost_rate != null ? patch.cost_rate : Number(line.cost_rate) || 0
    const sRate = patch.sell_rate != null ? patch.sell_rate : Number(line.sell_rate) || 0
    patch.cost_amount = round(qty * cRate)
    patch.sell_amount = round(qty * sRate)
    const { data, error } = await supabase.from('boq_items').update(patch).eq('id', line.id).select().single()
    if (error) return res.status(400).json({ error: error.message })
    const boqUpdated = await recomputeTotals(req.params.id)
    res.json(redactFinancials(req.user.role, { line: data, boq: boqUpdated }))
  }))

  // REMOVE a line (a line removal is an edit of the BOQ, so 'update' — a PM must be able to do it)
  r.delete('/:id/items/:lineId', authRequired, authorize('projects', 'update'), asyncWrap(async (req, res) => {
    await supabase.from('project_equipment').update({ boq_item_id: null }).eq('boq_item_id', req.params.lineId)
    const { error } = await supabase.from('boq_items').delete().eq('id', req.params.lineId).eq('boq_id', req.params.id)
    if (error) return res.status(400).json({ error: error.message })
    const boqUpdated = await recomputeTotals(req.params.id)
    res.json(redactFinancials(req.user.role, { ok: true, boq: boqUpdated }))
  }))

  // GENERATE lines from a quotation's items (appended to whatever is already there)
  r.post('/:id/from-quotation/:quotationId', authRequired, authorize('projects', 'create'), asyncWrap(async (req, res) => {
    const { data: boq } = await supabase.from('boqs').select('*').eq('id', req.params.id).maybeSingle()
    if (!boq) return res.status(404).json({ error: 'BOQ not found' })
    const { data: quote } = await supabase.from('quotations').select('*, quotation_items(*)').eq('id', req.params.quotationId).maybeSingle()
    if (!quote) return res.status(404).json({ error: 'Quotation not found' })
    const qItems = quote.quotation_items || []
    if (!qItems.length) return res.status(422).json({ error: 'That quotation has no line items to import.' })

    const ids = [...new Set(qItems.map((q) => q.item_id).filter(Boolean))]
    const byId = {}
    if (ids.length) { const { data: its } = await supabase.from('items').select('*').in('id', ids); for (const it of its || []) byId[it.id] = it }
    const { data: last } = await supabase.from('boq_items').select('sort_order').eq('boq_id', boq.id)
      .order('sort_order', { ascending: false }).limit(1).maybeSingle()
    let so = Number(last?.sort_order) || 0

    const lines = []
    for (const qi of qItems) {
      const item = qi.item_id ? byId[qi.item_id] : null
      let cost = num(qi.cost)
      let sell = num(qi.rate)
      if ((cost == null || sell == null) && item) {
        const rr = await ratesForItem(item)
        if (cost == null) cost = rr.cost_rate
        if (sell == null) sell = rr.sell_rate
      }
      cost = round(cost || 0); sell = round(sell || 0)
      const qty = num(qi.qty) || 1
      lines.push({
        boq_id: boq.id,
        group_name: qi.brand || item?.item_group || 'General',
        item_id: qi.item_id || null,
        item_code: item?.item_code || item?.code || null,
        item_name: qi.item_name || item?.item_name || null,
        description: qi.description || item?.description || null,
        specifications: qi.specifications || item?.specifications || null,
        image_url: qi.image_url || item?.image_url || null,
        uom: qi.uom || item?.uom || 'Nos',
        qty,
        cost_rate: cost, sell_rate: sell,
        cost_amount: round(qty * cost), sell_amount: round(qty * sell),
        sort_order: ++so,
      })
    }
    const { error } = await supabase.from('boq_items').insert(lines)
    if (error) return res.status(400).json({ error: error.message })
    const patch = { quotation_id: quote.id, updated_at: nowIso() }
    if (!boq.customer && quote.customer) patch.customer = quote.customer
    if (!boq.currency && quote.currency) patch.currency = quote.currency
    if (!boq.project_id && quote.project_id) patch.project_id = quote.project_id
    await supabase.from('boqs').update(patch).eq('id', boq.id)
    const boqUpdated = await recomputeTotals(boq.id)
    await logAudit(req.user, 'boq', boq.id, 'from-quotation', { quotation: quote.number, lines: lines.length })
    res.status(201).json(redactFinancials(req.user.role, { added: lines.length, boq: boqUpdated }))
  }))

  // PUSH every line into the project's equipment list (this is how a BOQ becomes the equipment list).
  // Idempotent: re-pushing replaces the rows previously pushed from this BOQ's lines.
  r.post('/:id/to-project-equipment', authRequired, authorize('projects', 'create'), asyncWrap(async (req, res) => {
    const { data: boq } = await supabase.from('boqs').select('*').eq('id', req.params.id).maybeSingle()
    if (!boq) return res.status(404).json({ error: 'BOQ not found' })
    if (!boq.project_id) return res.status(422).json({ error: 'This BOQ is not linked to a project. Set a project on the BOQ before pushing equipment.' })
    const lines = await loadLines(boq.id)
    if (!lines.length) return res.status(422).json({ error: 'This BOQ has no line items to push.' })

    const lineIds = lines.map((l) => l.id)
    await supabase.from('project_equipment').delete().in('boq_item_id', lineIds)
    const rows = lines.map((l) => ({
      project_id: boq.project_id,
      item_id: l.item_id || null,
      item_code: l.item_code || null,
      item_name: l.item_name || null,
      boq_item_id: l.id,
      area: l.group_name || null,
      qty: Number(l.qty) || 0,
      unit_cost: Number(l.cost_rate) || 0,
      unit_price: Number(l.sell_rate) || 0,
      total_cost: Number(l.cost_amount) || 0,
      total_price: Number(l.sell_amount) || 0,
      notes: l.specifications || null,
    }))
    const { data, error } = await supabase.from('project_equipment').insert(rows).select()
    if (error) return res.status(400).json({ error: error.message })
    await logAudit(req.user, 'boq', boq.id, 'to-project-equipment', { project_id: boq.project_id, count: rows.length })
    res.status(201).json({ ok: true, pushed: (data || rows).length, project_id: boq.project_id })
  }))

  return r
}

export default boqRouter
