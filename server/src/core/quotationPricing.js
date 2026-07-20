import { supabase } from '../config/supabase.js'

/**
 * AUTOMATIC QUOTATION PRICING (feedback item 5).
 *
 * The client's rule, verbatim:
 *   "Every Item has a Valuation Rate, which is updated manually from the supplier's latest price
 *    list. Every Brand has pricing factors configured in the Brand Master. The quotation should
 *    calculate the estimated cost and selling price automatically using: Valuation Rate,
 *    Brand Master pricing factors."
 *
 * So the chain is:
 *
 *   estimated cost   = valuation rate × exchange factor
 *   base sell        = estimated cost  × price factor
 *   selling price    = base sell × (1 + add margin %) × (1 − special offer %)
 *   GP %             = (selling − estimated cost) / selling
 *
 * The valuation rate is the cost basis, NOT the supplier price list. Both exist in this database and
 * they are not the same number: price_list_items holds whatever a supplier last quoted, while
 * items.valuation_rate is what the business has decided the item costs. `basis` records which one
 * was actually used, so a quotation can always be explained afterwards.
 *
 * add_margin_pct and special_offer_pct live on the Brand Master (db/migrations_v4.sql). Until that
 * migration is applied they read as absent and default to 0 — the estimate is then simply
 * valuation × exchange × price factor, which is still correct, just without the margin step.
 * Nothing here invents a factor that has not been configured.
 *
 * What this deliberately does NOT do: compare against ACTUAL landed cost. Real landed cost needs
 * freight, customs, SABER, clearance and bank charges — the landed-cost engine that is still an open
 * scope decision. The estimate is stored on the line so that comparison becomes possible the day
 * that engine exists, but no comparison is fabricated before then.
 */

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const num = (v, fallback = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** Brand pricing factors, tolerant of the margin columns not being migrated yet. */
export function brandFactors(brand) {
  return {
    exchange_factor: num(brand?.exchange_factor, 1) || 1,
    price_factor: num(brand?.price_factor, 1) || 1,
    add_margin_pct: num(brand?.add_margin_pct, 0),
    special_offer_pct: num(brand?.special_offer_pct, 0),
    currency: brand?.currency || 'SAR',
  }
}

/**
 * Price one item.
 * @returns {{estimated_cost:number|null, selling_price:number|null, gp_percent:number|null,
 *            basis:string, factors:object, priced:boolean, reason?:string}}
 */
export function priceItem(item, brand) {
  const f = brandFactors(brand)

  // Cost basis: the valuation rate, per the rule above. Fall back to the item's own recorded cost
  // only when there is no valuation rate — and say so, rather than silently pricing off a different
  // number.
  let basisValue = num(item?.valuation_rate, 0)
  let basis = 'valuation_rate'
  if (!basisValue) {
    basisValue = num(item?.cost, 0)
    basis = basisValue ? 'item_cost' : 'none'
  }

  if (!basisValue) {
    return {
      estimated_cost: null,
      selling_price: null,
      gp_percent: null,
      basis: 'none',
      factors: f,
      priced: false,
      reason: 'No valuation rate on the item — set it from the supplier price list, or enter the rate manually.',
    }
  }

  const estimated_cost = basisValue * f.exchange_factor
  const base_sell = estimated_cost * f.price_factor
  const selling_price = base_sell * (1 + f.add_margin_pct / 100) * (1 - f.special_offer_pct / 100)
  const gp_percent = selling_price > 0 ? ((selling_price - estimated_cost) / selling_price) * 100 : 0

  return {
    estimated_cost: round2(estimated_cost),
    selling_price: round2(selling_price),
    gp_percent: round2(gp_percent),
    basis,
    factors: f,
    priced: true,
  }
}

/** Price many items in one pass — one query for the items, one for the brands they reference. */
export async function priceItems(itemIds = []) {
  const ids = [...new Set((itemIds || []).filter(Boolean))]
  if (!ids.length) return {}

  const { data: items } = await supabase
    .from('items')
    .select('id, item_name, brand, valuation_rate, cost, selling_price, standard_rate')
    .in('id', ids)

  const brandNames = [...new Set((items || []).map((i) => i.brand).filter(Boolean))]
  let brands = []
  if (brandNames.length) {
    const { data } = await supabase.from('brands').select('*').in('brand', brandNames)
    brands = data || []
  }
  const brandByName = new Map(brands.map((b) => [String(b.brand).toLowerCase(), b]))

  const out = {}
  for (const it of items || []) {
    const brand = it.brand ? brandByName.get(String(it.brand).toLowerCase()) : null
    const priced = priceItem(it, brand)
    out[it.id] = {
      item_id: it.id,
      item_name: it.item_name,
      brand: it.brand || null,
      brand_configured: !!brand,
      ...priced,
    }
  }
  return out
}

/** Strip cost/margin for roles that must not see them (owner's rule: hidden from Sales). */
export function redactPricing(priced, canSeeFinancials) {
  if (canSeeFinancials) return priced
  const { estimated_cost, gp_percent, factors, ...safe } = priced
  return safe
}
