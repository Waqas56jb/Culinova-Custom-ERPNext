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

// (3) Item Name = "Brand Model Family"
export const buildItemName = (brand, model, family) => [brand, model, family].filter(Boolean).join(' ').trim()

const blank = (v) => (v === '' || v === undefined ? null : v)

// Resolve auto fields on item create — pricing via priceEngine (VR chain).
export async function resolveItemAuto({ brand, model, product_family, item_name, supplier_price, exchange_factor, price_factor, add_margin_pct, special_offer_pct, valuation_rate }) {
  const brandRec = await getBrand(brand)
  const supplierPrice = (supplier_price != null && supplier_price !== '') ? Number(supplier_price) : await supplierPriceFor(brand, model)
  const { priceItem } = await import('./priceEngine.js')
  const merged = {
    brand,
    valuation_rate: blank(valuation_rate),
    exchange_factor: blank(exchange_factor),
    price_factor: blank(price_factor),
  }
  const pricing = priceItem(merged, brandRec)
  const name = item_name || buildItemName(brand, model, product_family)
  return {
    name,
    brandRec,
    supplier_price: supplierPrice != null ? round(supplierPrice) : null,
    landed_cost: pricing.expected_landed,
    calculated_sale_price: pricing.base_selling,
    selling_price: pricing.selling,
    gp_percent: pricing.gp_pct,
  }
}
