// Lead / Opportunity / Quotation workflow — client feedback (Jul 2026).
// Adds project fields, assignment, opportunity linkage, payment templates. Additive + idempotent.
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

console.log('\n######## LEADS V4 MIGRATION ########')

// ── LEADS — project-centric fields ──
await q(`alter table leads
  add column if not exists mobile text,
  add column if not exists email text,
  add column if not exists project_name text,
  add column if not exists project_type text,
  add column if not exists project_city text,
  add column if not exists project_district text,
  add column if not exists project_address text,
  add column if not exists next_follow_up date,
  add column if not exists notes text,
  add column if not exists created_by_id uuid references users(id) on delete set null,
  add column if not exists assigned_to_id uuid references users(id) on delete set null;`, 'leads: project + contact fields')

// ── OPPORTUNITIES — inherit from lead + classification ──
await q(`alter table opportunities
  add column if not exists lead_id uuid references leads(id) on delete set null,
  add column if not exists opportunity_type text default 'Retail Sale',
  add column if not exists project_name text,
  add column if not exists project_type text,
  add column if not exists project_city text,
  add column if not exists project_district text,
  add column if not exists project_location text,
  add column if not exists contact_person text,
  add column if not exists customer_email text,
  add column if not exists mobile text;`, 'opportunities: lead link + project fields')

// ── QUOTATIONS — must link to opportunity ──
await q(`alter table quotations
  add column if not exists opportunity_id uuid references opportunities(id) on delete set null,
  add column if not exists delivery_time text,
  add column if not exists warranty_terms text,
  add column if not exists sales_consultant text,
  add column if not exists sales_consultant_phone text,
  add column if not exists sales_consultant_email text,
  add column if not exists area text,
  add column if not exists language text default 'en';`, 'quotations: opportunity link + PDF fields')

// ── CUSTOMERS — staged registration (CR/VAT before SO) ──
await q(`alter table customers
  add column if not exists cr_number text,
  add column if not exists vat_number text,
  add column if not exists national_address text,
  add column if not exists billing_address text;`, 'customers: staged registration fields')

// ── PAYMENT TERM TEMPLATES (commercial_terms category=Payment) ──
const paymentTemplates = [
  ['100% Advance', 'Payment', '100% Advanced Payment', true],
  ['50% Advance / 50% on Delivery', 'Payment', '50% advance with purchase order, 50% on delivery.', false],
  ['70% Advance / 20% Delivery / 10% Handover', 'Payment', '70% advance, 20% on delivery, 10% on handover.', false],
]
for (const [name, category, body, isDefault] of paymentTemplates) {
  await c.query(
    `insert into commercial_terms (name, category, body, is_default, is_active)
     select $1, $2, $3, $4, true
     where not exists (select 1 from commercial_terms where name = $1)`,
    [name, category, body, isDefault],
  )
}
console.log('  ✓ payment term templates')

// ── DELIVERY / WARRANTY templates for quotation PDF ──
const extraTerms = [
  ['Delivery 5-7 Days', 'Delivery', '5-7 Days After Approval', false],
  ['Two-Year Warranty', 'Warranty', 'Two-years warranty: 1st year covers labor & parts, 2nd year covers labor only (excludes parts). Misuse not covered.', true],
  ['Installation Terms', 'Installation', 'Installation and commissioning as per agreed schedule. Client to provide power, water, and drainage connections.', false],
  ['General Exclusions', 'Exclusions', 'Civil works, MEP connections beyond equipment terminals, and consumables are excluded unless stated.', false],
]
for (const [name, category, body, isDefault] of extraTerms) {
  await c.query(
    `insert into commercial_terms (name, category, body, is_default, is_active)
     select $1, $2, $3, $4, true
     where not exists (select 1 from commercial_terms where name = $1)`,
    [name, category, body, isDefault],
  )
}
console.log('  ✓ delivery / warranty / installation templates')

await q(`notify pgrst, 'reload schema';`, 'PostgREST schema reloaded')
console.log('\n######## LEADS V4 MIGRATION DONE ########\n')
await c.end()
