// Module: Admin panel — generic approval workflow table. Idempotent.
import pg from 'pg'
const c = new pg.Client({ host: 'aws-1-ap-southeast-2.pooler.supabase.com', port: 5432, user: 'postgres.bliwbbhfujxsbquinydr', password: '20Pakistan1000!', database: 'postgres', ssl: { rejectUnauthorized: false } })
await c.connect()
await c.query(`create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null, entity_id text, title text not null, amount numeric,
  requested_by uuid, requested_by_name text, reason text,
  approver_role text default 'Management',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by uuid, decided_by_name text, decision_note text,
  created_at timestamptz default now(), decided_at timestamptz
);`)
await c.query(`create index if not exists approvals_status on approvals(status);`)
await c.query(`notify pgrst, 'reload schema';`)
console.log('approvals table created.')
await c.end()
