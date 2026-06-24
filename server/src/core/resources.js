// Config-driven resources → instant REST API + RBAC for every panel.
// { table, panel, orderBy }
export const resources = {
  // sales
  customers: { table: 'customers', panel: 'sales' },
  leads: { table: 'leads', panel: 'sales' },
  opportunities: { table: 'opportunities', panel: 'sales' },
  'sales-orders': { table: 'sales_orders', panel: 'sales' },
  interactions: { table: 'customer_interactions', panel: 'sales' },
  // projects
  projects: { table: 'projects', panel: 'projects' },
  'project-boq': { table: 'project_boq', panel: 'projects', orderBy: 'id' },
  'project-tasks': { table: 'project_tasks', panel: 'projects', orderBy: 'id' },
  variations: { table: 'variation_orders', panel: 'projects', orderBy: 'id' },
  // procurement
  suppliers: { table: 'suppliers', panel: 'procurement' },
  rfqs: { table: 'rfqs', panel: 'procurement' },
  'purchase-orders': { table: 'purchase_orders', panel: 'procurement' },
  // warehouse
  items: { table: 'items', panel: 'warehouse' },
  warehouses: { table: 'warehouses', panel: 'warehouse' },
  stock: { table: 'stock_balances', panel: 'warehouse', orderBy: 'id' },
  'delivery-notes': { table: 'delivery_notes', panel: 'warehouse' },
  // finance
  invoices: { table: 'invoices', panel: 'finance' },
  payments: { table: 'payments', panel: 'finance' },
  payables: { table: 'payables', panel: 'finance' },
  // site
  snags: { table: 'snags', panel: 'site' },
  commissioning: { table: 'commissioning_tests', panel: 'site' },
  // service
  'service-tickets': { table: 'service_tickets', panel: 'service' },
  'maintenance-visits': { table: 'maintenance_visits', panel: 'service' },
  'service-contracts': { table: 'service_contracts', panel: 'service' },
  // hr
  employees: { table: 'employees', panel: 'hr' },
  leaves: { table: 'leave_requests', panel: 'hr' },
  payroll: { table: 'payroll_runs', panel: 'hr' },
  // admin  (users handled by a dedicated secure module — see modules/users)
  'audit-log': { table: 'audit_log', panel: 'admin' },
}
