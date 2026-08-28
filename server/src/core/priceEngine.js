/**
 * THE valuation-rate pricing chain (Sprint 1a Block 4).
 *
 *   Expected Landed Cost = valuation_rate × exchange_factor
 *   Base Selling         = Expected Landed Cost × price_factor
 *   Selling              = Base × (1 + add_margin_pct/100) × (1 − special_offer_pct/100)
 *   GP%                  = (Selling − Expected Landed Cost) / Selling
 *
 * Factor resolution: item override (non-blank) → brand → 1.
 * Brand Master "SAR 1,000 →" preview in PricingEngine.jsx uses the same math — see example() there.
 */
import { supabase } from '../config/supabase.js'
import { getBrand } from './itempricing.js'

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const num = (v, fallback = null) => {
  if (v === '' || v === null || v === undefined) return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}
const blank = (v) => v === '' || v === null || v === undefined

/** Single factor resolver — item override (non-blank) → brand → 1. */
export function resolveFactors(item = {}, brand = null) {
  const itemEx = blank(item.exchange_factor) ? null : num(item.exchange_factor)
  const itemPf = blank(item.price_factor) ? null : num(item.price_factor)
  return {
    exchange_factor: itemEx ?? num(brand?.exchange_factor, 1) ?? 1,
    price_factor: itemPf ?? num(brand?.price_factor, 1) ?? 1,
    add_margin_pct: num(brand?.add_margin_pct, 0) ?? 0,
    special_offer_pct: num(brand?.special_offer_pct, 0) ?? 0,
    currency: brand?.currency || item?.currency || 'SAR',
  }
}

/**
 * Price one item from valuation rate + brand factors.
 * @returns pricing result with VR-chain field names + legacy aliases (estimated_cost, selling_price, gp_percent)
 */
export function priceItem(item, brand = null) {
  const f = resolveFactors(item, brand)

  let basisValue = num(item?.valuation_rate, 0) ?? 0
  let basis = 'valuation_rate'
  if (!basisValue) {
    basisValue = num(item?.cost, 0) ?? 0
    basis = basisValue ? 'item_cost' : 'none'
  }

  if (!basisValue) {
    return {
      basis: 'none',
      basis_value: 0,
      expected_landed: null,
      base_selling: null,
      selling: null,
      gp_pct: null,
      factors: f,
      currency: f.currency,
      priced: false,
      reason: 'No valuation rate on the item — set it in the Pricing Engine or from opening stock.',
      estimated_cost: null,
      selling_price: null,
      gp_percent: null,
    }
  }

  const expected_landed = basisValue * f.exchange_factor
  const base_selling = expected_landed * f.price_factor
  const selling = base_selling * (1 + f.add_margin_pct / 100) * (1 - f.special_offer_pct / 100)
  const gp_pct = selling > 0 ? ((selling - expected_landed) / selling) * 100 : 0

  return {
    basis,
    basis_value: round2(basisValue),
    expected_landed: round2(expected_landed),
    base_selling: round2(base_selling),
    selling: round2(selling),
    gp_pct: round2(gp_pct),
    factors: f,
    currency: f.currency,
    priced: true,
    estimated_cost: round2(expected_landed),
    selling_price: round2(selling),
    gp_percent: round2(gp_pct),
  }
}

/** Async wrapper — loads brand via getBrand (ilike). */
export async function priceItemLive(item) {
  if (!item) return priceItem({}, null)
  const brand = item.brand ? await getBrand(item.brand) : null
  return priceItem(item, brand)
}

/** Preview for Brand Master SAR 1,000 column — VR basis 1000 with brand factors. */
export function previewBrandExample(brandLike, basisValue = 1000) {
  return priceItem({ valuation_rate: basisValue }, brandLike)
}

/** Price many items — one query for items, brands matched ilike. */
export async function priceItems(itemIds = []) {
  const ids = [...new Set((itemIds || []).filter(Boolean))]
  if (!ids.length) return {}

  const { data: items } = await supabase
    .from('items')
    .select('id, item_name, brand, model, valuation_rate, cost, exchange_factor, price_factor, selling_price, standard_rate')
    .in('id', ids)

  const brandNames = [...new Set((items || []).map((i) => i.brand).filter(Boolean))]
  const brandByName = new Map()
  for (const name of brandNames) {
    const b = await getBrand(name)
    if (b) brandByName.set(String(b.brand).toLowerCase(), b)
  }

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

/** Strip cost/margin for Sales roles. */
export function redactPricing(priced, canSeeFinancials) {
  if (canSeeFinancials) return priced
  const { estimated_cost, expected_landed, gp_percent, gp_pct, factors, base_selling, basis_value, ...safe } = priced
  return safe
}
