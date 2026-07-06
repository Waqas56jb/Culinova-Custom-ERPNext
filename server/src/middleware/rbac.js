import { canAccessPanel, canDoAction, isManagement, restrictedFields } from '../rbac/permissions.js'

// Guard a route by panel + action
export function authorize(panel, action) {
  return (req, res, next) => {
    const { role, access_level } = req.user || {}
    if (!canAccessPanel(role, panel)) return res.status(403).json({ error: `No access to ${panel} panel` })
    if (!canDoAction(access_level, action)) return res.status(403).json({ error: `Your access level cannot ${action}` })
    next()
  }
}

// Strip cost/GP fields from responses for non-management users (Sales rules #4/#20).
// Recurses into nested objects/arrays so line items (e.g. quotation_items[].cost) are stripped too.
export function redactFinancials(role, data) {
  if (isManagement(role)) return data
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
