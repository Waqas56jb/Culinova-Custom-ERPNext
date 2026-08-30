import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize, redactFinancials, internalOnly } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'
import { eosOnlyItemCreation, eosOnlyItemDeletion } from '../../core/policy.js'
import { logAudit } from '../../core/audit.js'
import { canSeeFinancials } from '../../rbac/permissions.js'

const r = Router()
r.use(authRequired, internalOnly)

const BRAND_EDITABLE = [
  'currency', 'exchange_factor', 'price_factor', 'add_margin_pct', 'special_offer_pct',
  'brand', 'description', 'country_of_origin', 'country_of_purchase',
  'preferred', // S4B1 — Brand Master star; must not be stripped
]
const FIN_AUDIT_FIELDS = new Set(['exchange_factor', 'price_factor', 'currency', 'add_margin_pct', 'special_offer_pct'])
const str = (v) => (v == null ? '' : String(v))

function masterDbError(error, label = 'Record') {
  if (error?.code === '23505') {
    if (label === 'Brand') return 'A brand with this name already exists.'
    if (label === 'UOM') return 'A unit with this name already exists.'
    if (label === 'Product family') return 'A product family with this name already exists.'
    if (label === 'Item group') return 'An item group with this name already exists.'
    return `${label} already exists.`
  }
  const m = String(error?.message || '')
  if (/duplicate key/i.test(m)) {
    if (/brands_brand/i.test(m)) return 'A brand with this name already exists.'
    return `${label} already exists.`
  }
  return m || 'Something went wrong. Please try again.'
}

async function countItemsForBrand(brandName) {
  if (!brandName) return 0
  const { count, error } = await supabase
    .from('items')
    .select('id', { count: 'exact', head: true })
    .ilike('brand', brandName)
  if (error) throw error
  return count || 0
}

async function writeBrandAudit({ brand_id, brand_name, field, old_value, new_value, user }) {
  await supabase.from('brand_audit_log').insert({
    brand_id: brand_id || null,
    brand_name: brand_name || null,
    field,
    old_value: old_value == null ? null : String(old_value),
    new_value: new_value == null ? null : String(new_value),
    changed_by: user?.name || 'system',
    changed_by_id: user?.id || null,
  })
}

function redactAuditRows(role, rows) {
  if (canSeeFinancials(role)) return rows
  return (rows || []).map((row) => (
    FIN_AUDIT_FIELDS.has(row.field)
      ? { ...row, old_value: null, new_value: null }
      : row
  ))
}

// ── ITEM GROUPS (hierarchical tree) ──
r.get('/item-groups', authRequired, asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('item_groups').select('*').order('item_group_name')
  if (error) throw error
  res.json(data || [])
}))
r.post('/item-groups', authRequired, authorize('warehouse', 'create'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('item_groups').insert({ item_group_name: req.body.item_group_name, parent_item_group: req.body.parent_item_group || null, is_group: !!req.body.is_group }).select().single()
  if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: masterDbError(error, 'Item group') })
  res.status(201).json(data)
}))
r.patch('/item-groups/:id', authRequired, authorize('warehouse', 'update'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('item_groups').update(req.body).eq('id', req.params.id).select().single()
  if (error) throw error; res.json(data)
}))
r.delete('/item-groups/:id', authRequired, authorize('warehouse', 'delete'), eosOnlyItemDeletion, asyncWrap(async (req, res) => {
  await supabase.from('item_groups').delete().eq('id', req.params.id); res.json({ ok: true })
}))

// ── BRANDS (commercial master — ERP-owned; items link by brand name text) ──
r.get('/brands', authRequired, asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('brands').select('*').order('brand')
  if (error) throw error
  res.json(redactFinancials(req.user.role, data || []))
}))

r.get('/brands/:id/audit', authRequired, authorize('warehouse', 'read'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('brand_audit_log')
    .select('*')
    .eq('brand_id', req.params.id)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  res.json(redactAuditRows(req.user.role, data || []))
}))

