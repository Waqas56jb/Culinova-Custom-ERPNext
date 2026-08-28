import { supabase } from '../config/supabase.js'
import { priceItemLive } from './priceEngine.js'
import { importEosEntry } from './eos.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const n0 = (v) => Number(v) || 0

async function findByEosEntry(eosId) {
  if (!eosId) return null
  const { data } = await supabase.from('items').select('*').eq('eos_entry_id', eosId).maybeSingle()
  return data
}

async function findById(id) {
  if (!id || !UUID.test(String(id))) return null
  const { data } = await supabase.from('items').select('*').eq('id', id).maybeSingle()
  return data
}

async function findByCode(code) {
  const c = (code || '').trim()
  if (!c) return null
  const { data } = await supabase.from('items').select('*').eq('item_code', c).maybeSingle()
  return data
}

async function findByBrandModel(brand, model) {
  const b = (brand || '').trim()
  const m = (model || '').trim()
  if (!b || !m) return null
  const { data } = await supabase.from('items').select('*').ilike('brand', b).ilike('model', m).limit(1).maybeSingle()
  return data
}

async function findByName(name) {
  const n = (name || '').trim()
  if (!n) return null
  let { data } = await supabase.from('items').select('*').ilike('item_name', n).limit(1).maybeSingle()
  if (data) return data
  ;({ data } = await supabase.from('items').select('*').ilike('name', n).limit(1).maybeSingle())
  return data
}

/** Resolve one BOQ line to an Item Master row — eos_entry_id first, then ERP keys. */
export async function resolveApprovedItem(raw = {}, { user = null, tryImport = true } = {}) {
  const eosId = raw.eos_entry_id || null
  let item = null
  let match = 'name'

  if (eosId) {
    item = await findByEosEntry(eosId)
    if (item) match = 'eos_entry_id'
  }

  if (!item && raw.item_id && raw.item_id !== eosId) {
    item = await findById(raw.item_id)
    if (item) match = 'item_id'
  }

  if (!item) {
    item = await findByCode(raw.item_code)
    if (item) match = 'item_code'
  }

  if (!item) {
    item = await findByBrandModel(raw.brand, raw.model)
    if (item) match = 'brand_model'
  }

  if (!item) {
    item = await findByName(raw.item_name || raw.name || raw.title)
    if (item) match = 'name'
  }

  if (!item && eosId && tryImport) {
    try {
      const r = await importEosEntry(eosId, user)
      if (r?.item) {
        item = r.item
        match = r.mode === 'created' ? 'eos_entry_id_import' : 'eos_entry_id'
      }
    } catch { /* keep unresolved */ }
  }

  if (!item) return null
  return { item, match }
}

async function rateForItem(item) {
  let selling = n0(item.selling_price) || n0(item.selling_rate) || n0(item.standard_rate)
  let landed = item.landed_cost != null ? n0(item.landed_cost) : n0(item.cost)
  if (!selling) {
    try {
      const chain = await priceItemLive(item)
      if (chain?.priced) {
        selling = n0(chain.selling) || n0(chain.selling_price) || selling
        landed = chain.expected_landed != null ? n0(chain.expected_landed) : (chain.landed_cost != null ? n0(chain.landed_cost) : landed)
      }
    } catch { /* not priceable */ }
  }
  return { selling, landed }
}

/**
 * Turn EOS/ERP approved_items JSON into quotation-builder lines.
 * Returns { lines, unresolved } — unresolved entries have no Item Master match.
 */
export async function resolveApprovedItems(approvedItems = [], opts = {}) {
  const lines = []
  const unresolved = []
  const list = Array.isArray(approvedItems) ? approvedItems : []

  for (let i = 0; i < list.length; i++) {
    const raw = list[i] || {}
    const qty = Math.max(0.001, n0(raw.qty) || n0(raw.quantity) || 1)
    const resolved = await resolveApprovedItem(raw, opts)
    if (!resolved) {
      unresolved.push({ index: i, input: raw, reason: 'No matching Item Master row' })
      continue
    }
    const { item, match } = resolved
    const { selling, landed } = await rateForItem(item)
    lines.push({
      item_id: item.id,
      item_code: item.item_code || item.code || raw.item_code || null,
      item_name: item.item_name || item.name,
      brand: item.brand,
      model: item.model,
      uom: item.uom || item.stock_uom || item.sales_uom || 'Nos',
      description: item.description,
      specifications: item.specifications,
      image_url: item.image_url,
      datasheet_url: item.datasheet_url,
      qty,
      rate: selling,
      cost: landed,
      discount_pct: n0(raw.discount_pct),
      pos: raw.pos || raw.area || null,
      _match: match,
    })
  }
  return { lines, unresolved }
}
