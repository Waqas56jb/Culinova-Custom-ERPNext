// Engineering Request attachments (feedback #3).
// Adds an attachments jsonb column: [{ category, name, path }]. Additive + idempotent.
import pg from 'pg'

const c = new pg.Client({
  host: 'aws-1-ap-southeast-2.pooler.supabase.com',
  port: 5432,
  user: 'postgres.bliwbbhfujxsbquinydr',
  password: '20Pakistan1000!',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
console.log('\n######## ENGINEERING ATTACHMENTS MIGRATION ########')
await c.query(`alter table engineering_requests add column if not exists attachments jsonb not null default '[]'::jsonb;`)
console.log('  ✓ engineering_requests.attachments')
await c.query(`comment on column engineering_requests.attachments is 'Uploaded supporting files: [{ category, name, path }] — BOQ, Drawings, Client Specifications, Site Photos, Layouts.';`)
console.log('  ✓ comment')
await c.query(`notify pgrst, 'reload schema';`)
console.log('  ✓ PostgREST schema reloaded\n######## DONE ########\n')
await c.end()