r.post('/brands', authRequired, authorize('warehouse', 'create'), asyncWrap(async (req, res) => {
  const b = req.body
  if (!b?.brand?.trim()) return res.status(422).json({ error: 'brand name required' })
  const exch = Number(b.exchange_factor) || 1
  const pf = Number(b.price_factor) || 1
  const factors_pending = exch === 1 && pf === 1
  const row = {
    brand: b.brand.trim(),
    description: b.description || null,
    currency: b.currency || 'SAR',
    exchange_factor: exch,
    price_factor: pf,
    add_margin_pct: Number(b.add_margin_pct) || 0,
    special_offer_pct: Number(b.special_offer_pct) || 0,
    country_of_origin: b.country_of_origin || null,
    country_of_purchase: b.country_of_purchase || null,
    factors_pending,
  }
  const { data, error } = await supabase.from('brands').insert(row).select().single()
  if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: masterDbError(error, 'Brand') })
  await writeBrandAudit({
    brand_id: data.id, brand_name: data.brand, field: '__created',
    old_value: null, new_value: data.brand, user: req.user,
  })
  await logAudit(req.user, 'brand', data.id, 'created', { brand: data.brand, factors_pending })
  res.status(201).json(data)
}))

r.patch('/brands/:id', authRequired, authorize('warehouse', 'update'), asyncWrap(async (req, res) => {
  const { data: before, error: fetchErr } = await supabase.from('brands').select('*').eq('id', req.params.id).maybeSingle()
  if (fetchErr) throw fetchErr
  if (!before) return res.status(404).json({ error: 'Brand not found' })

  const patch = {}
  for (const f of BRAND_EDITABLE) {
    if (f === 'preferred') {
      if (Object.prototype.hasOwnProperty.call(req.body, 'preferred')) patch.preferred = !!req.body.preferred
      continue
    }
    if (req.body[f] != null) patch[f] = req.body[f]
  }
  if (!Object.keys(patch).length) {
    return res.status(422).json({ error: 'Nothing to update.' })
  }

  if (patch.brand != null) {
    const nextName = String(patch.brand).trim()
    if (!nextName) return res.status(422).json({ error: 'brand name cannot be empty' })
    patch.brand = nextName
    if (nextName.toLowerCase() !== String(before.brand || '').toLowerCase()) {
      const inUse = await countItemsForBrand(before.brand)
      if (inUse > 0) {
        return res.status(409).json({ error: `Brand is in use by ${inUse} items`, item_count: inUse })
      }
    }
  }

  const exch = patch.exchange_factor != null ? Number(patch.exchange_factor) : Number(before.exchange_factor)
  const pf = patch.price_factor != null ? Number(patch.price_factor) : Number(before.price_factor)
  const cur = patch.currency != null ? patch.currency : before.currency
  const factorsSet = (exch !== 1 || pf !== 1 || (patch.currency != null && cur !== (before.currency || 'SAR')))
  if (factorsSet) patch.factors_pending = false

  const { data, error } = await supabase.from('brands').update(patch).eq('id', req.params.id).select().single()
  if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: masterDbError(error, 'Brand') })

  for (const f of BRAND_EDITABLE) {
    if (!(f in patch)) continue
    const oldV = before[f]
    const newV = data[f]
    if (str(oldV) === str(newV)) continue
    await writeBrandAudit({
      brand_id: data.id, brand_name: data.brand, field: f,
      old_value: oldV, new_value: newV, user: req.user,
    })
  }
  await logAudit(req.user, 'brand', data.id, 'updated', { fields: Object.keys(patch) })
  res.json(data)
}))

r.delete('/brands/:id', authRequired, authorize('warehouse', 'update'), asyncWrap(async (req, res) => {
  const { data: brand, error: fetchErr } = await supabase.from('brands').select('*').eq('id', req.params.id).maybeSingle()
  if (fetchErr) throw fetchErr
  if (!brand) return res.status(404).json({ error: 'Brand not found' })

  const inUse = await countItemsForBrand(brand.brand)
  if (inUse > 0) {
    return res.status(409).json({ error: `Brand is in use by ${inUse} items`, item_count: inUse })
  }

  await writeBrandAudit({
    brand_id: brand.id, brand_name: brand.brand, field: '__deleted',
    old_value: brand.brand, new_value: null, user: req.user,
  })
  await logAudit(req.user, 'brand', brand.id, 'deleted', { brand: brand.brand })
  await supabase.from('brands').delete().eq('id', req.params.id)
  res.json({ ok: true })
}))

