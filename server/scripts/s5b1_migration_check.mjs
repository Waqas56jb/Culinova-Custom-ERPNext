/** S5B1 — migration applied/missing check (shared Supabase). */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
await c.connect()

const checks = [
  ['v6 brands.factors_pending', `select 1 from information_schema.columns where table_name='brands' and column_name='factors_pending'`],
  ['v7 brand_audit_log', `select 1 from information_schema.tables where table_name='brand_audit_log'`],
  ['v11 stock_reservations.short_qty', `select 1 from information_schema.columns where table_name='stock_reservations' and column_name='short_qty'`],
  ['v12 pr.override_reason', `select 1 from information_schema.columns where table_name='purchase_requisitions' and column_name='override_reason'`],
  ['v12 po.override_reason', `select 1 from information_schema.columns where table_name='purchase_orders' and column_name='override_reason'`],
  ['v17 items.item_source', `select 1 from information_schema.columns where table_name='items' and column_name='item_source'`],
  ['v17 quotations.sent_at', `select 1 from information_schema.columns where table_name='quotations' and column_name='sent_at'`],
  ['v17 product_families.datasheet_url', `select 1 from information_schema.columns where table_name='product_families' and column_name='datasheet_url'`],
  ['v17 setting fabrication_creation', `select 1 from system_settings where key='fabrication_creation'`],
]

console.log('MIGRATION CHECK (shared DB)')
for (const [name, sql] of checks) {
  const r = await c.query(sql)
  console.log(`${r.rowCount > 0 ? 'APPLIED' : 'MISSING'}\t${name}`)
}
await c.end()
