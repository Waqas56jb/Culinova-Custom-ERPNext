import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'
import { canAccessPanel, isManagement } from '../../rbac/permissions.js'
import { logAudit } from '../../core/audit.js'
import { resolveItemAuto } from '../../core/itempricing.js'

const r = Router()

// ── helpers ──────────────────────────────────────────────────────────────
const CHILD = {
  barcodes: 'item_barcodes', uoms: 'item_uoms', reorders: 'item_reorders',
  suppliers: 'item_suppliers', customer_details: 'item_customer_details', taxes: 'item_taxes',
  item_defaults: 'item_defaults', attributes: 'item_variant_attributes',
  manufacturers: 'item_manufacturers', alternatives: 'item_alternatives',
}
// (#10) financials visible ONLY to Management / Operations / Finance / Warehouse / Procurement.
// Sales & Engineering see selling price + availability + datasheets — never cost/supplier/margin.
const FIN_ROLES = ['Management', 'System Admin', 'Operations', 'Finance', 'Operations Manager', 'Finance Manager']
const canSeeCost = (u) => isManagement(u.role) || FIN_ROLES.includes(u.role) || canAccessPanel(u.role, 'warehouse') || canAccessPanel(u.role, 'procurement') || canAccessPanel(u.role, 'finance')
const COST_FIELDS = ['cost', 'supplier_price', 'landed_cost', 'gp_percent', 'valuation_rate', 'last_purchase_rate']
const redact = (u, item) => { if (canSeeCost(u) || !item) return item; const x = { ...item }; COST_FIELDS.forEach((f) => delete x[f]); return x }

async function loadChildren(itemId) {
  const out = {}
  for (const [key, table] of Object.entries(CHILD)) {
    const { data } = await supabase.from(table).select('*').eq('item_id', itemId)
    out[key] = data || []
  }
  const { data: prices } = await supabase.from('item_prices').select('*').eq('item_id', itemId)
  out.prices = prices || []
  return out
}
async function replaceChildren(itemId, body) {
  for (const [key, table] of Object.entries(CHILD)) {
    if (!Array.isArray(body[key])) continue
    await supabase.from(table).delete().eq('item_id', itemId)
    const rows = body[key].filter((x) => x && Object.keys(x).length).map((x) => { const { id, item_id, ...rest } = x; return { ...rest, item_id: itemId } })
    if (rows.length) await supabase.from(table).insert(rows)
  }
}
// has this item had any real stock movement? → certain fields then lock (ERPNext cant_change)
async function hasStock(itemId) {
  const { data } = await supabase.from('stock_balances').select('qty, reserved').eq('item_id', itemId)
  return (data || []).some((b) => Number(b.qty) || Number(b.reserved))
}
const num = () => `ITM-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`

// ── LIST (everyone with a panel can read & select; cost redacted by role) ──
r.get('/', authRequired, asyncWrap(async (req, res) => {
  let q = supabase.from('items').select('*').order('created_at', { ascending: false })
  if (req.query.active === '1') q = q.eq('disabled', false)          // IM-009 hide disabled
  if (req.query.sales === '1') q = q.eq('is_sales_item', true).eq('has_variants', false)
  const { data, error } = await q
  if (error) throw error
  res.json((data || []).map((i) => redact(req.user, i)))
}))

// ── GET ONE (full item + all child tables) ──
r.get('/:id', authRequired, asyncWrap(async (req, res) => {
  const { data: item, error } = await supabase.from('items').select('*').eq('id', req.params.id).single()
  if (error) return res.status(404).json({ error: 'Item not found' })
  const children = await loadChildren(item.id)
  res.json({ ...redact(req.user, item), ...children })
}))

// (8) Product comparison — alternatives = other items in the same Product Family
r.get('/:id/alternatives', authRequired, asyncWrap(async (req, res) => {
  const { data: it } = await supabase.from('items').select('product_family').eq('id', req.params.id).single()
  if (!it?.product_family) return res.json([])
  const { data } = await supabase.from('items').select('*').ilike('product_family', it.product_family).neq('id', req.params.id)
  res.json((data || []).map((x) => redact(req.user, x)))
}))

