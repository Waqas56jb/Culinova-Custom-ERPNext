// Engineering Request workflow — ERP side. Additive + idempotent.
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
const q = async (sql, label) => { await c.query(sql); if (label) console.log('  ✓', label) }

console.log('\n######## ENGINEERING V5 MIGRATION ########')

await q(`create table if not exists engineering_requests (
  id uuid primary key default gen_random_uuid(),
  number text,
  opportunity_id uuid references opportunities(id) on delete set null,
  customer text,
  project_name text,
  project_type text,
  project_location text,
  drawings jsonb default '[]'::jsonb,
  boq_text text,
  sales_notes text,
  required_date date,
  status text not null default 'Pending Engineering Review',
  eos_request_id text,
  eos_project_id uuid,
  approved_items jsonb default '[]'::jsonb,
  owner_id uuid references users(id) on delete set null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);`, 'engineering_requests')

await q(`create index if not exists idx_eng_req_opp on engineering_requests(opportunity_id);`)
await q(`create index if not exists idx_eng_req_status on engineering_requests(status);`)

await c.query(
  `insert into numbering_series (doc_type, prefix, next_number, padding, include_year, separator, is_active)
   select 'Engineering Request', 'ENG', 1, 6, true, '-', true
   where not exists (select 1 from numbering_series where doc_type = 'Engineering Request')`,
)
console.log('  ✓ numbering series ENG')

await q(`notify pgrst, 'reload schema';`, 'PostgREST schema reloaded')
console.log('\n######## ENGINEERING V5 MIGRATION DONE ########\n')
await c.end()
