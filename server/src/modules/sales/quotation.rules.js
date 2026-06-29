// ============================================================
// SALES & QUOTATION BUSINESS RULES (CEO spec)
// ============================================================
export const RULES = {
  VAT: 0.15,
  MAX_DISCOUNT: 25,     // #6 absolute max (blocked above this for everyone)
  DIRECT_DISCOUNT: 20,  // fallback direct limit
  MIN_GP: 35,           // #5 below 35% needs approval
  TARGET_GP: 45,        // #5 target
  VALID_DAYS: [15, 30, 60], // #9
}

// SEC-002 — discount a role can grant DIRECTLY (no approval). Above it → manager/CEO approval.
export const ROLE_DISCOUNT = {
  'Sales User': 10,
  'Sales Manager': 20,
  'Management': 25,
  'System Admin': 25,
}
export const roleDirectLimit = (role) => ROLE_DISCOUNT[role] ?? 5
export const isApprover = (role) => role === 'Management' || role === 'System Admin'

// #16 — mandatory fields before a quotation can be issued
export function validateRequiredFields(p) {
  const need = ['customer', 'contact_person', 'project_name', 'project_location', 'validity_days', 'payment_terms']
  const missing = need.filter((f) => !p[f] && p[f] !== 0)
  if (!RULES.VALID_DAYS.includes(Number(p.validity_days))) missing.push('validity_days (15/30/60)')
  return missing
}

// compute net, discount (% + fixed = SO-003 dual discount), vat, total, cost, gp%
export function computeFinancials(items = [], discountPct = 0, discountFixed = 0) {
  const net = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0)
  const cost = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.cost) || 0), 0)
  const d = Math.max(0, Number(discountPct) || 0)
  const fixed = Math.max(0, Number(discountFixed) || 0)
  const discountAmount = Math.min(net, (net * d) / 100 + fixed)   // never exceed net
  const netAfter = net - discountAmount
  const vat = netAfter * RULES.VAT
  const total = netAfter + vat
  const gp = netAfter > 0 ? ((netAfter - cost) / netAfter) * 100 : 0
  return {
    net_amount: round(net), discount_pct: d, discount_fixed: round(fixed), discount_amount: round(discountAmount),
    vat_amount: round(vat), total_amount: round(total), cost_amount: round(cost), gp_percent: round(gp),
  }
}
// effective combined discount % (used for approval limits) — handles % + fixed together
export const effectiveDiscountPct = (fin) => { const n = Number(fin.net_amount) || 0; return n > 0 ? round(((Number(fin.discount_amount) || 0) / n) * 100) : 0 }

// #4/#5/#6/#11 + SEC-002 + SO-003 — decide: send directly, needs approval, or blocked (per role)
// `fin` is the computeFinancials() output; the combined (% + fixed) effective discount drives limits.
export function evaluateApproval(fin, role) {
  const eff = effectiveDiscountPct(fin)
  if (eff > RULES.MAX_DISCOUNT) return { blocked: true, reason: `Total discount ${eff}% exceeds max ${RULES.MAX_DISCOUNT}%` }
  const direct = roleDirectLimit(role)
  const reasons = []
  if (eff > direct) reasons.push(`Discount ${eff}% > your limit ${direct}% (needs approval)`)
  if ((Number(fin.gp_percent) ?? 100) < RULES.MIN_GP) reasons.push(`GP ${fin.gp_percent}% < ${RULES.MIN_GP}% minimum`)
  return { blocked: false, needsApproval: !isApprover(role) && reasons.length > 0, reason: reasons.join(' · ') || null, directLimit: direct, effective: eff }
}

// #7 — discount source from the actor's role
export function discountSource(role) {
  if (role === 'Management' || role === 'System Admin') return 'CEO'
  if (role === 'Sales Manager') return 'Management'
  return 'Salesperson'
}

const round = (n) => Math.round((Number(n) || 0) * 100) / 100
