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
  const { data, error } = await supabase.from('brands').insert({ brand: req.body.brand, description: req.body.description || null }).select().single()
  if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: error.message })
  res.status(201).json(data)
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
