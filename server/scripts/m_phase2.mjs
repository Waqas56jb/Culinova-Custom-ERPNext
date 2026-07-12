// PHASE 2 schema — EOS integration, Pricing Engine, Cost Engine, RFQ, Quotation, BOQ,
// Procurement, Project Equipment, AI insights. Additive + idempotent: safe to re-run.
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

console.log('\n######## PHASE 2 MIGRATION ########')

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[1] EOS INTEGRATION — version history + engineering-field ownership')
// every ERP item that came from EOS keeps a full snapshot history, so an EOS re-sync is auditable
// and reversible. `source` says who wrote the version (eos-import / eos-sync / erp-edit).
await q(`create table if not exists item_versions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  version int not null default 1,
  source text,
  changed_by uuid,
  change_note text,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);`, 'item_versions')
await q(`create index if not exists idx_item_versions_item on item_versions(item_id, version desc);`)
await q(`alter table items
  add column if not exists eos_version int default 0,
  add column if not exists eos_last_hash text,
  add column if not exists eos_status text;`, 'items.eos_version / eos_last_hash / eos_status')
// one ERP item per EOS entry — the database itself refuses a duplicate import
await q(`create unique index if not exists uq_items_eos_entry on items(eos_entry_id) where eos_entry_id is not null;`, 'unique index: no duplicate EOS import')

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[2] PRICING ENGINE — landed-cost chain + FX')
await q(`alter table items
  add column if not exists factory_cost numeric default 0,
  add column if not exists freight_cost numeric default 0,
  add column if not exists insurance_cost numeric default 0,
  add column if not exists customs_duty numeric default 0,
  add column if not exists local_transport numeric default 0,
  add column if not exists other_landed_cost numeric default 0,
  add column if not exists landed_template_id uuid,
  add column if not exists markup_factor numeric,
  add column if not exists net_profit numeric default 0,
  add column if not exists np_percent numeric default 0;`, 'items: full landed-cost chain columns')

// a template turns the cost chain into PERCENTAGES of supplier cost, so the owner configures the
// rates once (per origin/brand/incoterm) instead of typing 5 numbers on every item.
await q(`create table if not exists landed_cost_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  freight_pct numeric default 0,
  insurance_pct numeric default 0,
  customs_pct numeric default 0,
  transport_pct numeric default 0,
  other_pct numeric default 0,
  markup_factor numeric default 1.3,
  opex_pct numeric default 0,
  is_default boolean default false,
  is_active boolean default true,
  created_at timestamptz default now()
);`, 'landed_cost_templates')
// opex% turns Gross Profit into Net Profit (overhead absorbed by the sale)
await q(`alter table landed_cost_templates add column if not exists opex_pct numeric default 0;`, 'landed_cost_templates.opex_pct')

// FX history — currencies.exchange_rate holds the CURRENT rate; this holds the audit trail
await q(`create table if not exists exchange_rates (
  id uuid primary key default gen_random_uuid(),
  from_currency text not null,
  to_currency text not null default 'SAR',
  rate numeric not null,
  valid_from date not null default current_date,
  source text default 'manual',
  created_by uuid,
  created_at timestamptz default now()
);`, 'exchange_rates')
await q(`create index if not exists idx_fx_lookup on exchange_rates(from_currency, to_currency, valid_from desc);`)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[3] COST ENGINE')
await q(`create table if not exists cost_sheets (
  id uuid primary key default gen_random_uuid(),
  number text,
  name text,
  project_id uuid references projects(id) on delete set null,
  quotation_id uuid references quotations(id) on delete set null,
  currency text default 'SAR',
  material_cost numeric default 0,
  manufacturing_cost numeric default 0,
  purchase_cost numeric default 0,
  labor_cost numeric default 0,
  installation_cost numeric default 0,
  overhead_pct numeric default 0,
  overhead_cost numeric default 0,
  total_cost numeric default 0,
  revenue numeric default 0,
  gross_profit numeric default 0,
  gp_percent numeric default 0,
  net_profit numeric default 0,
  np_percent numeric default 0,
  status text default 'Draft',
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);`, 'cost_sheets')
await q(`create table if not exists cost_sheet_lines (
  id uuid primary key default gen_random_uuid(),
  cost_sheet_id uuid not null references cost_sheets(id) on delete cascade,
  category text not null,
  description text,
  item_id uuid references items(id) on delete set null,
  qty numeric default 1,
  rate numeric default 0,
  amount numeric default 0,
  created_at timestamptz default now()
);`, 'cost_sheet_lines')
await q(`create index if not exists idx_csl_sheet on cost_sheet_lines(cost_sheet_id);`)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[4] RFQ MANAGEMENT')
await q(`alter table rfqs
  add column if not exists due_date date,
  add column if not exists notes text,
  add column if not exists project_name text,
  add column if not exists sent_at timestamptz,
  add column if not exists awarded_at timestamptz,
  add column if not exists created_by uuid;`, 'rfqs: due_date / notes / sent_at / awarded_at')
