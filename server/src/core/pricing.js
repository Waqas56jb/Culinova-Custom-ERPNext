// THE pricing chain. Every module that needs a cost or a price (Item Master, Quotation, BOQ,
// Cost Sheet, RFQ award, Project Equipment) goes through here — there is no second implementation.
//
//   supplier_price (in the item's currency)
//     × FX rate  → supplier cost in SAR
//     + factory + freight + insurance + customs + local transport + other
//                                                        = LANDED COST
//     × markup factor                                    = calculated sale price
//     × (1 + add_margin%) × (1 − special_offer%) × (1 − discount%)
//                                                        = SELLING PRICE
//   gross profit = selling − landed              gp% = gp / selling
//   net profit   = gross profit − selling × opex%
//
// Each landed component is either an explicit amount on the item, or derived as a PERCENTAGE of the
// supplier cost from the item's landed-cost template — so the owner configures rates once instead of
// typing five numbers per item. Nothing here is hardcoded: every factor comes from the DB.
import { supabase } from '../config/supabase.js'

const round = (n) => Math.round((Number(n) || 0) * 100) / 100
const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v))
const n0 = (v) => Number(v) || 0

// ── FX ───────────────────────────────────────────────────────────────────────
// The base currency is whichever currency is flagged is_base (SAR for Culinova) — not a constant.
export async function baseCurrency() {
  const { data } = await supabase.from('currencies').select('code').eq('is_base', true).maybeSingle()
  return data?.code || 'SAR'
}

// Latest rate on/before today from exchange_rates (the audit trail); falls back to the current rate
// held on the currency row; 1 if the currency is the base or unknown.
export async function fxRate(from, to) {
  const base = to || (await baseCurrency())
  if (!from || from === base) return 1
  const { data: hist } = await supabase
    .from('exchange_rates').select('rate')
    .eq('from_currency', from).eq('to_currency', base)
    .lte('valid_from', new Date().toISOString().slice(0, 10))
    .order('valid_from', { ascending: false }).limit(1).maybeSingle()
  if (hist?.rate) return Number(hist.rate)
  const { data: cur } = await supabase.from('currencies').select('exchange_rate').eq('code', from).maybeSingle()
  return Number(cur?.exchange_rate) || 1
}

// Record a new rate AND update the currency's current rate, so the two never drift apart.
export async function setFxRate({ from_currency, to_currency, rate, valid_from, source, created_by }) {
  const base = to_currency || (await baseCurrency())
  const { data, error } = await supabase.from('exchange_rates').insert({
    from_currency, to_currency: base, rate: Number(rate),
    valid_from: valid_from || new Date().toISOString().slice(0, 10),
    source: source || 'manual', created_by: created_by || null,
  }).select().single()
  if (error) throw new Error(error.message)
  await supabase.from('currencies').update({ exchange_rate: Number(rate), updated_at: new Date().toISOString() }).eq('code', from_currency)
  return data
}

// ── templates & discounts ────────────────────────────────────────────────────
export async function landedTemplate(id) {
  const q = supabase.from('landed_cost_templates').select('*').eq('is_active', true)
  const { data } = id ? await q.eq('id', id).maybeSingle() : await q.eq('is_default', true).maybeSingle()
  return data || null
}

// The best discount the DB says applies to this item (by item, item_group/product family, or All).
// Returns 0 when no rule matches — a discount is never invented.
export async function discountFor(item) {
  const { data: rules } = await supabase.from('discount_rules').select('*').eq('is_active', true)
  if (!rules?.length) return { pct: 0, rule: null }
  const eq = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()
  const matches = rules.filter((r) => {
    const t = String(r.applies_to || 'All').toLowerCase()
    if (t === 'all') return true
    if (t === 'item') return eq(r.target, item?.item_name) || eq(r.target, item?.item_code)
    if (t === 'item group' || t === 'item_group') return eq(r.target, item?.item_group)
    if (t === 'product family' || t === 'family') return eq(r.target, item?.product_family)
    if (t === 'brand') return eq(r.target, item?.brand)
    if (t === 'customer') return false // resolved at quotation time, not on the item
    return false
  })
  if (!matches.length) return { pct: 0, rule: null }
  // most specific wins; on a tie, the biggest discount — but never above the rule's own cap
  const best = matches.reduce((a, b) => (n0(b.discount_pct) > n0(a.discount_pct) ? b : a))
  const cap = num(best.max_discount)
  const pct = cap != null ? Math.min(n0(best.discount_pct), cap) : n0(best.discount_pct)
  return { pct, rule: best.name || null }
}