// (7) pricing history (financial — restricted)
r.get('/:id/pricing-history', authRequired, asyncWrap(async (req, res) => {
  if (!canSeeCost(req.user)) return res.status(403).json({ error: 'Not allowed' })
  const { data } = await supabase.from('item_pricing_history').select('*').eq('item_id', req.params.id).order('created_at', { ascending: false })
  res.json(data || [])
}))

// ── CREATE (Item Manager / Warehouse) — naming, default UOM, auto Item Price ──
r.post('/', authRequired, authorize('warehouse', 'create'), asyncWrap(async (req, res) => {
  const p = req.body
  const item_code = (p.item_code || p.code || '').trim() || num()
  // (13) duplicate prevention by Brand + Model
  if (p.brand && p.model) {
    const { data: dup } = await supabase.from('items').select('id').ilike('brand', p.brand).ilike('model', p.model).limit(1).maybeSingle()
    if (dup) return res.status(409).json({ error: `An item with brand "${p.brand}" + model "${p.model}" already exists.` })
  }
  // (3)(4)(6) auto Item Name + pricing from brand factors + supplier price list
  const auto = await resolveItemAuto(p)
  const name = (p.item_name || p.name || auto.name || '').trim()
  if (!name) return res.status(422).json({ error: 'Provide Brand + Model + Product Family (or an Item Name).' })
  // barcode uniqueness (global)
  for (const b of p.barcodes || []) {
    if (!b.barcode) continue
    const { data: dup } = await supabase.from('item_barcodes').select('id').eq('barcode', b.barcode).limit(1).maybeSingle()
    if (dup) return res.status(409).json({ error: `Barcode ${b.barcode} already used by another item` })
  }
  const { ...cols } = stripChildren(p)
  // when a supplier price exists → auto cost/selling/GP; else keep user-entered (manual) values
  const pricing = auto.supplier_price != null
    ? { supplier_price: auto.supplier_price, landed_cost: auto.landed_cost, cost: auto.landed_cost, selling_price: auto.selling_price, standard_rate: auto.selling_price, gp_percent: auto.gp_percent }
    : {}
  const row = { ...cols, ...pricing, item_code, code: item_code, name, item_name: name }
  const { data: item, error } = await supabase.from('items').insert(row).select().single()
  if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: error.message })

  // (7) pricing history — keep every cost/selling value; quotations suggest the last
  if (row.cost != null || row.standard_rate != null) {
    await supabase.from('item_pricing_history').insert({ item_id: item.id, brand: p.brand || null, model: p.model || null, cost: row.cost ?? null, selling_price: row.standard_rate ?? null, source: auto.supplier_price != null ? 'price-list' : 'manual', created_by: req.user.id })
  }

  // ensure stock UOM present in conversion table (factor 1)
  const uoms = Array.isArray(p.uoms) ? [...p.uoms] : []
  const su = p.stock_uom || p.uom
  if (su && !uoms.some((u) => (u.uom || '').toLowerCase() === su.toLowerCase())) uoms.push({ uom: su, conversion_factor: 1 })
  await replaceChildren(item.id, { ...p, uoms })

  // auto Item Price (ERPNext after_insert) when a selling rate is resolved
  if (Number(item.standard_rate) > 0 && (p.is_sales_item ?? true)) {
    await supabase.from('item_prices').insert({ item_id: item.id, item_code, uom: su, price_list: 'Standard Selling', selling: true, price_list_rate: Number(item.standard_rate), currency: 'SAR' })
  }
  await logAudit(req.user, 'item', item.id, 'created', { item_code })
  res.status(201).json({ ...item, ...(await loadChildren(item.id)) })
}))

