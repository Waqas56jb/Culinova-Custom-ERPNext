/**
 * Sprint 4 Block 1 — Commercial equipment recommendations
 * Extends family ranking with qty/shortfall, §10 brand hard-filter, preferred flag, exact client labels.
 *
 * Priority: 1) available stock  2) incoming  3) preferred brand  4) margin  5) lead time
 */
import { supabase } from '../config/supabase.js'
import { availabilityByIds } from './availability.js'

const n0 = (v) => Number(v) || 0

/** Client-exact reason strings (G81). */
export const REASON = {
  available: (n) => `Available in Stock (${n})`,
  incoming: (n, eta) => (eta != null && eta < 999
    ? `Incoming Stock (${n}, ETA ${eta} days)`
    : `Incoming Stock (${n})`),
  preferred: 'Preferred Brand',
  margin: 'Better Margin',
  lead: (d) => `Shorter Lead Time (${d} days)`,
}

/**
 * @param {{
 *   product_family: string,
 *   qty?: number,
 *   brand_preference?: string,   // soft preference (legacy)
 *   requested_brand?: string,    // §10 HARD filter
 *   limit?: number,
 *   includeMargin?: boolean,
 *   exclude_item_id?: string,
 * }} opts
 * @returns {Promise<{ recommendations: object[], alternatives: object[] }>}
 */
export async function recommendEquipment({
  product_family,
  qty = 1,
  brand_preference,
  requested_brand,
  limit = 5,
  includeMargin = false,
  exclude_item_id = null,
} = {}) {
  const family = (product_family || '').trim()
  if (!family) return { recommendations: [], alternatives: [] }

  const needQty = Math.max(1, n0(qty) || 1)
  const hardBrand = (requested_brand || '').trim()
  const softBrand = (brand_preference || '').trim()
  // Soft preference only when no hard filter (hard already forces that brand in main list)
  const preferredSoft = !hardBrand && softBrand ? softBrand.toLowerCase() : ''

  const { data: items } = await supabase.from('items')
    .select('id, item_name, brand, model, product_family, selling_price, landed_cost, gp_percent, eta_days, lead_time_days, image_url, specifications, datasheet_url')
    .ilike('product_family', family)
    .eq('status', 'Active')
    .limit(80)

  let pool = items || []
  if (exclude_item_id) pool = pool.filter((it) => it.id !== exclude_item_id)
  if (!pool.length) return { recommendations: [], alternatives: [] }

  const [{ data: brandRows }, avail] = await Promise.all([
    supabase.from('brands').select('brand, preferred'),
    availabilityByIds(pool.map((i) => i.id)),
  ])
  const preferredNames = new Set(
    (brandRows || []).filter((b) => b.preferred).map((b) => String(b.brand || '').toLowerCase()),
  )

  const etas = pool.map((it) => n0(it.eta_days) || n0(it.lead_time_days) || 999).filter((e) => e < 999)
  const minEta = etas.length ? Math.min(...etas) : null

  const scored = pool.map((it) => scoreItem(it, {
    avail: avail[it.id] || {},
    needQty,
    preferredNames,
    preferredSoft,
    minEta,
    poolSize: pool.length,
    includeMargin,
  }))

  if (hardBrand) {
    const want = hardBrand.toLowerCase()
    const main = scored.filter((r) => (r.brand || '').toLowerCase() === want)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
    const alts = scored.filter((r) => (r.brand || '').toLowerCase() !== want)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => ({ ...r, alternative: true }))
    return { recommendations: main, alternatives: alts }
  }

  const recommendations = scored.sort((a, b) => b.score - a.score).slice(0, limit)
  return { recommendations, alternatives: [] }
}

function scoreItem(it, ctx) {
  const { avail, needQty, preferredNames, preferredSoft, minEta, poolSize, includeMargin } = ctx
  const available = n0(avail.available) // unreserved
  const incoming = n0(avail.incoming)
  const coverPool = available + incoming
  const covered_qty = Math.min(needQty, coverPool)
  const shortfall = Math.max(0, needQty - coverPool)
  const to_purchase = shortfall

  const eta = n0(it.eta_days) || n0(it.lead_time_days) || 999
  const shortestLead = minEta != null && eta === minEta && poolSize > 1
  const gp = n0(it.gp_percent) || (n0(it.selling_price) > 0 && n0(it.landed_cost) > 0
    ? ((n0(it.selling_price) - n0(it.landed_cost)) / n0(it.selling_price)) * 100 : 0)

  const brandKey = (it.brand || '').toLowerCase()
  const isPreferredMaster = preferredNames.has(brandKey)
  const softMatch = preferredSoft && brandKey === preferredSoft

  const score =
    (available > 0 ? 1000 + available * 10 : 0) +
    (incoming > 0 ? 500 + incoming * 5 : 0) +
    (isPreferredMaster ? 220 : 0) +
    (softMatch ? 180 : 0) +
    (includeMargin ? gp * 2 : 0) +
    Math.max(0, 50 - Math.min(eta, 50))

  const reasons = buildReasons({
    available, incoming, eta, shortestLead,
    isPreferredMaster, includeMargin, gp,
  })

  return {
    item_id: it.id,
    item_name: it.item_name,
    brand: it.brand,
    model: it.model,
    product_family: it.product_family,
    selling_price: n0(it.selling_price),
    image_url: it.image_url || null,
    specifications: it.specifications || null,
    datasheet_url: it.datasheet_url || null,
    available,
    available_unreserved: available,
    available_qty: available, // legacy alias (UI bug was in_stock)
    incoming,
    incoming_qty: incoming,
    covered_qty,
    shortfall,
    to_purchase,
    eta_days: eta < 999 ? eta : null,
    reasons,
    reason: reasons[0] || 'alternative in same family',
    score,
    preferred_brand: isPreferredMaster,
    alternative: false,
  }
}

function buildReasons({ available, incoming, eta, shortestLead, isPreferredMaster, includeMargin, gp }) {
  const parts = []
  // Primary order per client: Available → Incoming → Preferred → Margin → Lead
  if (available > 0) parts.push(REASON.available(available))
  if (incoming > 0) parts.push(REASON.incoming(incoming, eta))
  if (isPreferredMaster) parts.push(REASON.preferred)
  if (includeMargin && gp > 0) parts.push(REASON.margin)
  if (shortestLead && eta < 999) parts.push(REASON.lead(eta))
  if (!parts.length) parts.push('Same product family')
  return parts
}

/** Flat array helper for legacy callers that expect a list (not {recommendations, alternatives}). */
export async function recommendEquipmentList(opts) {
  const { recommendations } = await recommendEquipment(opts)
  return recommendations
}
