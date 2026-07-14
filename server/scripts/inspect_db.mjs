// READ-ONLY inspection of the ERP Supabase database. Counts rows per table.
// Writes NOTHING. Safe to run any time.   node scripts/inspect_db.mjs
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const TABLES = `ai_insights approvals audit_log boq_items boqs brands commercial_terms cost_sheet_lines
cost_sheets currencies customer_addresses customer_contacts customers delivery_notes discount_rules
document_versions documents exchange_rates goods_receipts invoices item_attribute_values item_attributes
item_barcodes item_defaults item_groups item_prices item_pricing_history item_suppliers
item_variant_attributes item_versions items landed_cost_templates leads maintenance_visits messages
notifications numbering_series opportunities party_categories price_list_items product_families
project_boq project_equipment project_tasks projects purchase_orders purchase_requisition_items
purchase_requisitions quotation_items quotation_revisions quotations rfq_items rfq_quotes rfq_suppliers
rfqs sales_orders service_tickets snags stock_adjustments stock_balances stock_ledger stock_reservations
stock_transfers supplier_price_lists suppliers system_settings uoms user_preferences users
variation_orders vat_settings warehouses`.split(/\s+/).filter(Boolean)

console.log(`\nERP database: ${process.env.SUPABASE_URL}\n`)
for (const t of TABLES) {
  const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true })
  console.log(`  ${String(error ? 'MISSING' : count).padStart(8)}  ${t}${error ? `  (${error.message})` : ''}`)
}
