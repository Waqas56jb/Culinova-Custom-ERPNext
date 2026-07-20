// CRM & Quotation — Feedback Round 1 (Jul 2026).
// Applies db/migrations_v4.sql: activity linking, Brand Master margin factors, quotation estimate.
// Additive + idempotent — safe to re-run.
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

console.log('\n######## CRM V4 MIGRATION ########')

// ── (3) Customer activities linked to an Opportunity / Lead ──
await q(`alter table customer_interactions
  add column if not exists opportunity_id uuid references opportunities(id) on delete cascade,
  add column if not exists lead_id        uuid references leads(id) on delete cascade,
  add column if not exists subject        text,
  add column if not exists occurred_at    timestamptz default now(),
  add column if not exists direction      text,
  add column if not exists outcome        text;`, 'customer_interactions: opportunity/lead link + fields')

await q(`create index if not exists ci_opportunity_idx on customer_interactions(opportunity_id);`, 'index: ci_opportunity')
await q(`create index if not exists ci_lead_idx        on customer_interactions(lead_id);`, 'index: ci_lead')
await q(`create index if not exists ci_occurred_idx    on customer_interactions(occurred_at desc);`, 'index: ci_occurred')

// ── (5) Brand Master pricing factors ──
await q(`alter table brands
  add column if not exists add_margin_pct     numeric default 0,
  add column if not exists special_offer_pct  numeric default 0;`, 'brands: add_margin_pct + special_offer_pct')

// ── (5) Estimated cost recorded per quotation line (for later actual comparison) ──
await q(`alter table quotation_items
  add column if not exists estimated_cost numeric,
  add column if not exists pricing_basis  text;`, 'quotation_items: estimated_cost + pricing_basis')

await q(`notify pgrst, 'reload schema';`, 'PostgREST schema reloaded')
console.log('\n######## CRM V4 MIGRATION DONE ########\n')
await c.end()
