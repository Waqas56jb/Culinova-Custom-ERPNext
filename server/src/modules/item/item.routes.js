import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'
import { canAccessPanel, isManagement } from '../../rbac/permissions.js'
import { logAudit } from '../../core/audit.js'

const r = Router()

// ── helpers ──────────────────────────────────────────────────────────────
const CHILD = {
  barcodes: 'item_barcodes', uoms: 'item_uoms', reorders: 'item_reorders',
  suppliers: 'item_suppliers', customer_details: 'item_customer_details', taxes: 'item_taxes',
  item_defaults: 'item_defaults', attributes: 'item_variant_attributes',
  manufacturers: 'item_manufacturers', alternatives: 'item_alternatives',
}
// cost is confidential — visible only to Management / Warehouse / Procurement (SEC-004)
const canSeeCost = (u) => isManagement(u.role) || canAccessPanel(u.role, 'warehouse') || canAccessPanel(u.role, 'procurement')
const COST_FIELDS = ['cost', 'valuation_rate', 'last_purchase_rate']
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

// ── CREATE (Item Manager / Warehouse) — naming, default UOM, auto Item Price ──
r.post('/', authRequired, authorize('warehouse', 'create'), asyncWrap(async (req, res) => {
  const p = req.body
  const item_code = (p.item_code || p.code || '').trim() || num()
  if (!p.item_name && !p.name) return res.status(422).json({ error: 'Item name is required' })
  if (!p.item_group) return res.status(422).json({ error: 'Item Group is required' })
  // barcode uniqueness (global)
  for (const b of p.barcodes || []) {
    if (!b.barcode) continue
    const { data: dup } = await supabase.from('item_barcodes').select('id').eq('barcode', b.barcode).limit(1).maybeSingle()
    if (dup) return res.status(409).json({ error: `Barcode ${b.barcode} already used by another item` })
  }
  const { ...cols } = stripChildren(p)
  const row = { ...cols, item_code, code: item_code, name: p.item_name || p.name, item_name: p.item_name || p.name }
  const { data: item, error } = await supabase.from('items').insert(row).select().single()
  if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: error.message })

  // ensure stock UOM present in conversion table (factor 1)
  const uoms = Array.isArray(p.uoms) ? [...p.uoms] : []
  const su = p.stock_uom || p.uom
  if (su && !uoms.some((u) => (u.uom || '').toLowerCase() === su.toLowerCase())) uoms.push({ uom: su, conversion_factor: 1 })
  await replaceChildren(item.id, { ...p, uoms })

  // auto Item Price (ERPNext after_insert) when a selling rate is given
  if (Number(p.standard_rate) > 0 && (p.is_sales_item ?? true)) {
    await supabase.from('item_prices').insert({ item_id: item.id, item_code, uom: su, price_list: 'Standard Selling', selling: true, price_list_rate: Number(p.standard_rate), currency: 'SAR' })
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

function stripChildren(p) {
  const { barcodes, uoms, reorders, suppliers, customer_details, taxes, item_defaults, attributes, manufacturers, alternatives, prices, id, created_at, updated_at, ...cols } = p
  return cols
}

export default r
