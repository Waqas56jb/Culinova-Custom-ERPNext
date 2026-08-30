// System policy — read from the DB (system_settings), never hardcoded, so the owner can change the
// rule from Company Settings without a code change.
import { supabase } from '../config/supabase.js'

const CACHE_MS = 30_000
let cache = { at: 0, map: {} }

export async function settings() {
  if (Date.now() - cache.at < CACHE_MS) return cache.map
  const { data } = await supabase.from('system_settings').select('key, value')
  const map = {}
  for (const r of data || []) map[r.key] = r.value
  cache = { at: Date.now(), map }
  return map
}
export function invalidatePolicy() { cache = { at: 0, map: {} } }

export async function setting(key, fallback = null) {
  const m = await settings()
  return m[key] ?? fallback
}

// CEO rule R2 — "A new item should not be created directly in the ERP. It must first be created,
// completed, reviewed, and approved in EOS. Only approved items should be synchronized automatically
// to the ERP Item Master. EOS will be the single source of truth for all item data."
export async function itemsComeFromEosOnly() {
  return (await setting('item_creation_source', 'eos')).toLowerCase() === 'eos'
}

/** S4B3 — Custom Fabrication may be created in ERP when setting is 'erp' (default). */
export async function fabricationCreationInErp() {
  return (await setting('fabrication_creation', 'erp')).toLowerCase() !== 'eos'
}

export const FABRICATION_CATEGORY = 'Custom Fabrication'

// The one message every blocked path returns, so the user is told WHERE to go instead.
export const EOS_ONLY_MESSAGE =
  'Items are created in CULINOVA EOS, not in the ERP. Create the item in EOS, complete it, have it reviewed and approved — it then syncs into the Item Master automatically. (Use “Import from EOS” to pull an approved item in immediately.)'

export const EOS_ONLY_EDIT_MESSAGE =
  'The Item Master is read-only in the ERP. Item data is owned by CULINOVA EOS — edit, approve, reject and delete are done by the EOS administrator, and the change syncs here. (Pricing is not item data: set it in the Pricing Engine.)'

export const EOS_ONLY_DELETE_MESSAGE =
  'Items cannot be deleted in the ERP. Remove or reject the item in CULINOVA EOS — the ERP follows EOS.'

// The ONLY fields the ERP still owns on an item. EOS carries no prices and no stock policy, so these
// stay editable (through the Pricing Engine / stock settings) — everything else belongs to EOS.
export const ERP_OWNED_ITEM_FIELDS = [
  // pricing chain
  'supplier_price', 'factory_cost', 'freight_cost', 'insurance_cost', 'customs_duty', 'local_transport',
  'other_landed_cost', 'landed_cost', 'landed_template_id', 'markup_factor', 'price_factor', 'exchange_factor',
  'add_margin_pct', 'special_offer_pct', 'currency', 'cost', 'avg_cost', 'valuation_rate', 'valuation_method',
  'selling_price', 'selling_rate', 'standard_rate', 'calculated_sale_price', 'gp_percent', 'net_profit',
  'np_percent', 'max_discount', 'last_purchase_rate',
  // stock policy
  'reorder_level', 'safety_stock', 'min_order_qty', 'lead_time_days', 'eta_days', 'opening_stock',
  'is_stock_item', 'is_sales_item', 'is_purchase_item', 'allow_negative_stock', 'disabled',
  // commercial sourcing
  'supplier', 'supplier_code', 'show_room', 'local_purchasing',
]

// Express guard for any route that would CREATE an ERP item.
export function eosOnlyItemCreation(req, res, next) {
  itemsComeFromEosOnly()
    .then((locked) => {
      if (!locked) return next()
      res.status(403).json({ error: EOS_ONLY_MESSAGE, policy: 'item_creation_source=eos', source: 'EOS' })
    })
    .catch(next)
}

// Express guard for any route that would DELETE an ERP item. Deleting is an EOS decision.
export function eosOnlyItemDeletion(req, res, next) {
  itemsComeFromEosOnly()
    .then((locked) => {
      if (!locked) return next()
      res.status(403).json({ error: EOS_ONLY_DELETE_MESSAGE, policy: 'item_creation_source=eos', source: 'EOS' })
    })
    .catch(next)
}

// Strip everything the ERP does not own from an item PATCH. Returns the safe patch plus the field
// names that were rejected, so the API can tell the user exactly WHY nothing changed.
export function stripErpOwned(patch = {}) {
  const safe = {}, blocked = []
  for (const [k, v] of Object.entries(patch || {})) {
    if (ERP_OWNED_ITEM_FIELDS.includes(k)) safe[k] = v
    else blocked.push(k)
  }
  return { patch: safe, blocked }
}