// multi-item RFQ (rfqs.item_name stays for the existing single-item rows)
await q(`create table if not exists rfq_items (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid not null references rfqs(id) on delete cascade,
  item_id uuid references items(id) on delete set null,
  item_name text,
  qty numeric default 1,
  uom text,
  specifications text,
  created_at timestamptz default now()
);`, 'rfq_items')
await q(`create index if not exists idx_rfq_items on rfq_items(rfq_id);`)
// who the RFQ was sent to, and whether they responded
await q(`create table if not exists rfq_suppliers (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid not null references rfqs(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete set null,
  supplier text not null,
  email text,
  status text default 'Sent',
  sent_at timestamptz default now(),
  responded_at timestamptz,
  created_at timestamptz default now()
);`, 'rfq_suppliers')
await q(`create unique index if not exists uq_rfq_supplier on rfq_suppliers(rfq_id, supplier);`)
await q(`alter table rfq_quotes
  add column if not exists currency text default 'SAR',
  add column if not exists lead_time_days int,
  add column if not exists validity_days int,
  add column if not exists notes text,
  add column if not exists is_awarded boolean default false,
  add column if not exists received_at timestamptz default now();`, 'rfq_quotes: currency / lead_time / validity / awarded')

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[5] QUOTATION SYSTEM')
// engineering data auto-pulled from EOS at quote time is SNAPSHOTTED on the line, so a later EOS
// change can never silently rewrite a quotation the customer already received.
await q(`alter table quotation_items
  add column if not exists item_id uuid references items(id) on delete set null,
  add column if not exists uom text,
  add column if not exists description text,
  add column if not exists specifications text,
  add column if not exists image_url text,
  add column if not exists datasheet_url text,
  add column if not exists brand text,
  add column if not exists model text,
  add column if not exists discount_pct numeric default 0,
  add column if not exists sort_order int default 0;`, 'quotation_items: EOS spec snapshot columns')
await q(`create table if not exists commercial_terms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text default 'General',
  body text,
  is_default boolean default false,
  is_active boolean default true,
  created_at timestamptz default now()
);`, 'commercial_terms')
await q(`alter table quotations
  add column if not exists terms_text text,
  add column if not exists currency text default 'SAR',
  add column if not exists project_id uuid references projects(id) on delete set null;`, 'quotations: terms_text / currency / project_id')

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[6] BOQ MANAGEMENT')
await q(`create table if not exists boqs (
  id uuid primary key default gen_random_uuid(),
  number text,
  name text,
  project_id uuid references projects(id) on delete set null,
  quotation_id uuid references quotations(id) on delete set null,
  customer text,
  currency text default 'SAR',
  total_cost numeric default 0,
  total_sell numeric default 0,
  gross_profit numeric default 0,
  gp_percent numeric default 0,
  status text default 'Draft',
  notes text,
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);`, 'boqs')
await q(`create table if not exists boq_items (
  id uuid primary key default gen_random_uuid(),
  boq_id uuid not null references boqs(id) on delete cascade,
  group_name text default 'General',
  item_id uuid references items(id) on delete set null,
  item_code text,
  item_name text,
  description text,
  specifications text,
  image_url text,
  uom text default 'Nos',
  qty numeric default 1,
  cost_rate numeric default 0,
  sell_rate numeric default 0,
  cost_amount numeric default 0,
  sell_amount numeric default 0,
  sort_order int default 0,
  created_at timestamptz default now()
);`, 'boq_items')
await q(`create index if not exists idx_boq_items on boq_items(boq_id, sort_order);`)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[7] PROCUREMENT — requisitions + PO depth + supplier performance')
await q(`create table if not exists purchase_requisitions (
  id uuid primary key default gen_random_uuid(),
  number text,
  project_id uuid references projects(id) on delete set null,
  department text,
  requested_by uuid,
  requester_name text,
  required_by date,
  priority text default 'Normal',
  status text default 'Draft',
  notes text,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);`, 'purchase_requisitions')
await q(`create table if not exists purchase_requisition_items (
  id uuid primary key default gen_random_uuid(),
  pr_id uuid not null references purchase_requisitions(id) on delete cascade,
  item_id uuid references items(id) on delete set null,
  item_name text,
  qty numeric default 1,
  uom text,
  est_rate numeric default 0,
  notes text,
  created_at timestamptz default now()
);`, 'purchase_requisition_items')
await q(`create index if not exists idx_pri_pr on purchase_requisition_items(pr_id);`)
await q(`alter table purchase_orders
  add column if not exists pr_id uuid references purchase_requisitions(id) on delete set null,
  add column if not exists rfq_id uuid references rfqs(id) on delete set null,
  add column if not exists supplier_id uuid references suppliers(id) on delete set null,
  add column if not exists currency text default 'SAR',
  add column if not exists expected_date date,
  add column if not exists received_qty numeric default 0,
  add column if not exists rate numeric default 0;`, 'purchase_orders: pr_id / rfq_id / expected_date / received_qty')
