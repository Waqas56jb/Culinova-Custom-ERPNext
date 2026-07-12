import { canAccessPanel, canDoAction, canSeeFinancials, restrictedFields, isInternal } from '../rbac/permissions.js'

// Guard a route by panel + action
export function authorize(panel, action) {
  return (req, res, next) => {
    const { role, access_level } = req.user || {}
    if (!canAccessPanel(role, panel)) return res.status(403).json({ error: `No access to ${panel} panel` })
    if (!canDoAction(access_level, action)) return res.status(403).json({ error: `Your access level cannot ${action}` })
    next()
  }
}

// Guard a shared cross-panel read: any internal staff role may pass; external (zero-panel) roles like a
// portal Customer are rejected. Use for the Item Master catalogue and Company Settings masters, which
// every internal role legitimately reads but a Customer must not enumerate.
export function internalOnly(req, res, next) {
  if (!isInternal(req.user?.role)) return res.status(403).json({ error: 'Staff access only' })
  next()
}

// Guard a route that is legitimately reachable from MORE THAN ONE panel (e.g. a Stock User reads
// purchase orders to receive them, while Procurement owns writing them). Passes if the role can access
// ANY of the listed panels AND its access level allows the action.
export function authorizeAny(panels, action) {
  const list = Array.isArray(panels) ? panels : [panels]
  return (req, res, next) => {
    const { role, access_level } = req.user || {}
    if (!list.some((p) => canAccessPanel(role, p))) return res.status(403).json({ error: `No access to ${list.join('/')} panel` })
    if (!canDoAction(access_level, action)) return res.status(403).json({ error: `Your access level cannot ${action}` })
    next()
  }
}

// Strip cost/profit/supplier-price fields from responses for roles outside Management / Operations /
// Finance (Sales rules #4/#20 — Sales and Engineering must never see cost or margin).
// Recurses into nested objects/arrays so line items (e.g. quotation_items[].cost) are stripped too.
export function redactFinancials(role, data) {
  if (canSeeFinancials(role)) return data
  const strip = (val) => {
    if (Array.isArray(val)) return val.map(strip)
    if (!val || typeof val !== 'object') return val
    const clone = {}
    for (const [k, v] of Object.entries(val)) {
      if (restrictedFields.includes(k)) continue
      clone[k] = (v && typeof v === 'object') ? strip(v) : v
    }
    return clone
  }
  return strip(data)
}