// ── UNITS OF MEASURE (master) ──
r.get('/uoms', authRequired, asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('uoms').select('*').order('name')
  if (error) throw error; res.json(data || [])
}))
r.post('/uoms', authRequired, authorize('warehouse', 'create'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('uoms').insert({ name: req.body.name, symbol: req.body.symbol || null, is_active: req.body.is_active ?? true }).select().single()
  if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: masterDbError(error, 'UOM') })
  res.status(201).json(data)
}))
r.patch('/uoms/:id', authRequired, authorize('warehouse', 'update'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('uoms').update(req.body).eq('id', req.params.id).select().single()
  if (error) throw error; res.json(data)
}))
r.delete('/uoms/:id', authRequired, authorize('warehouse', 'delete'), eosOnlyItemDeletion, asyncWrap(async (req, res) => {
  await supabase.from('uoms').delete().eq('id', req.params.id); res.json({ ok: true })
}))

// ── PRODUCT FAMILIES ──
r.get('/product-families', authRequired, asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('product_families').select('*').order('name')
  if (error) throw error; res.json(data || [])
}))
r.post('/product-families', authRequired, authorize('warehouse', 'create'), asyncWrap(async (req, res) => {
  const b = req.body
  const { data, error } = await supabase.from('product_families').insert({ name: b.name, category: b.category || null, sub_category: b.sub_category || null, datasheet_url: b.datasheet_url || null, image_url: b.image_url || null, specs: b.specs || null }).select().single()
  if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: masterDbError(error, 'Product family') })
  res.status(201).json(data)
}))
r.patch('/product-families/:id', authRequired, authorize('warehouse', 'update'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('product_families').update(req.body).eq('id', req.params.id).select().single()
  if (error) throw error; res.json(data)
}))
r.delete('/product-families/:id', authRequired, authorize('warehouse', 'delete'), eosOnlyItemDeletion, asyncWrap(async (req, res) => {
  await supabase.from('product_families').delete().eq('id', req.params.id); res.json({ ok: true })
}))

// ── SUPPLIER PRICE LISTS ──
r.get('/price-lists', authRequired, authorize('warehouse', 'read'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('supplier_price_lists').select('*').order('created_at', { ascending: false })
  if (error) throw error
  const out = []
  for (const l of data || []) { const { count } = await supabase.from('price_list_items').select('id', { count: 'exact', head: true }).eq('list_id', l.id); out.push({ ...l, items: count || 0 }) }
  res.json(out)
}))
r.post('/price-lists', authRequired, authorize('warehouse', 'create'), asyncWrap(async (req, res) => {
  const b = req.body
  const { data: list, error } = await supabase.from('supplier_price_lists').insert({ name: b.name, brand: b.brand || null, currency: b.currency || null, year: b.year || null }).select().single()
  if (error) throw error
  const rows = (b.items || []).filter((r) => r.model).map((r) => ({ list_id: list.id, brand: r.brand || b.brand || null, model: r.model, supplier_price: Number(r.supplier_price) || 0 }))
  if (rows.length) await supabase.from('price_list_items').insert(rows)
  res.status(201).json({ ...list, imported: rows.length })
}))
r.get('/price-lists/:id/items', authRequired, authorize('warehouse', 'read'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('price_list_items').select('*').eq('list_id', req.params.id)
  if (error) throw error; res.json(data || [])
}))

// ── ITEM ATTRIBUTES (+ values) for variants ──
r.get('/item-attributes', authRequired, asyncWrap(async (req, res) => {
  const { data: attrs } = await supabase.from('item_attributes').select('*').order('attribute_name')
  const out = []
  for (const a of attrs || []) {
    const { data: vals } = await supabase.from('item_attribute_values').select('*').eq('attribute_id', a.id)
    out.push({ ...a, values: vals || [] })
  }
  res.json(out)
}))
r.post('/item-attributes', authRequired, authorize('warehouse', 'create'), eosOnlyItemCreation, asyncWrap(async (req, res) => {
  const { data: a, error } = await supabase.from('item_attributes').insert({ attribute_name: req.body.attribute_name, numeric_values: !!req.body.numeric_values, from_range: req.body.from_range, increment: req.body.increment, to_range: req.body.to_range }).select().single()
  if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: masterDbError(error, 'Attribute') })
  const vals = (req.body.values || []).filter((v) => v && (v.attribute_value || v))
  if (vals.length) await supabase.from('item_attribute_values').insert(vals.map((v) => ({ attribute_id: a.id, attribute_value: v.attribute_value || v, abbr: v.abbr || null })))
  res.status(201).json(a)
}))

export default r
