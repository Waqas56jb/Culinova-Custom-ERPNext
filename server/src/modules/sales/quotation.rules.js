// ============================================================
// SALES & QUOTATION BUSINESS RULES (CEO spec)
// ============================================================
export const RULES = {
  VAT: 0.15,
  MAX_DISCOUNT: 25,     // #6 absolute max
  DIRECT_DISCOUNT: 20,  // #6 ≤20% salesperson direct, >20% CEO approval
  MIN_GP: 35,           // #5 below 35% needs approval
  TARGET_GP: 45,        // #5 target
  VALID_DAYS: [15, 30, 60], // #9
}

// #16 — mandatory fields before a quotation can be issued
export function validateRequiredFields(p) {
  const need = ['customer', 'contact_person', 'project_name', 'project_location', 'validity_days', 'payment_terms']
  const missing = need.filter((f) => !p[f] && p[f] !== 0)
  if (!RULES.VALID_DAYS.includes(Number(p.validity_days))) missing.push('validity_days (15/30/60)')
  return missing
}

// compute net, discount, vat, total, cost, gp%
export function computeFinancials(items = [], discountPct = 0) {
  const net = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0)
  const cost = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.cost) || 0), 0)
  const d = Math.max(0, Number(discountPct) || 0)
  const discountAmount = (net * d) / 100
  const netAfter = net - discountAmount
  const vat = netAfter * RULES.VAT
  const total = netAfter + vat
  const gp = netAfter > 0 ? ((netAfter - cost) / netAfter) * 100 : 0
  return {
    net_amount: round(net), discount_pct: d, discount_amount: round(discountAmount),
    vat_amount: round(vat), total_amount: round(total), cost_amount: round(cost), gp_percent: round(gp),
  }
}

// #4/#5/#6/#11 — decide whether the quote can be sent directly, needs approval, or is blocked
export function evaluateApproval({ discount_pct, gp_percent }) {
  if (discount_pct > RULES.MAX_DISCOUNT) return { blocked: true, reason: `Discount ${discount_pct}% exceeds max ${RULES.MAX_DISCOUNT}%` }
  const reasons = []
  if (discount_pct > RULES.DIRECT_DISCOUNT) reasons.push(`Discount ${discount_pct}% > ${RULES.DIRECT_DISCOUNT}% (CEO approval)`)
  if (gp_percent < RULES.MIN_GP) reasons.push(`GP ${gp_percent}% < ${RULES.MIN_GP}% minimum`)
  return { blocked: false, needsApproval: reasons.length > 0, reason: reasons.join(' · ') || null }
}

// #7 — discount source from the actor's role
export function discountSource(role) {
  if (role === 'Management' || role === 'System Admin') return 'CEO'
  if (role === 'Sales Manager') return 'Management'
  return 'Salesperson'
}

const round = (n) => Math.round((Number(n) || 0) * 100) / 100
