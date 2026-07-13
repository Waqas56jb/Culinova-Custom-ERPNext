import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize, internalOnly } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'
import { canAccessPanel, isManagement } from '../../rbac/permissions.js'
import { logAudit } from '../../core/audit.js'
import { resolveItemAuto, getBrand, supplierPriceFor } from '../../core/itempricing.js'
import { priceItem, persistable } from '../../core/pricing.js'
import { stripEosOwned, recordVersion } from '../../core/eosfields.js'
import { eosOnlyItemCreation, eosOnlyItemDeletion, itemsComeFromEosOnly, stripErpOwned, EOS_ONLY_EDIT_MESSAGE } from '../../core/policy.js'

// Resolve an item's pricing inputs (brand factors + price-list supplier price are the fallbacks the
// CEO's chain relies on), then run THE pricing chain (core/pricing.js) over the merged item.
// Returns the columns to persist, or {} when the item still has no cost to price from.
async function repriceItem(merged) {
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
  // item-master pricing is the LIST price — discounts are applied later at quotation time, not baked
  // into the item's stored selling price
  const chain = await priceItem(resolved, { applyDiscount: false })
  if (!chain.priced) return {}
  const cols = persistable(chain)
  cols.standard_rate = chain.selling_price // the rest of the app reads standard_rate as the sell rate
  return cols
}

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
const COST_FIELDS = ['cost', 'supplier_price', 'landed_cost', 'gp_percent', 'valuation_rate', 'last_purchase_rate', 'avg_cost', 'price_factor', 'exchange_factor', 'add_margin_pct', 'special_offer_pct', 'calculated_sale_price']
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
// form fields arrive as '' for blanks — Postgres rejects '' for numeric/date columns, so null them out
const nullEmpty = (o) => { for (const k of Object.keys(o)) if (o[k] === '') o[k] = null; return o }

// ── LIST (every INTERNAL role can read & select; cost redacted by role; Customers blocked) ──
r.get('/', authRequired, internalOnly, asyncWrap(async (req, res) => {
  let q = supabase.from('items').select('*').order('created_at', { ascending: false })
  if (req.query.active === '1') q = q.eq('disabled', false)          // IM-009 hide disabled
  if (req.query.sales === '1') q = q.eq('is_sales_item', true).eq('has_variants', false)
  const { data, error } = await q
  if (error) throw error
  res.json((data || []).map((i) => redact(req.user, i)))
}))