await q(`alter table goods_receipts
  add column if not exists warehouse text,
  add column if not exists supplier text,
  add column if not exists received_by uuid,
  add column if not exists condition text default 'Good',
  add column if not exists notes text;`, 'goods_receipts: warehouse / supplier / condition')

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[8] PROJECT EQUIPMENT')
await q(`create table if not exists project_equipment (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  item_id uuid references items(id) on delete set null,
  item_code text,
  item_name text,
  boq_item_id uuid references boq_items(id) on delete set null,
  area text,
  position text,
  qty numeric default 1,
  unit_cost numeric default 0,
  unit_price numeric default 0,
  total_cost numeric default 0,
  total_price numeric default 0,
  delivery_status text default 'Pending',
  installation_status text default 'Pending',
  commissioning_status text default 'Pending',
  warehouse text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);`, 'project_equipment')
await q(`create index if not exists idx_pe_project on project_equipment(project_id);`)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[9] AI BUSINESS INTELLIGENCE')
await q(`create table if not exists ai_insights (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  scope text,
  subject_id text,
  title text,
  body text,
  data jsonb default '{}'::jsonb,
  confidence numeric,
  model text,
  created_by uuid,
  created_at timestamptz default now()
);`, 'ai_insights')
await q(`create index if not exists idx_ai_kind on ai_insights(kind, created_at desc);`)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[10] SEED — numbering series + defaults (only if absent)')
const series = [['Purchase Requisition', 'PR'], ['BOQ', 'BOQ'], ['Cost Sheet', 'CS']]
for (const [docType, prefix] of series) {
  await c.query(
    `insert into numbering_series (doc_type, prefix, next_number, padding, include_year, separator, is_active)
     select $1, $2, 1, 6, true, '-', true
     where not exists (select 1 from numbering_series where doc_type = $1)`,
    [docType, prefix]
  )
}
console.log('  ✓ numbering series: PR / BOQ / CS')

await c.query(`insert into landed_cost_templates (name, freight_pct, insurance_pct, customs_pct, transport_pct, other_pct, markup_factor, is_default, is_active)
  select 'Default Import (EU → KSA)', 6, 1.5, 5, 2, 1, 1.35, true, true
  where not exists (select 1 from landed_cost_templates);`)
await c.query(`insert into landed_cost_templates (name, freight_pct, insurance_pct, customs_pct, transport_pct, other_pct, markup_factor, is_default, is_active)
  select 'Local Purchase (KSA)', 0, 0, 0, 2, 0.5, 1.25, false, true
  where not exists (select 1 from landed_cost_templates where name = 'Local Purchase (KSA)');`)
console.log('  ✓ landed cost templates')

await c.query(`insert into commercial_terms (name, category, body, is_default, is_active)
  select 'Standard Payment Terms', 'Payment', '50% advance with purchase order, 40% before shipment, 10% after commissioning.', true, true
  where not exists (select 1 from commercial_terms where name = 'Standard Payment Terms');`)
await c.query(`insert into commercial_terms (name, category, body, is_default, is_active)
  select 'Standard Delivery Terms', 'Delivery', 'Delivery 8–12 weeks from receipt of confirmed order and advance payment. DDP project site, KSA.', false, true
  where not exists (select 1 from commercial_terms where name = 'Standard Delivery Terms');`)
await c.query(`insert into commercial_terms (name, category, body, is_default, is_active)
  select 'Standard Warranty', 'Warranty', '12 months warranty against manufacturing defects from date of commissioning.', false, true
  where not exists (select 1 from commercial_terms where name = 'Standard Warranty');`)
await c.query(`insert into commercial_terms (name, category, body, is_default, is_active)
  select 'Validity', 'General', 'This quotation is valid for 30 days from the date of issue. Prices are subject to VAT at 15%.', false, true
  where not exists (select 1 from commercial_terms where name = 'Validity');`)
console.log('  ✓ commercial terms')

// seed FX history from whatever currencies are already configured (no hardcoded rate table)
await c.query(`insert into exchange_rates (from_currency, to_currency, rate, valid_from, source)
  select code, 'SAR', exchange_rate, current_date, 'seed'
  from currencies
  where is_active = true and coalesce(is_base, false) = false and exchange_rate is not null
    and not exists (select 1 from exchange_rates e where e.from_currency = currencies.code)`)
const { rows: fx } = await c.query(`select count(*)::int n from exchange_rates`)
console.log(`  ✓ exchange_rates seeded from currencies (${fx[0].n} rows)`)

await q(`notify pgrst, 'reload schema';`, 'PostgREST schema reloaded')

const { rows: t } = await c.query(`select count(*)::int n from information_schema.tables where table_schema='public'`)
console.log(`\n######## PHASE 2 MIGRATION DONE — ${t[0].n} tables ########\n`)
await c.end()
