// ============================================================
// Role-Based Access Control — single source of truth
// Each role → which panels it can access. Access level → which actions.
// ============================================================

export const PANELS = [
  'admin', 'sales', 'projects', 'procurement', 'warehouse',
  'finance', 'site', 'service', 'hr',
]

// role → allowed panels ('*' = all)
export const rolePanels = {
  Management: ['*'],
  'System Admin': ['*'],
  'Sales User': ['sales'],
  'Sales Manager': ['sales'],
  'Project Manager': ['projects', 'procurement', 'site'],
  'Purchase User': ['procurement'],
  'Stock User': ['warehouse'],
  'Accounts User': ['finance'],
  'Site Engineer': ['site'],
  Technician: ['site'],
  'Service User': ['service'],
  'HR User': ['hr'],
}

// access level → allowed actions
export const levelActions = {
  'View Only': ['read'],
  Create: ['read', 'create'],
  Edit: ['read', 'create', 'update'],
  Approval: ['read', 'create', 'update', 'approve'],
  'Full Admin': ['read', 'create', 'update', 'delete', 'approve'],
}

export function canAccessPanel(role, panel) {
  const panels = rolePanels[role] || []
  return panels.includes('*') || panels.includes(panel)
}

export function canDoAction(accessLevel, action) {
  return (levelActions[accessLevel] || ['read']).includes(action)
}

// fields only Management may see (Sales must never see cost/GP — Sales rules #4, #5, #20)
export const restrictedFields = ['cost', 'cost_amount', 'gp_percent', 'gross_profit', 'supplier_price', 'landed_cost', 'calculated_sale_price', 'budget_cost', 'committed_cost', 'margin', 'markup', 'avg_cost', 'valuation_rate', 'last_purchase_rate', 'exchange_factor', 'price_factor', 'add_margin_pct', 'special_offer_pct']
export function isManagement(role) {
  return role === 'Management' || role === 'System Admin'
}