// ── GET ONE (full item + all child tables) ──
r.get('/:id', authRequired, internalOnly, asyncWrap(async (req, res) => {
  const { data: item, error } = await supabase.from('items').select('*').eq('id', req.params.id).single()
  if (error) return res.status(404).json({ error: 'Item not found' })
  const children = await loadChildren(item.id)
  // (#10) child tables also carry cost — hide buying prices, supplier rates and item-default accounts from non-cost roles
  if (!canSeeCost(req.user)) {
    children.prices = (children.prices || []).filter((p) => p.selling !== false && !p.buying)
    children.suppliers = []
    children.item_defaults = []
  }
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
r.post('/', authRequired, authorize('warehouse', 'create'), eosOnlyItemCreation, asyncWrap(async (req, res) => {
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
  // run the FULL landed-cost chain (core/pricing.js) — covers supplier price, brand factors, and any
  // freight/insurance/customs the user entered. When no supplier price is resolvable, keep manual values.
  const pricing = await repriceItem({ ...p, item_name: name })
  const row = nullEmpty({ ...cols, ...pricing, item_code, code: item_code, name, item_name: name })
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

  // THE ITEM MASTER IS READ-ONLY IN THE ERP.
  // EOS owns item data — create, edit, approve, reject and delete all happen there, and the change
  // syncs here. The ONLY thing the ERP still owns is what EOS does not carry: pricing and stock policy
  // (set via the Pricing Engine). Anything else is refused with a message that says where to go.
  if (await itemsComeFromEosOnly()) {
    const { patch: erpSafe, blocked: notOurs } = stripErpOwned(p)
    if (notOurs.length) {
      return res.status(403).json({
        error: `${EOS_ONLY_EDIT_MESSAGE} Rejected: ${notOurs.join(', ')}.`,
        blocked: notOurs, source: 'EOS',
      })
    }
    for (const k of Object.keys(p)) if (!(k in erpSafe)) delete p[k]
  }

  // (belt and braces — also true when the policy is switched back to 'erp': an EOS-linked item's
  // engineering fields can still never be hand-edited, or the next sync would silently undo it)
  const { patch: allowed, blocked } = stripEosOwned(p, cur)
  if (blocked.length) return res.status(409).json({ error: `These fields come from EOS and are read-only in the ERP: ${blocked.join(', ')}. Edit them in EOS, then Sync.`, blocked })
  req.body = allowed // downstream reads from p, so also narrow the local reference
  Object.keys(p).forEach((k) => { if (!(k in allowed)) delete p[k] })
  const locked = await hasStock(cur.id)
  if (locked) {
    const guard = ['is_stock_item', 'has_serial_no', 'has_batch_no', 'stock_uom']
    for (const f of guard) if (p[f] != null && p[f] !== cur[f]) return res.status(422).json({ error: `Cannot change ${f} — stock transactions already exist for this item.` })
    if (p.valuation_method && p.valuation_method !== cur.valuation_method && p.valuation_method !== 'Moving Average')
      return res.status(422).json({ error: 'Valuation method can only be switched to Moving Average once stock exists.' })
  }
  const cols = stripChildren(p)
  if (p.item_name || p.name) { cols.name = p.item_name || p.name; cols.item_name = p.item_name || p.name }
  // (#pricing) recompute the whole pricing chain whenever any pricing input changes — otherwise
  // editing supplier price / a factor leaves landed/selling/GP stale. Uses current values for
  // whatever the edit didn't touch. The full landed-cost chain lives in core/pricing.js.
  const PRICE_INPUTS = ['supplier_price', 'exchange_factor', 'price_factor', 'add_margin_pct', 'special_offer_pct', 'brand', 'model', 'currency', 'factory_cost', 'freight_cost', 'insurance_cost', 'customs_duty', 'local_transport', 'other_landed_cost', 'markup_factor', 'landed_template_id']
  if (PRICE_INPUTS.some((f) => p[f] !== undefined)) {
    const priced = await repriceItem({ ...cur, ...cols })
    Object.assign(cols, priced)
  }
  const { data: item, error } = await supabase.from('items').update(nullEmpty(cols)).eq('id', cur.id).select().single()
  if (error) throw error
  await replaceChildren(cur.id, p)
  // (7) keep pricing history when a recompute changed cost/selling
  if (cols.cost != null && (cols.cost !== cur.cost || cols.standard_rate !== cur.standard_rate)) {
    await supabase.from('item_pricing_history').insert({ item_id: item.id, brand: item.brand || null, model: item.model || null, cost: cols.cost ?? null, selling_price: cols.standard_rate ?? null, source: 'edit', created_by: req.user.id })
  }
  // propagate name/brand to Item Price (ERPNext on_update)
  await supabase.from('item_prices').update({ item_code: item.item_code }).eq('item_id', item.id)
  // keep the auto "Standard Selling" price row in sync when the selling rate changed
  if (item.standard_rate != null && item.standard_rate !== cur.standard_rate) {
    await supabase.from('item_prices').update({ price_list_rate: Number(item.standard_rate) }).eq('item_id', item.id).eq('price_list', 'Standard Selling').eq('selling', true)
  }
  await logAudit(req.user, 'item', item.id, 'updated', {})
  // keep a version snapshot of the PRE-edit state so every change is auditable/reversible (not just EOS syncs)
  try { await recordVersion(cur.id, { source: 'erp-edit', changed_by: req.user.id, change_note: 'Manual edit', snapshot: cur }) } catch { /* versioning is best-effort */ }
  res.json({ ...item, ...(await loadChildren(item.id)) })
}))

// Deleting an item is an EOS decision (reject / remove it there and the ERP follows). Guarded by the
// same DB policy, so nobody in the ERP — not even Management — can delete from the Item Master.
r.delete('/:id', authRequired, authorize('warehouse', 'delete'), eosOnlyItemDeletion, asyncWrap(async (req, res) => {
  if (await hasStock(req.params.id)) return res.status(422).json({ error: 'Cannot delete — stock exists. Disable the item instead.' })
  const { error } = await supabase.from('items').delete().eq('id', req.params.id) // children cascade
  if (error) throw error
  await logAudit(req.user, 'item', req.params.id, 'deleted', {})
  res.json({ ok: true })
}))

// ── VARIANTS: generate child items from a template's attributes (ERPNext) ──
r.post('/:id/variants', authRequired, authorize('warehouse', 'create'), eosOnlyItemCreation, asyncWrap(async (req, res) => {
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

// ── BULK IMPORT (CSV/Excel) — accepts our simple template OR a full ERPNext export ──
const bool = (v, def) => (v == null || v === '' ? def : ['1', 'true', 'yes', 'y', 'checked', 'active', 'able'].includes(String(v).trim().toLowerCase()))
const numOrNull = (v) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v))

// Map many header styles (CEO ideal sheet + ERPNext export + our template) → internal fields.
const HEADER_MAP = {
  'item code': 'item_code', item_code: 'item_code',
  'item name': 'item_name', 'model name': 'item_name', item_name: 'item_name',
  'item group': 'category', category: 'category',
  'sub item group': 'sub_category', 'sub category': 'sub_category', sub_category: 'sub_category',
  'product family': 'product_family', product_family: 'product_family',
  brand: 'brand', model: 'model', 'model no.': 'model', 'model no': 'model',
  'supplier net price': 'supplier_price', 'supplier price': 'supplier_price', supplier_price: 'supplier_price',
  'default unit of measure': 'stock_uom', 'stock uom': 'stock_uom', stock_uom: 'stock_uom', uom: 'stock_uom',
  description: 'description', dimensions: 'dimensions',
  image: 'image_url', image_url: 'image_url',
  'specs sheet': 'datasheet_url', attachment: 'datasheet_url', datasheet_url: 'datasheet_url', 'datasheet url': 'datasheet_url',
  'standard selling rate': 'standard_rate', 'selling price': 'selling_price', selling_price: 'selling_price',
  'calculated sale price': 'calculated_sale_price',
  'valuation rate': 'valuation_rate', 'landed cost': 'landed_cost', cost: 'cost', 'avg cost': 'avg_cost',
  'last purchase': 'last_purchase_rate', 'last purchase rate': 'last_purchase_rate', 'opening stock': 'opening_stock',
  'price factor': 'price_factor', 'exchange factor': 'exchange_factor',
  'add margin %': 'add_margin_pct', 'add margin': 'add_margin_pct', 'special offer %': 'special_offer_pct', 'special offer': 'special_offer_pct',
  currency: 'currency', 'country of origin': 'country_of_origin',
  'power type': 'power_type', 'product type': 'product_type',
  'show room': 'show_room', 'local purchasing': 'local_purchasing', 'alternatives note': 'alternatives_note',
  'sn control': 'sn_control',
  disabled: 'disabled', status: 'status_text', 'stock item': 'is_stock_item', 'maintain stock': 'is_stock_item',
  'allow purchase': 'is_purchase_item', 'allow sales': 'is_sales_item',
  'max discount (%)': 'max_discount', 'max discount': 'max_discount',
  'warranty period (in days)': 'warranty_period',
  'company (item defaults)': 'def_company',
  'default income account (item defaults)': 'def_income',
  'default expense account (item defaults)': 'def_expense',
  'default warehouse (item defaults)': 'def_warehouse',
  'default selling cost center (item defaults)': 'def_sell_cc',
}
function normalizeRow(raw) {
  const o = {}
  for (const [k, v] of Object.entries(raw)) {
    const key = HEADER_MAP[String(k).trim().toLowerCase()]
    if (key && (o[key] === undefined || o[key] === '')) o[key] = typeof v === 'string' ? v.trim() : v
  }
  if (o.cost == null || o.cost === '') o.cost = o.landed_cost ?? o.valuation_rate           // cost ← landed cost / valuation
  if (o.selling_price == null || o.selling_price === '') o.selling_price = o.standard_rate    // selling ← standard selling rate
  return o
}

async function importItemRow(raw, user) {
  const p = normalizeRow(raw)
  const brand = (p.brand || '').trim(), model = (p.model || '').trim()
  const givenName = (p.item_name || '').trim()
  if (!givenName && (!brand || !model)) throw new Error('Item / Model Name (or Brand + Model) required')
  if (brand && model) {
    const { data: dup } = await supabase.from('items').select('id').ilike('brand', brand).ilike('model', model).limit(1).maybeSingle()
    if (dup) throw new Error(`Duplicate — ${brand} ${model} already exists`)
  }
  const auto = await resolveItemAuto({
    brand, model, product_family: p.product_family, item_name: givenName, supplier_price: p.supplier_price,
    exchange_factor: numOrNull(p.exchange_factor), price_factor: numOrNull(p.price_factor),
    add_margin_pct: numOrNull(p.add_margin_pct), special_offer_pct: numOrNull(p.special_offer_pct),
  })
  const name = (givenName || auto.name || '').trim()
  if (!name) throw new Error('Could not resolve Item Name')
  const item_code = (p.item_code || '').trim() || num()

  // supplier net price known → full computed pricing chain; else take the file values
  const pricing = auto.supplier_price != null
    ? { supplier_price: auto.supplier_price, landed_cost: auto.landed_cost, cost: auto.landed_cost, calculated_sale_price: auto.calculated_sale_price, selling_price: auto.selling_price, standard_rate: auto.selling_price, gp_percent: auto.gp_percent }
    : { cost: numOrNull(p.cost), landed_cost: numOrNull(p.landed_cost ?? p.cost), valuation_rate: numOrNull(p.valuation_rate), calculated_sale_price: numOrNull(p.calculated_sale_price), standard_rate: numOrNull(p.selling_price), selling_price: numOrNull(p.selling_price) }

  const disabledVal = (p.status_text != null && p.status_text !== '') ? /disable|inactive|^no$|^0$/i.test(String(p.status_text).trim()) : bool(p.disabled, false)

  const row = {
    item_code, code: item_code, name, item_name: name,
    brand: brand || null, model: model || null, product_family: (p.product_family || '').trim() || null,
    category: (p.category || '').trim() || null, sub_category: (p.sub_category || '').trim() || null,
    item_group: (p.category || '').trim() || null,
    datasheet_url: (p.datasheet_url || '').trim() || null, image_url: (p.image_url || '').trim() || null,
    stock_uom: (p.stock_uom || '').trim() || 'Nos', description: (p.description || '').trim() || null,
    dimensions: (p.dimensions != null ? String(p.dimensions).trim() : '') || null,
    power_type: (p.power_type || '').trim() || null, product_type: (p.product_type || '').trim() || 'Item',
    currency: (p.currency || '').trim() || null,
    add_margin_pct: numOrNull(p.add_margin_pct) || 0, special_offer_pct: numOrNull(p.special_offer_pct) || 0, avg_cost: numOrNull(p.avg_cost) || 0,
    price_factor: numOrNull(p.price_factor), exchange_factor: numOrNull(p.exchange_factor),
    show_room: bool(p.show_room, false), local_purchasing: bool(p.local_purchasing, false),
    alternatives_note: (p.alternatives_note || '').trim() || null, has_serial_no: bool(p.sn_control, false),
    opening_stock: numOrNull(p.opening_stock) || 0,
    warranty_period: p.warranty_period != null && p.warranty_period !== '' ? String(p.warranty_period) : null,
    country_of_origin: (p.country_of_origin || '').trim() || null,
    max_discount: numOrNull(p.max_discount) || 0, last_purchase_rate: numOrNull(p.last_purchase_rate) || 0,
    disabled: disabledVal,
    is_stock_item: bool(p.is_stock_item, true), is_sales_item: bool(p.is_sales_item, true), is_purchase_item: bool(p.is_purchase_item, true),
    ...pricing,
  }
  const { data: item, error } = await supabase.from('items').insert(row).select().single()
  if (error) throw new Error(error.code === '23505' ? `Duplicate item code ${item_code}` : error.message)

  // Product Family: create the master record on the fly so it shows in dropdowns + comparison
  if (row.product_family) {
    const { data: fam } = await supabase.from('product_families').select('id').ilike('name', row.product_family).limit(1).maybeSingle()
    if (!fam) await supabase.from('product_families').insert({ name: row.product_family, category: row.category || null, sub_category: row.sub_category || null })
  }

  // Item Defaults (company / accounts / warehouse) from the ERPNext columns
  if (p.def_company || p.def_warehouse || p.def_income) {
    await supabase.from('item_defaults').insert({ item_id: item.id, company: p.def_company || null, default_warehouse: p.def_warehouse || null, income_account: p.def_income || null, expense_account: p.def_expense || null, selling_cost_center: p.def_sell_cc || null })
  }
  if (row.cost != null || row.standard_rate != null) {
    await supabase.from('item_pricing_history').insert({ item_id: item.id, brand: brand || null, model: model || null, cost: row.cost ?? null, selling_price: row.standard_rate ?? null, source: auto.supplier_price != null ? 'price-list' : 'imported', created_by: user.id })
  }
  return item
}
r.post('/import', authRequired, authorize('warehouse', 'create'), eosOnlyItemCreation, asyncWrap(async (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : []
  if (!rows.length) return res.status(422).json({ error: 'No rows to import' })
  if (rows.length > 5000) return res.status(422).json({ error: 'Max 5000 rows per import' })
  let created = 0
  const errors = []
  for (let i = 0; i < rows.length; i++) {
    try { await importItemRow(rows[i], req.user); created++ }
    catch (e) { errors.push({ row: i + 2, item: (rows[i]['Item Name'] || rows[i].item_name || rows[i]['Item Code'] || rows[i].item_code || '').toString().trim(), error: e.message }) }
  }
  await logAudit(req.user, 'item', null, 'imported', { created, failed: errors.length }).catch(() => {})
  res.json({ total: rows.length, created, failed: errors.length, errors })
}))

function stripChildren(p) {
  const { barcodes, uoms, reorders, suppliers, customer_details, taxes, item_defaults, attributes, manufacturers, alternatives, prices, id, created_at, updated_at, ...cols } = p
  return cols
}

export default r
