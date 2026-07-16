import { supabase } from '../config/supabase.js'
import { availabilityByIds } from './availability.js'

const n0 = (v) => Number(v) || 0
const OPEN_PO = (s) => !['Received', 'Closed', 'Delivered', 'Cancelled'].includes(s)

/**
 * Smart equipment selection — ranks alternatives in the same product_family.
 * Priority (client spec): 1) available stock  2) incoming  3) preferred brand  4) margin  5) lead time
 */
export async function recommendEquipment({ product_family, brand_preference, limit = 5, includeMargin = false }) {
  const family = (product_family || '').trim()
  if (!family) return []

  const { data: items } = await supabase.from('items')
    .select('id, item_name, brand, model, product_family, selling_price, landed_cost, gp_percent, eta_days, lead_time_days')
    .ilike('product_family', family)
    .eq('status', 'Active')
    .limit(50)

  if (!items?.length) return []

  const avail = await availabilityByIds(items.map((i) => i.id))
  const preferred = (brand_preference || '').trim().toLowerCase()

  const scored = items.map((it) => {
    const a = avail[it.id] || {}
    const available = n0(a.available)
    const incoming = n0(a.incoming)
    const eta = n0(it.eta_days) || n0(it.lead_time_days) || 999
    const gp = n0(it.gp_percent) || (n0(it.selling_price) > 0 && n0(it.landed_cost) > 0
      ? ((n0(it.selling_price) - n0(it.landed_cost)) / n0(it.selling_price)) * 100 : 0)
    const brandMatch = preferred && (it.brand || '').toLowerCase() === preferred ? 1 : 0

    // Higher score = better recommendation
    const score =
      (available > 0 ? 1000 + available * 10 : 0) +
      (incoming > 0 ? 500 + incoming * 5 : 0) +
      (brandMatch ? 200 : 0) +
      (includeMargin ? gp * 2 : 0) +
      Math.max(0, 50 - Math.min(eta, 50))

    return {
      item_id: it.id,
      item_name: it.item_name,
      brand: it.brand,
      model: it.model,
      product_family: it.product_family,
      selling_price: includeMargin ? n0(it.selling_price) : undefined,
      available_qty: available,
      reserved_qty: n0(a.reserved),
      incoming_qty: incoming,
      eta_days: eta < 999 ? eta : null,
      score,
      reason: buildReason({ available, incoming, brandMatch, eta, gp, includeMargin }),
    }
  })

  return scored.sort((a, b) => b.score - a.score).slice(0, limit)
}

function buildReason({ available, incoming, brandMatch, eta, gp, includeMargin }) {
  const parts = []
  if (available > 0) parts.push(`${available} in stock`)
  else if (incoming > 0) parts.push(`${incoming} incoming`)
  if (brandMatch) parts.push('preferred brand')
  if (eta < 999) parts.push(`ETA ${eta}d`)
  if (includeMargin && gp > 0) parts.push(`GP ${Math.round(gp)}%`)
  return parts.join(' · ') || 'alternative in same family'
}
