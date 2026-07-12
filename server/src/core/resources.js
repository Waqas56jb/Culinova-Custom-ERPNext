// Config-driven resources → instant REST API + RBAC for every panel.
// { table, panel, orderBy }
export const resources = {
  // sales
  customers: { table: 'customers', panel: 'sales' },
  leads: { table: 'leads', panel: 'sales' },
  opportunities: { table: 'opportunities', panel: 'sales' },
  // sales_orders are created only by the quotation→customer-accept chain — never via blanket CRUD
  'sales-orders': { table: 'sales_orders', panel: 'sales', readOnly: true },
  interactions: { table: 'customer_interactions', panel: 'sales' },
  // projects  — contract_value is financial: only Management may change it
  projects: { table: 'projects', panel: 'projects', protect: ['contract_value', 'budget_cost', 'committed_cost'] },
  'project-boq': { table: 'project_boq', panel: 'projects', orderBy: 'id' },
  'project-tasks': { table: 'project_tasks', panel: 'projects', orderBy: 'id' },
  variations: { table: 'variation_orders', panel: 'projects', orderBy: 'id' },
  // procurement
  suppliers: { table: 'suppliers', panel: 'procurement' },
  rfqs: { table: 'rfqs', panel: 'procurement' },
  'purchase-orders': { table: 'purchase_orders', panel: 'procurement' },
  // warehouse
  // items: handled by the dedicated Item Master module (modules/item) — not generic CRUD
  warehouses: { table: 'warehouses', panel: 'warehouse' },
  stock: { table: 'stock_balances', panel: 'warehouse', orderBy: 'id' },
  'delivery-notes': { table: 'delivery_notes', panel: 'warehouse' },
  'warehouse-locations': { table: 'warehouse_locations', panel: 'warehouse' },
  'stock-categories': { table: 'stock_categories', panel: 'warehouse', orderBy: 'name' },
  'stock-transfers': { table: 'stock_transfers', panel: 'warehouse' },
  'stock-adjustments': { table: 'stock_adjustments', panel: 'warehouse' },
  'stock-ledger': { table: 'stock_ledger', panel: 'warehouse', orderBy: 'created_at', readOnly: true },
  // pricing engine (structure — cost/landing/margin engine wired later)
  'price-lists': { table: 'price_lists', panel: 'warehouse' },
  'price-list-rates': { table: 'price_list_rates', panel: 'warehouse', orderBy: 'created_at' },
  'discount-rules': { table: 'discount_rules', panel: 'warehouse' },
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
