import { supabase } from '../config/supabase.js'

const round = (n) => Math.round((Number(n) || 0) * 100) / 100

export async function getBrand(name) {
  if (!name) return null
  const { data } = await supabase.from('brands').select('*').ilike('brand', name).limit(1).maybeSingle()
  return data || null
}

// (5) supplier price for brand+model from the latest imported price list
export async function supplierPriceFor(brand, model) {
  if (!brand || !model) return null
  const { data } = await supabase.from('price_list_items').select('supplier_price').ilike('brand', brand).ilike('model', model)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data ? Number(data.supplier_price) : null
}

// CEO pricing chain:
//   Supplier Net Price × Exchange Factor            = Landed Cost
//   Landed Cost × Price Factor                      = Calculated Sale Price
//   Calculated Sale Price × (1+AddMargin%) × (1-SpecialOffer%) = Selling Price
//   GP% is measured against the LANDED cost.
export function computePricing(supplierPrice, f = {}) {
  if (supplierPrice == null) return { supplier_price: null, landed_cost: null, calculated_sale_price: null, selling_price: null, gp_percent: null }
  const exch = Number(f.exchange_factor) || 1
  const pf = Number(f.price_factor) || 1
  const margin = Number(f.add_margin_pct) || 0
  const offer = Number(f.special_offer_pct) || 0
  const landed = supplierPrice * exch
  const calc = landed * pf
  const selling = calc * (1 + margin / 100) * (1 - offer / 100)
  const gp = selling > 0 ? ((selling - landed) / selling) * 100 : 0
  return { supplier_price: round(supplierPrice), landed_cost: round(landed), calculated_sale_price: round(calc), selling_price: round(selling), gp_percent: round(gp) }
}

// (3) Item Name = "Brand Model Family"
export const buildItemName = (brand, model, family) => [brand, model, family].filter(Boolean).join(' ').trim()

// Resolve all auto fields for an item from brand + model + family (used on create/update).
// Returns the pricing block + item_name; null pricing means "no supplier price → enter manually".
// treat blank / empty-string form inputs as "not provided" so the brand fallback (and Number coercion) works
const blank = (v) => (v === '' || v === undefined ? null : v)
export async function resolveItemAuto({ brand, model, product_family, item_name, supplier_price, exchange_factor, price_factor, add_margin_pct, special_offer_pct }) {
  const brandRec = await getBrand(brand)
  // supplier net price: explicit value wins, else the brand+model price list
  const supplierPrice = (supplier_price != null && supplier_price !== '') ? Number(supplier_price) : await supplierPriceFor(brand, model)
  const factors = {
    exchange_factor: blank(exchange_factor) ?? brandRec?.exchange_factor,   // per-item override, else brand
    price_factor: blank(price_factor) ?? brandRec?.price_factor,
    add_margin_pct: blank(add_margin_pct) ?? 0, special_offer_pct: blank(special_offer_pct) ?? 0,
  }
  const pricing = computePricing(supplierPrice, factors)
  const name = item_name || buildItemName(brand, model, product_family)
  return { name, brandRec, ...pricing }
}