// ── UPDATE (lock rules after stock exists, like ERPNext cant_change) ──
r.patch('/:id', authRequired, authorize('warehouse', 'update'), asyncWrap(async (req, res) => {
  const p = req.body
  const { data: cur } = await supabase.from('items').select('*').eq('id', req.params.id).single()
  if (!cur) return res.status(404).json({ error: 'Item not found' })
  const locked = await hasStock(cur.id)
  if (locked) {
    const guard = ['is_stock_item', 'has_serial_no', 'has_batch_no', 'stock_uom']
    for (const f of guard) if (p[f] != null && p[f] !== cur[f]) return res.status(422).json({ error: `Cannot change ${f} — stock transactions already exist for this item.` })
    if (p.valuation_method && p.valuation_method !== cur.valuation_method && p.valuation_method !== 'Moving Average')
      return res.status(422).json({ error: 'Valuation method can only be switched to Moving Average once stock exists.' })
  }
  const cols = stripChildren(p)
  if (p.item_name || p.name) { cols.name = p.item_name || p.name; cols.item_name = p.item_name || p.name }
  const { data: item, error } = await supabase.from('items').update(cols).eq('id', cur.id).select().single()
  if (error) throw error
  await replaceChildren(cur.id, p)
  // propagate name/brand to Item Price (ERPNext on_update)
  await supabase.from('item_prices').update({ item_code: item.item_code }).eq('item_id', item.id)
  await logAudit(req.user, 'item', item.id, 'updated', {})
  res.json({ ...item, ...(await loadChildren(item.id)) })
}))

r.delete('/:id', authRequired, authorize('warehouse', 'delete'), asyncWrap(async (req, res) => {
  if (await hasStock(req.params.id)) return res.status(422).json({ error: 'Cannot delete — stock exists. Disable the item instead.' })
  const { error } = await supabase.from('items').delete().eq('id', req.params.id) // children cascade
  if (error) throw error
  await logAudit(req.user, 'item', req.params.id, 'deleted', {})
  res.json({ ok: true })
}))

// ── VARIANTS: generate child items from a template's attributes (ERPNext) ──
r.post('/:id/variants', authRequired, authorize('warehouse', 'create'), asyncWrap(async (req, res) => {
  const { data: tpl } = await supabase.from('items').select('*').eq('id', req.params.id).single()
  if (!tpl || !tpl.has_variants) return res.status(422).json({ error: 'Not a template item' })
  const combos = req.body.combinations || [] // [{ attributes:[{attribute,attribute_value}], suffix }]
  const created = []
  for (const combo of combos) {
    const suffix = combo.suffix || (combo.attributes || []).map((a) => a.attribute_value).join('-')
    const code = `${tpl.item_code}-${suffix}`
    const { id, created_at, updated_at, has_variants, ...base } = tpl
    const { data: v, error } = await supabase.from('items').insert({
      ...base, item_code: code, code, name: `${tpl.item_name} ${suffix}`, item_name: `${tpl.item_name} ${suffix}`,
      has_variants: false, variant_of: tpl.id,
    }).select().single()
    if (error) continue
    if ((combo.attributes || []).length) await supabase.from('item_variant_attributes').insert(combo.attributes.map((a) => ({ item_id: v.id, attribute: a.attribute, attribute_value: a.attribute_value })))
    created.push(v.item_code)
  }
  res.json({ ok: true, created })
}))

// ── ITEM PRICE management ──
r.post('/:id/prices', authRequired, authorize('warehouse', 'create'), asyncWrap(async (req, res) => {
  const { data: item } = await supabase.from('items').select('item_code').eq('id', req.params.id).single()
  const { data, error } = await supabase.from('item_prices').insert({ ...req.body, item_id: req.params.id, item_code: item?.item_code }).select().single()
  if (error) throw error
  res.status(201).json(data)
}))
r.delete('/prices/:priceId', authRequired, authorize('warehouse', 'update'), asyncWrap(async (req, res) => {
  await supabase.from('item_prices').delete().eq('id', req.params.priceId); res.json({ ok: true })
}))

