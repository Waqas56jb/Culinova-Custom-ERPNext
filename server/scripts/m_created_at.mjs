// FIX: 5 tables were missing created_at → generic CRUD ordered by created_at → 500 → pages rendered empty.
// Adds created_at (defaulting to now) so list endpoints work AND the date fields populate.
import pg from 'pg'
const c = new pg.Client({ host: 'aws-1-ap-southeast-2.pooler.supabase.com', port: 5432, user: 'postgres.bliwbbhfujxsbquinydr', password: '20Pakistan1000!', database: 'postgres', ssl: { rejectUnauthorized: false } })
await c.connect()
for (const t of ['warehouses', 'commissioning_tests', 'maintenance_visits', 'service_contracts', 'leave_requests']) {
  await c.query(`alter table ${t} add column if not exists created_at timestamptz default now();`)
  await c.query(`update ${t} set created_at = now() where created_at is null;`)
  console.log('  ✓', t, '— created_at added')
}
await c.query(`notify pgrst, 'reload schema';`)
console.log('done.')
await c.end()
