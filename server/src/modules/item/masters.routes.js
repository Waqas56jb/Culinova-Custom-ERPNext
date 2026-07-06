import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'

const r = Router()

// ── ITEM GROUPS (hierarchical tree) ──
r.get('/item-groups', authRequired, asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('item_groups').select('*').order('item_group_name')
  if (error) throw error
  res.json(data || [])
}))
r.post('/item-groups', authRequired, authorize('warehouse', 'create'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('item_groups').insert({ item_group_name: req.body.item_group_name, parent_item_group: req.body.parent_item_group || null, is_group: !!req.body.is_group }).select().single()
  if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: error.message })
  res.status(201).json(data)
}))
r.patch('/item-groups/:id', authRequired, authorize('warehouse', 'update'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('item_groups').update(req.body).eq('id', req.params.id).select().single()
  if (error) throw error; res.json(data)
}))
r.delete('/item-groups/:id', authRequired, authorize('warehouse', 'delete'), asyncWrap(async (req, res) => {
  await supabase.from('item_groups').delete().eq('id', req.params.id); res.json({ ok: true })
}))

// ── BRANDS ──
r.get('/brands', authRequired, asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('brands').select('*').order('brand')
  if (error) throw error; res.json(data || [])
}))
r.post('/brands', authRequired, authorize('warehouse', 'create'), asyncWrap(async (req, res) => {
  const b = req.body
  const { data, error } = await supabase.from('brands').insert({ brand: b.brand, description: b.description || null, currency: b.currency || 'SAR', exchange_factor: Number(b.exchange_factor) || 1, price_factor: Number(b.price_factor) || 1, country_of_origin: b.country_of_origin || null, country_of_purchase: b.country_of_purchase || null }).select().single()
  if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: error.message })
  res.status(201).json(data)
}))
r.patch('/brands/:id', authRequired, authorize('warehouse', 'update'), asyncWrap(async (req, res) => {
  const patch = {}
  for (const f of ['description', 'currency', 'exchange_factor', 'price_factor', 'country_of_origin', 'country_of_purchase']) if (req.body[f] != null) patch[f] = req.body[f]
  const { data, error } = await supabase.from('brands').update(patch).eq('id', req.params.id).select().single()
  if (error) throw error; res.json(data)
}))
r.delete('/brands/:id', authRequired, authorize('warehouse', 'delete'), asyncWrap(async (req, res) => {
  await supabase.from('brands').delete().eq('id', req.params.id); res.json({ ok: true })
}))

// ── (2) PRODUCT FAMILIES ──
r.get('/product-families', authRequired, asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('product_families').select('*').order('name')
  if (error) throw error; res.json(data || [])
}))
r.post('/product-families', authRequired, authorize('warehouse', 'create'), asyncWrap(async (req, res) => {
  const b = req.body
  const { data, error } = await supabase.from('product_families').insert({ name: b.name, category: b.category || null, sub_category: b.sub_category || null, datasheet_url: b.datasheet_url || null, image_url: b.image_url || null, specs: b.specs || null }).select().single()
  if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: error.message })
  res.status(201).json(data)
}))
r.patch('/product-families/:id', authRequired, authorize('warehouse', 'update'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('product_families').update(req.body).eq('id', req.params.id).select().single()
  if (error) throw error; res.json(data)
}))
r.delete('/product-families/:id', authRequired, authorize('warehouse', 'delete'), asyncWrap(async (req, res) => {
  await supabase.from('product_families').delete().eq('id', req.params.id); res.json({ ok: true })
}))

// ── (5) SUPPLIER PRICE LISTS (separate from Item Master, Excel import) ──
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
  // bulk import rows: [{ model, supplier_price }]  (brand defaults to the list brand)
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
r.post('/item-attributes', authRequired, authorize('warehouse', 'create'), asyncWrap(async (req, res) => {
  const { data: a, error } = await supabase.from('item_attributes').insert({ attribute_name: req.body.attribute_name, numeric_values: !!req.body.numeric_values, from_range: req.body.from_range, increment: req.body.increment, to_range: req.body.to_range }).select().single()
  if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: error.message })
  const vals = (req.body.values || []).filter((v) => v && (v.attribute_value || v))
  if (vals.length) await supabase.from('item_attribute_values').insert(vals.map((v) => ({ attribute_id: a.id, attribute_value: v.attribute_value || v, abbr: v.abbr || null })))
  res.status(201).json(a)
}))

export default r
