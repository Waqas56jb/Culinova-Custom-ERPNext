// CULINOVA — Admin console config (lists/matrix are configuration, not mock data).
export const accessLevels = ['View Only', 'Create', 'Edit', 'Approval', 'Full Admin']

export const roles = [
  'Management', 'Sales User', 'Sales Manager', 'Project Manager', 'Purchase User',
  'Stock User', 'Accounts User', 'Site Engineer', 'Technician', 'Service User', 'HR User', 'System Admin',
]

export const departments = ['Management', 'Sales', 'Projects', 'Procurement', 'Warehouse', 'Finance', 'Site', 'Service', 'HR']

// 12 panels for the access matrix
export const panels = [
  'Admin / Management', 'Sales & Estimation', 'Project Management', 'Procurement', 'Warehouse / Stock',
  'Finance & Accounting', 'Site Execution', 'Service & Maintenance', 'HR & Payroll', 'Customer Portal', 'Supplier Portal', 'Technician Portal',
]

// default role → panel access matrix (configuration)
export const defaultMatrix = {
  Management: panels.reduce((a, p) => ({ ...a, [p]: true }), {}),
  'Sales User': { 'Sales & Estimation': true },
  'Project Manager': { 'Project Management': true, Procurement: true, 'Site Execution': true },
  'Purchase User': { Procurement: true },
  'Stock User': { 'Warehouse / Stock': true },
  'Accounts User': { 'Finance & Accounting': true },
  'Site Engineer': { 'Site Execution': true },
  Technician: { 'Technician Portal': true, 'Site Execution': true },
  'Service User': { 'Service & Maintenance': true },
  'HR User': { 'HR & Payroll': true },
}

export const sar = (n) => 'SAR ' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })

// Executive metrics / module tiles — live aggregation TBD (no mock data).
export const company = { revenue: 0, netProfit: 0, receivables: 0, payables: 0, activeProjects: 0, totalProjects: 0, stockValue: 0, procurementSpend: 0, employees: 0, openTickets: 0 }
export const revenueTrend = []
export const moduleStats = []
export const adminProjects = []
