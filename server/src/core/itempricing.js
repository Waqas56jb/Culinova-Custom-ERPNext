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

// (6) Pricing logic: Supplier Price → ×Exchange → Landed Cost → ×Price Factor → Selling → GP%
//     GP measured against LANDED cost (not supplier price).
export function computePricing(supplierPrice, brand) {
  if (supplierPrice == null) return { supplier_price: null, landed_cost: null, selling_price: null, gp_percent: null }
  const exch = Number(brand?.exchange_factor) || 1
  const pf = Number(brand?.price_factor) || 1
  const landed = supplierPrice * exch
  const selling = landed * pf
  const gp = selling > 0 ? ((selling - landed) / selling) * 100 : 0
  return { supplier_price: round(supplierPrice), landed_cost: round(landed), selling_price: round(selling), gp_percent: round(gp) }
}

// (3) Item Name = "Brand Model Family"
export const buildItemName = (brand, model, family) => [brand, model, family].filter(Boolean).join(' ').trim()

// Resolve all auto fields for an item from brand + model + family (used on create/update).
// Returns the pricing block + item_name; null pricing means "no supplier price → enter manually".
export async function resolveItemAuto({ brand, model, product_family, item_name }) {
  const brandRec = await getBrand(brand)
  const supplierPrice = await supplierPriceFor(brand, model)
  const pricing = computePricing(supplierPrice, brandRec)
  const name = item_name || buildItemName(brand, model, product_family)
  return { name, brandRec, ...pricing }
}
