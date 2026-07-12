// Module: Company Settings — foundational master data (company, branches, departments,
// currencies, VAT, numbering series). Idempotent. Seeds sensible KSA defaults (editable in UI).
import pg from 'pg'
const c = new pg.Client({ host: 'aws-1-ap-southeast-2.pooler.supabase.com', port: 5432, user: 'postgres.bliwbbhfujxsbquinydr', password: '20Pakistan1000!', database: 'postgres', ssl: { rejectUnauthorized: false } })
await c.connect()

await c.query(`create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null, legal_name text, vat_number text, cr_number text,
  address text, city text, country text default 'Saudi Arabia',
  phone text, email text, website text, logo_url text,
  base_currency text default 'SAR', fiscal_year_start text default '01-01',
  is_default boolean default false, created_at timestamptz default now(), updated_at timestamptz default now()
);`)

await c.query(`create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  name text not null, code text, address text, city text, phone text, manager text,
  is_active boolean default true, created_at timestamptz default now()
);`)

await c.query(`create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  name text not null, code text, parent_id uuid references departments(id) on delete set null,
  head text, is_active boolean default true, created_at timestamptz default now()
);`)

await c.query(`create table if not exists currencies (
  id uuid primary key default gen_random_uuid(),
  code text unique not null, name text, symbol text,
  exchange_rate numeric default 1,   -- units of this currency per 1 base currency
  is_base boolean default false, is_active boolean default true,
  updated_at timestamptz default now(), created_at timestamptz default now()
);`)

await c.query(`create table if not exists vat_settings (
  id uuid primary key default gen_random_uuid(),
  name text not null, rate numeric default 15, account text, region text default 'KSA',
  is_default boolean default false, is_active boolean default true, created_at timestamptz default now()
);`)

await c.query(`create table if not exists numbering_series (
  id uuid primary key default gen_random_uuid(),
  doc_type text unique not null, prefix text not null, next_number int default 1,
  padding int default 6, include_year boolean default true, separator text default '-',
  is_active boolean default true, created_at timestamptz default now()
);`)

// ── seed defaults only if empty (editable afterwards; NOT hardcoded in app code) ──
const { rows: co } = await c.query('select count(*)::int n from companies')
if (co[0].n === 0) {
  await c.query(`insert into companies (name, legal_name, country, base_currency, is_default, vat_number)
    values ('Culinova', 'Culinova Commercial Kitchens', 'Saudi Arabia', 'SAR', true, '')`)
}
const { rows: cur } = await c.query('select count(*)::int n from currencies')
if (cur[0].n === 0) {
  await c.query(`insert into currencies (code, name, symbol, exchange_rate, is_base, is_active) values
    ('SAR','Saudi Riyal','SR',1,true,true),
    ('USD','US Dollar','$',3.75,false,true),
    ('EUR','Euro','€',4.35,false,true),
    ('AED','UAE Dirham','د.إ',1.02,false,true)`)
}
const { rows: vat } = await c.query('select count(*)::int n from vat_settings')
if (vat[0].n === 0) {
  await c.query(`insert into vat_settings (name, rate, region, is_default, is_active) values ('KSA Standard VAT', 15, 'KSA', true, true)`)
}
const { rows: dep } = await c.query('select count(*)::int n from departments')
if (dep[0].n === 0) {
  await c.query(`insert into departments (name, code) values ('Management','MGT'),('Sales','SAL'),('Procurement','PRC'),('Warehouse','WH'),('Projects','PRJ'),('Finance','FIN'),('Service','SVC'),('HR','HR')`)
}
const { rows: ns } = await c.query('select count(*)::int n from numbering_series')
if (ns[0].n === 0) {
  await c.query(`insert into numbering_series (doc_type, prefix, next_number) values
    ('Quotation','QTN',1),('Sales Order','SO',1),('Invoice','INV',1),('Purchase Order','PO',1),
    ('RFQ','RFQ',1),('Delivery Note','DN',1),('Goods Receipt','GRN',1),('Project','PRJ',1),
    ('Item','ITM',1),('Payment','PMT',1)`)
}

await c.query(`notify pgrst, 'reload schema';`)
console.log('Company Settings tables created + defaults seeded (companies, branches, departments, currencies, vat_settings, numbering_series).')
await c.end()
