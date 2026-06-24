import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

const TABLES = [
  'quotation_items', 'quotation_revisions', 'rfq_quotes', 'stock_balances', 'goods_receipts',
  'project_boq', 'project_tasks', 'variation_orders', 'customer_interactions',
  'leads', 'opportunities', 'quotations', 'sales_orders', 'projects', 'suppliers', 'rfqs',
  'purchase_orders', 'items', 'warehouses', 'delivery_notes', 'invoices', 'payments', 'payables',
  'snags', 'commissioning_tests', 'service_contracts', 'service_tickets', 'maintenance_visits',
  'employees', 'leave_requests', 'payroll_runs', 'customers', 'audit_log',
]

for (const t of TABLES) {
  const { error } = await sb.from(t).delete().not('id', 'is', null)
  console.log(`${error ? '❌' : '🧹'} ${t}${error ? ' — ' + error.message : ''}`)
}
// keep ONLY the admin account
const { error: ue } = await sb.from('users').delete().neq('email', 'admin@gmail.com')
console.log(`${ue ? '❌' : '🧹'} users (kept admin@gmail.com)`)

const { count } = await sb.from('users').select('*', { count: 'exact', head: true })
console.log(`\n✅ Clean slate. users remaining = ${count}`)
process.exit(0)
