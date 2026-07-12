// Module: Customer & Supplier management enrichment — contacts, addresses, documents child tables
// + a shared party_categories master. Idempotent.
import pg from 'pg'
const c = new pg.Client({ host: 'aws-1-ap-southeast-2.pooler.supabase.com', port: 5432, user: 'postgres.bliwbbhfujxsbquinydr', password: '20Pakistan1000!', database: 'postgres', ssl: { rejectUnauthorized: false } })
await c.connect()

const child = (name, ref) => `create table if not exists ${name} (
  id uuid primary key default gen_random_uuid(),
  ${ref} uuid not null,
  ${name.endsWith('contacts') ? "name text not null, designation text, email text, phone text, is_primary boolean default false" : ''}
  ${name.endsWith('addresses') ? "label text, type text default 'Billing', address text, city text, country text default 'Saudi Arabia', is_primary boolean default false" : ''}
  ${name.endsWith('documents') ? "name text not null, doc_type text, file_url text, notes text, uploaded_at timestamptz default now()" : ''},
  created_at timestamptz default now()
);`

for (const party of ['customer', 'supplier']) {
  const ref = `${party}_id`
  await c.query(child(`${party}_contacts`, ref))
  await c.query(child(`${party}_addresses`, ref))
  await c.query(child(`${party}_documents`, ref))
  await c.query(`create index if not exists ${party}_contacts_ref on ${party}_contacts(${ref});`)
  await c.query(`create index if not exists ${party}_addresses_ref on ${party}_addresses(${ref});`)
  await c.query(`create index if not exists ${party}_documents_ref on ${party}_documents(${ref});`)
}

// shared category master (customer / supplier) — replaces free-text with a managed list
await c.query(`create table if not exists party_categories (
  id uuid primary key default gen_random_uuid(),
  party text not null check (party in ('customer','supplier')),
  name text not null, is_active boolean default true, created_at timestamptz default now(),
  unique(party, name)
);`)
const { rows } = await c.query('select count(*)::int n from party_categories')
if (rows[0].n === 0) {
  await c.query(`insert into party_categories (party, name) values
    ('customer','Hotel'),('customer','Restaurant'),('customer','Catering'),('customer','Hospital'),('customer','Contractor'),
    ('supplier','Equipment'),('supplier','Fabrication'),('supplier','Local'),('supplier','Import')`)
}

await c.query(`notify pgrst, 'reload schema';`)
console.log('Party enrichment tables created: {customer,supplier}_{contacts,addresses,documents} + party_categories seeded.')
await c.end()