// ── BULK IMPORT (CSV/Excel) — row-level validation, same naming/pricing/dup rules ──
const bool = (v, def) => (v == null || v === '' ? def : ['true', '1', 'yes', 'y'].includes(String(v).toLowerCase()))
async function importItemRow(p, user) {
  const brand = (p.brand || '').trim(), model = (p.model || '').trim()
  if ((!brand || !model) && !(p.item_name || '').trim()) throw new Error('Brand + Model (or Item Name) required')
  if (brand && model) {
    const { data: dup } = await supabase.from('items').select('id').ilike('brand', brand).ilike('model', model).limit(1).maybeSingle()
    if (dup) throw new Error(`Duplicate — ${brand} ${model} already exists`)
  }
  const auto = await resolveItemAuto({ brand, model, product_family: p.product_family, item_name: p.item_name })
  const name = (p.item_name || auto.name || '').trim()
  if (!name) throw new Error('Could not resolve Item Name')
  const item_code = (p.item_code || '').trim() || num()
  const pricing = auto.supplier_price != null
    ? { supplier_price: auto.supplier_price, landed_cost: auto.landed_cost, cost: auto.landed_cost, selling_price: auto.selling_price, standard_rate: auto.selling_price, gp_percent: auto.gp_percent }
    : {}
  if (auto.supplier_price == null) { // manual price columns (only when no price-list match)
    if (p.cost != null && p.cost !== '') pricing.cost = Number(p.cost)
    const sp = p.selling_price ?? p.standard_rate
    if (sp != null && sp !== '') pricing.standard_rate = Number(sp)
  }
  const row = {
    item_code, code: item_code, name, item_name: name,
    brand: brand || null, model: model || null, product_family: (p.product_family || '').trim() || null,
    category: (p.category || '').trim() || null, sub_category: (p.sub_category || '').trim() || null,
    datasheet_url: (p.datasheet_url || '').trim() || null, image_url: (p.image_url || '').trim() || null,
    stock_uom: (p.stock_uom || '').trim() || 'Nos', description: (p.description || '').trim() || null,
    is_stock_item: bool(p.is_stock_item, true), is_sales_item: bool(p.is_sales_item, true), is_purchase_item: bool(p.is_purchase_item, true),
    ...pricing,
  }
  const { data: item, error } = await supabase.from('items').insert(row).select().single()
  if (error) throw new Error(error.code === '23505' ? `Duplicate item code ${item_code}` : error.message)
  if (row.cost != null || row.standard_rate != null) {
    await supabase.from('item_pricing_history').insert({ item_id: item.id, brand, model, cost: row.cost ?? null, selling_price: row.standard_rate ?? null, source: auto.supplier_price != null ? 'price-list' : 'manual', created_by: user.id })
  }
  return item
}
r.post('/import', authRequired, authorize('warehouse', 'create'), asyncWrap(async (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : []
  if (!rows.length) return res.status(422).json({ error: 'No rows to import' })
  if (rows.length > 5000) return res.status(422).json({ error: 'Max 5000 rows per import' })
  let created = 0
  const errors = []
  for (let i = 0; i < rows.length; i++) {
    try { await importItemRow(rows[i], req.user); created++ }
    catch (e) { errors.push({ row: i + 2, item: `${rows[i].brand || ''} ${rows[i].model || ''}`.trim() || rows[i].item_name || '', error: e.message }) }
  }
  await logAudit(req.user, 'item', null, 'imported', { created, failed: errors.length }).catch(() => {})
  res.json({ total: rows.length, created, failed: errors.length, errors })
}))

function stripChildren(p) {
  const { barcodes, uoms, reorders, suppliers, customer_details, taxes, item_defaults, attributes, manufacturers, alternatives, prices, id, created_at, updated_at, ...cols } = p
  return cols
}

export default r
