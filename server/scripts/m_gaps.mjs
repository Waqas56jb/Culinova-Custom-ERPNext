// Gap fixes: Units of Measure master. Idempotent + seed.
import pg from 'pg'
const c = new pg.Client({ host: 'aws-1-ap-southeast-2.pooler.supabase.com', port: 5432, user: 'postgres.bliwbbhfujxsbquinydr', password: '20Pakistan1000!', database: 'postgres', ssl: { rejectUnauthorized: false } })
await c.connect()
await c.query(`create table if not exists uoms (
  id uuid primary key default gen_random_uuid(), name text unique not null, symbol text,
  is_active boolean default true, created_at timestamptz default now());`)
const { rows } = await c.query('select count(*)::int n from uoms')
if (rows[0].n === 0) {
  await c.query(`insert into uoms (name, symbol) values
    ('Nos','Nos'),('Piece','pc'),('Set','set'),('Pair','pr'),('Box','box'),('Kilogram','kg'),
    ('Gram','g'),('Litre','L'),('Metre','m'),('Square Metre','m²'),('Unit','unit'),('Roll','roll'),('Pack','pack')`)
}
await c.query(`notify pgrst, 'reload schema';`)
console.log('uoms master created + seeded.')
await c.end()
