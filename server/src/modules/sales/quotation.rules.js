// ============================================================
// SALES & QUOTATION BUSINESS RULES (CEO spec · Ali §5 Sprint 1b)
// ============================================================
export const RULES = {
  VAT: 0.15,
  MAX_DISCOUNT: 25,     // absolute max for non-approvers; approvers may exceed with override_reason
  DIRECT_DISCOUNT: 20,  // fallback direct limit (legacy)
  MIN_GP: 35,           // below 35% needs approval (or override reason for approvers)
  TARGET_GP: 45,
  VALID_DAYS: [7, 15, 30, 60],
}

export function isValidValidityDays(days) {
  const n = Number(days)
  return Number.isFinite(n) && n > 0 && n <= 365
}

// SEC-002 — discount a role can grant DIRECTLY (no approval). Above it → manager/CEO approval.
export const ROLE_DISCOUNT = {
  'Sales User': 15,
  'Sales Manager': 20,
  'Management': 100,
  'System Admin': 100,
}
export const roleDirectLimit = (role) => ROLE_DISCOUNT[role] ?? 5
export const isApprover = (role) => role === 'Management' || role === 'System Admin'

/** Mandatory 6 fields (Sales Rules §16). Returns field names still missing/invalid. */
export function validateRequiredFields(p) {
  const missing = []
  for (const f of ['customer', 'contact_person', 'project_name', 'project_location', 'payment_terms']) {
    if (!p[f] && p[f] !== 0) missing.push(f)
  }
  if (!isValidValidityDays(p.validity_days)) missing.push('validity_days')
  return missing
}

/**
 * @deprecated Prefer quotation.routes.js recomputeTotals for live builder totals.
 * Still called by legacy sales.routes.js:
 *   - PATCH /sales/quotations/:id (header financials)
 *   - POST /sales/quotations/:id/approve (GP check for override_reason)
 * Line `cost` here must be expected_landed (VR × exchange) when items carry Block 4 snapshots — NOT supplier price.
 */
export function computeFinancials(items = [], discountPct = 0, discountFixed = 0) {
  const net = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0)
  const cost = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.cost) || 0), 0)
  const d = Math.max(0, Number(discountPct) || 0)
  const fixed = Math.max(0, Number(discountFixed) || 0)
  const discountAmount = Math.min(net, (net * d) / 100 + fixed)
  const netAfter = net - discountAmount
  const vat = netAfter * RULES.VAT
  const total = netAfter + vat
  const gp = netAfter > 0 ? ((netAfter - cost) / netAfter) * 100 : 0
  return {
    net_amount: round(net), discount_pct: d, discount_fixed: round(fixed), discount_amount: round(discountAmount),
    vat_amount: round(vat), total_amount: round(total), cost_amount: round(cost), gp_percent: round(gp),
  }
}

export const effectiveDiscountPct = (fin) => {
  const n = Number(fin.net_amount) || 0
  return n > 0 ? round(((Number(fin.discount_amount) || 0) / n) * 100) : 0
}

/**
 * #4/#5/#6/#11 + SEC-002 + Ali §5 Sprint 1b
 * Non-approvers: > MAX_DISCOUNT blocked; > role limit → needsApproval; GP < MIN_GP → needsApproval
 * Approvers: > MAX_DISCOUNT or GP < MIN_GP require overrideReason (stored on quotation)
 */
export function evaluateApproval(fin, role, opts = {}) {
  const eff = effectiveDiscountPct(fin)
  const overrideReason = String(opts.overrideReason || '').trim()
  const gp = Number(fin.gp_percent)
  const belowGp = Number.isFinite(gp) && gp < RULES.MIN_GP

  if (eff > RULES.MAX_DISCOUNT && !isApprover(role)) {
    return { blocked: true, reason: `Total discount ${eff}% exceeds max ${RULES.MAX_DISCOUNT}%` }
  }

  if (isApprover(role)) {
    if (eff > RULES.MAX_DISCOUNT && !overrideReason) {
      return {
        blocked: true,
        reason: `Discount ${eff}% exceeds ${RULES.MAX_DISCOUNT}% — strategic override reason required`,
        requiresOverrideReason: true,
      }
    }
    if (belowGp && !overrideReason) {
      return {
        blocked: true,
        reason: `GP ${gp}% is below ${RULES.MIN_GP}% minimum — override reason required`,
        requiresOverrideReason: true,
      }
    }
    return { blocked: false, needsApproval: false, reason: null, directLimit: roleDirectLimit(role), effective: eff }
  }

  const direct = roleDirectLimit(role)
  const reasons = []
  if (eff > direct) reasons.push(`Discount ${eff}% > your limit ${direct}% (needs approval)`)
  if (belowGp) reasons.push(`GP ${gp}% < ${RULES.MIN_GP}% minimum`)
  return {
    blocked: false,
    needsApproval: reasons.length > 0,
    reason: reasons.join(' · ') || null,
    directLimit: direct,
    effective: eff,
  }
}

export function discountSource(role) {
  if (role === 'Management' || role === 'System Admin') return 'CEO'
  if (role === 'Sales Manager') return 'Management'
  return 'Salesperson'
}

const round = (n) => Math.round((Number(n) || 0) * 100) / 100