// ── the chain ────────────────────────────────────────────────────────────────
// Pure function: given an item's raw fields + the resolved fx/template/discount/opex, produce the
// full breakdown. Kept pure so it is trivially testable and reusable on the client if ever needed.
export function computeChain(item = {}, ctx = {}) {
  const fx = n0(ctx.fx) || 1
  const tpl = ctx.template || null
  const opexPct = n0(ctx.opex_pct ?? tpl?.opex_pct)
  const discountPct = n0(ctx.discount_pct)

  const supplierRaw = num(item.supplier_price)
  // an item with no supplier price cannot be priced — say so instead of inventing a 0
  if (supplierRaw == null && num(item.factory_cost) == null) {
    return { priced: false, reason: 'No supplier price or factory cost — enter one to price this item.' }
  }

  // an explicit exchange_factor on the item overrides the live FX rate (the CEO's original chain)
  const rate = num(item.exchange_factor) ?? fx
  const supplier_cost = n0(supplierRaw) * rate
  const factory_cost = n0(item.factory_cost)
  const costBase = supplier_cost + factory_cost

  // each component: explicit amount on the item wins; else template % of the cost base; else 0
  const pctOf = (explicit, pct) => {
    const e = num(explicit)
    if (e != null) return e
    return tpl ? (costBase * n0(pct)) / 100 : 0
  }
  const freight = pctOf(item.freight_cost, tpl?.freight_pct)
  const insurance = pctOf(item.insurance_cost, tpl?.insurance_pct)
  const customs = pctOf(item.customs_duty, tpl?.customs_pct)
  const transport = pctOf(item.local_transport, tpl?.transport_pct)
  const other = pctOf(item.other_landed_cost, tpl?.other_pct)

  const landed_cost = costBase + freight + insurance + customs + transport + other

  // markup: item override → template → the CEO's price_factor → 1 (no silent margin)
  const markup = num(item.markup_factor) ?? num(tpl?.markup_factor) ?? num(item.price_factor) ?? 1
  const calculated_sale_price = landed_cost * markup

  const margin = n0(item.add_margin_pct)
  const offer = n0(item.special_offer_pct)
  const selling_price = calculated_sale_price * (1 + margin / 100) * (1 - offer / 100) * (1 - discountPct / 100)

  const gross_profit = selling_price - landed_cost
  const gp_percent = selling_price > 0 ? (gross_profit / selling_price) * 100 : 0
  const opex_amount = (selling_price * opexPct) / 100
  const net_profit = gross_profit - opex_amount
  const np_percent = selling_price > 0 ? (net_profit / selling_price) * 100 : 0

  return {
    priced: true,
    currency: item.currency || null,
    fx_rate: round(rate),
    supplier_price: round(supplierRaw),
    supplier_cost: round(supplier_cost),
    factory_cost: round(factory_cost),
    freight_cost: round(freight),
    insurance_cost: round(insurance),
    customs_duty: round(customs),
    local_transport: round(transport),
    other_landed_cost: round(other),
    landed_cost: round(landed_cost),
    markup_factor: round(markup),
    calculated_sale_price: round(calculated_sale_price),
    add_margin_pct: round(margin),
    special_offer_pct: round(offer),
    discount_pct: round(discountPct),
    selling_price: round(selling_price),
    gross_profit: round(gross_profit),
    gp_percent: round(gp_percent),
    opex_pct: round(opexPct),
    net_profit: round(net_profit),
    np_percent: round(np_percent),
    template: tpl?.name || null,
  }
}

// Resolve everything an item needs from the DB, then run the chain. This is what routes call.
export async function priceItem(item, opts = {}) {
  const [tpl, disc] = await Promise.all([
    landedTemplate(item.landed_template_id),
    opts.applyDiscount === false ? Promise.resolve({ pct: 0, rule: null }) : discountFor(item),
  ])
  const fx = await fxRate(item.currency)
  const out = computeChain(item, {
    fx,
    template: tpl,
    discount_pct: opts.discount_pct != null ? opts.discount_pct : disc.pct,
    opex_pct: opts.opex_pct,
  })
  return { ...out, discount_rule: disc.rule }
}

// The subset of the chain that is persisted back onto the items row.
export function persistable(chain) {
  if (!chain?.priced) return {}
  const keys = [
    'supplier_price', 'factory_cost', 'freight_cost', 'insurance_cost', 'customs_duty', 'local_transport',
    'other_landed_cost', 'landed_cost', 'markup_factor', 'calculated_sale_price', 'selling_price',
    'gp_percent', 'net_profit', 'np_percent',
  ]
  const out = {}
  for (const k of keys) if (chain[k] != null) out[k] = chain[k]
  // keep the legacy columns the rest of the app already reads in sync with the chain
  out.cost = chain.landed_cost
  out.selling_rate = chain.selling_price
  out.avg_cost = chain.landed_cost
  return out
}
