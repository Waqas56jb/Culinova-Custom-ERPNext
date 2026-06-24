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

// Strip cost/GP fields from responses for non-management users (Sales rules #4/#20)
export function redactFinancials(role, data) {
  if (isManagement(role)) return data
  const strip = (row) => {
    if (!row || typeof row !== 'object') return row
    const clone = { ...row }
    restrictedFields.forEach((f) => delete clone[f])
    return clone
  }
  return Array.isArray(data) ? data.map(strip) : strip(data)
}
