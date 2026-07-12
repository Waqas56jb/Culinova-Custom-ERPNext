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

// An internal staff user = a role that has at least one panel. External roles (portal Customers) have
// none. Shared cross-panel reads (Item Master, Company Settings masters) are open to every INTERNAL
// role but must not be enumerable by a Customer.
export function isInternal(role) {
  const panels = rolePanels[role] || []
  return panels.length > 0
}

export function canDoAction(accessLevel, action) {
  return (levelActions[accessLevel] || ['read']).includes(action)
}

// ── FINANCIAL VISIBILITY ─────────────────────────────────────────────────────
// Owner's rule: cost / profit / margin / supplier price are HIDDEN from Sales and Engineering.
// Only Management, Operations and Finance see financials. Operations = the roles that actually buy,
// store and deliver the goods — they cannot do their job without a cost (a Purchase User must be able
// to compare supplier quotes; Finance must be able to see cost to invoice).
export const financialRoles = [
  'Management', 'System Admin',        // management
  'Accounts User',                     // finance
  'Purchase User', 'Stock User', 'Project Manager', // operations
]
export function canSeeFinancials(role) {
  return financialRoles.includes(role)
}

// Fields hidden from everyone outside financialRoles (Sales rules #4, #5, #20).
export const restrictedFields = [
  // item / pricing chain
  'cost', 'avg_cost', 'supplier_price', 'supplier_cost', 'factory_cost', 'freight_cost', 'insurance_cost',
  'customs_duty', 'local_transport', 'other_landed_cost', 'landed_cost', 'calculated_sale_price',
  'markup_factor', 'exchange_factor', 'price_factor', 'add_margin_pct', 'special_offer_pct',
  'valuation_rate', 'last_purchase_rate',
  // profit
  'gp_percent', 'gross_profit', 'net_profit', 'np_percent', 'margin', 'markup', 'opex_pct',
  // documents
  'cost_amount', 'cost_rate', 'unit_cost', 'total_cost', 'budget_cost', 'committed_cost', 'actual_cost',
  // cost sheet buckets
  'material_cost', 'manufacturing_cost', 'purchase_cost', 'labor_cost', 'installation_cost', 'overhead_cost',
]
export function isManagement(role) {
  return role === 'Management' || role === 'System Admin'
}
