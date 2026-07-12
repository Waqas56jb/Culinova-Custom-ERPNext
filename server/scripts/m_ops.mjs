// Modules: Warehouse ops + Pricing engine + File/Document mgmt + Dashboard preferences. Idempotent + seed.
import pg from 'pg'
const c = new pg.Client({ host: 'aws-1-ap-southeast-2.pooler.supabase.com', port: 5432, user: 'postgres.bliwbbhfujxsbquinydr', password: '20Pakistan1000!', database: 'postgres', ssl: { rejectUnauthorized: false } })
await c.connect()

// ── WAREHOUSE ──
await c.query(`create table if not exists warehouse_locations (
  id uuid primary key default gen_random_uuid(), warehouse_id uuid, warehouse_name text,
  name text not null, code text, type text default 'Bin', is_active boolean default true, created_at timestamptz default now());`)
await c.query(`create table if not exists stock_categories (
  id uuid primary key default gen_random_uuid(), name text not null, code text,
  parent_id uuid references stock_categories(id) on delete set null, is_active boolean default true, created_at timestamptz default now());`)
await c.query(`create table if not exists stock_transfers (
  id uuid primary key default gen_random_uuid(), number text, from_warehouse text, to_warehouse text,
  item_id uuid, item_name text, qty numeric default 0, status text default 'Draft',
  transfer_date date default current_date, notes text, created_by uuid, created_at timestamptz default now());`)
await c.query(`create table if not exists stock_adjustments (
  id uuid primary key default gen_random_uuid(), number text, warehouse text, item_id uuid, item_name text,
  qty_change numeric default 0, type text default 'Add', reason text,
  adjustment_date date default current_date, created_by uuid, created_at timestamptz default now());`)
await c.query(`create table if not exists stock_ledger (
  id uuid primary key default gen_random_uuid(), item_id uuid, item_name text, warehouse text,
  qty_in numeric default 0, qty_out numeric default 0, balance numeric,
  ref_type text, ref_id text, note text, created_at timestamptz default now());`)
await c.query(`create index if not exists stock_ledger_item on stock_ledger(item_id);`)

// ── PRICING ──
await c.query(`create table if not exists price_lists (
  id uuid primary key default gen_random_uuid(), name text not null, currency text default 'SAR',
  type text default 'Selling' check (type in ('Selling','Buying')), is_default boolean default false,
  is_active boolean default true, created_at timestamptz default now());`)
await c.query(`create table if not exists price_list_rates (
  id uuid primary key default gen_random_uuid(), price_list_id uuid references price_lists(id) on delete cascade,
  item_id uuid, item_name text, rate numeric default 0, currency text, created_at timestamptz default now());`)
await c.query(`create index if not exists price_list_rates_pl on price_list_rates(price_list_id);`)
await c.query(`create table if not exists discount_rules (
  id uuid primary key default gen_random_uuid(), name text not null,
  applies_to text default 'Role' check (applies_to in ('Role','Customer Category','Item Group','All')),
  target text, discount_pct numeric default 0, max_discount numeric default 25,
  is_active boolean default true, created_at timestamptz default now());`)

// ── FILES / DOCUMENTS ──
await c.query(`create table if not exists documents (
  id uuid primary key default gen_random_uuid(), name text not null, doc_type text,
  entity_type text, entity_id text, file_url text, mime_type text, size bigint,
  version int default 1, uploaded_by uuid, uploaded_by_name text, notes text, created_at timestamptz default now());`)
await c.query(`create table if not exists document_versions (
  id uuid primary key default gen_random_uuid(), document_id uuid references documents(id) on delete cascade,
  version int not null, file_url text, note text, uploaded_by_name text, created_at timestamptz default now());`)
await c.query(`create index if not exists document_versions_doc on document_versions(document_id);`)

// ── DASHBOARD / PREFERENCES ──
await c.query(`create table if not exists user_preferences (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, pref_key text not null,
  pref_value jsonb, updated_at timestamptz default now(), unique(user_id, pref_key));`)

// ── seeds (editable) ──
const seedIfEmpty = async (table, sql) => { const { rows } = await c.query(`select count(*)::int n from ${table}`); if (rows[0].n === 0) await c.query(sql) }
await seedIfEmpty('stock_categories', `insert into stock_categories (name, code) values ('Cooking Equipment','COOK'),('Refrigeration','REF'),('Stainless Fabrication','SS'),('Spare Parts','SPARE'),('Consumables','CONS')`)
await seedIfEmpty('price_lists', `insert into price_lists (name, currency, type, is_default) values ('Standard Selling','SAR','Selling',true),('Standard Buying','SAR','Buying',false)`)
await seedIfEmpty('discount_rules', `insert into discount_rules (name, applies_to, target, discount_pct, max_discount) values ('Sales User limit','Role','Sales User',10,10),('Sales Manager limit','Role','Sales Manager',20,20),('Management limit','Role','Management',25,25)`)

await c.query(`notify pgrst, 'reload schema';`)
console.log('Ops tables created: warehouse (locations/categories/transfers/adjustments/ledger) + pricing (price_lists/rates/discount_rules) + documents(+versions) + user_preferences. Seeds applied.')
await c.end()
