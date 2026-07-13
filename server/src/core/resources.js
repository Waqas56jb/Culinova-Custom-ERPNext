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
  'project-boq': { table: 'project_boq', panel: 'projects', orderBy: 'id', recomputeProject: true },
  'project-tasks': { table: 'project_tasks', panel: 'projects', orderBy: 'id' },
  variations: { table: 'variation_orders', panel: 'projects', orderBy: 'id', recomputeProject: true },
  // procurement
  suppliers: { table: 'suppliers', panel: 'procurement' },
  rfqs: { table: 'rfqs', panel: 'procurement' },
  // a PO raised against a project re-rolls that project's actual cost; the Stock User (warehouse)
  // must be able to READ pending POs to receive them (readPanels), while writes stay procurement-only.
  'purchase-orders': { table: 'purchase_orders', panel: 'procurement', readPanels: ['procurement', 'warehouse'], recomputeProject: true },
  // warehouse
  // items: handled by the dedicated Item Master module (modules/item) — not generic CRUD
  warehouses: { table: 'warehouses', panel: 'warehouse' },
  // stock_balances is moved ONLY through the stock engine (move_stock RPC + ledger). Direct writes here
  // would desync balance vs ledger, so it is read-only — POST/PATCH/DELETE go through stock.routes.js.
  stock: { table: 'stock_balances', panel: 'warehouse', orderBy: 'id', readOnly: true },
  'delivery-notes': { table: 'delivery_notes', panel: 'warehouse' },
  'warehouse-locations': { table: 'warehouse_locations', panel: 'warehouse' },
  'stock-categories': { table: 'stock_categories', panel: 'warehouse', orderBy: 'name' },
  'stock-transfers': { table: 'stock_transfers', panel: 'warehouse' },
  'stock-adjustments': { table: 'stock_adjustments', panel: 'warehouse' },
  'stock-ledger': { table: 'stock_ledger', panel: 'warehouse', orderBy: 'created_at', readOnly: true },
  // pricing engine — the chain itself lives in core/pricing.js + modules/pricing; these are its masters
  'price-lists': { table: 'price_lists', panel: 'warehouse' },
  'price-list-rates': { table: 'price_list_rates', panel: 'warehouse', orderBy: 'created_at' },
  'discount-rules': { table: 'discount_rules', panel: 'warehouse' },
  'landed-cost-templates': { table: 'landed_cost_templates', panel: 'warehouse' },
  'exchange-rates': { table: 'exchange_rates', panel: 'warehouse', orderBy: 'valid_from' },
  // quotation commercial terms (Phase 2)
  'commercial-terms': { table: 'commercial_terms', panel: 'sales' },
  // item version history — written by the EOS import/sync, never edited by hand
  'item-versions': { table: 'item_versions', panel: 'warehouse', orderBy: 'created_at', readOnly: true },
  // finance — an invoice raised against a project is what makes projects.billed/collected real
  // (nothing used to write those columns, so every project reported 0 billed forever)
  invoices: { table: 'invoices', panel: 'finance', recomputeProject: true },
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
