// Reset the database to a CLEAN state — keeps the schema (tables) and ONLY the admin
// account (admin@gmail.com). Removes every other record + all chat file uploads.
// Run:  node scripts/clean.js
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

// delete order respects foreign keys (children first, then parents)
const ORDER = [
  // children / link tables
  'messages', 'quotation_items', 'quotation_revisions', 'rfq_quotes', 'stock_balances',
  'goods_receipts', 'project_boq', 'project_tasks', 'variation_orders', 'customer_interactions',
  // FK chain: projects → sales_orders → quotations
  'projects', 'sales_orders', 'quotations',
  // everything else
  'leads', 'opportunities', 'suppliers', 'rfqs', 'purchase_orders', 'items', 'warehouses',
  'delivery_notes', 'invoices', 'payments', 'payables', 'snags', 'commissioning_tests',
  'service_contracts', 'service_tickets', 'maintenance_visits', 'employees', 'leave_requests',
  'payroll_runs', 'customers', 'audit_log',
]

for (const t of ORDER) {
  const { error } = await sb.from(t).delete().not('id', 'is', null)
  console.log(`${error ? '❌' : '🧹'} ${t}${error ? ' — ' + error.message : ''}`)
}

// keep ONLY the admin account
const { error: ue } = await sb.from('users').delete().neq('email', 'admin@gmail.com')
console.log(`${ue ? '❌' : '🧹'} users (kept admin@gmail.com)`)

// clear chat file uploads from storage
try {
  const { data: files } = await sb.storage.from('chat-uploads').list('', { limit: 1000 })
  if (files?.length) await sb.storage.from('chat-uploads').remove(files.map((f) => f.name))
  console.log(`🧹 storage chat-uploads (${files?.length || 0} files removed)`)
} catch { /* bucket may not exist */ }

const { count } = await sb.from('users').select('*', { count: 'exact', head: true })
console.log(`\n✅ Clean database. users remaining = ${count} (admin@gmail.com only)`)
process.exit(0)
