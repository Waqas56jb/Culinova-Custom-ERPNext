-- ============================================================================
-- CRM & Quotation — Feedback Round 1
-- Run once against the ERP Supabase project (SQL editor, or psql with DATABASE_URL).
-- Every statement is idempotent, so re-running is safe.
-- ============================================================================

-- ── (3) Customer activities inside an Opportunity ───────────────────────────
-- customer_interactions already exists as the meeting log. It was keyed only by customer NAME,
-- so an activity could not be attached to the opportunity (or lead) it belongs to. These columns
-- give it that link while keeping the existing customer-level history working.
alter table customer_interactions add column if not exists opportunity_id uuid references opportunities(id) on delete cascade;
alter table customer_interactions add column if not exists lead_id        uuid references leads(id) on delete cascade;
alter table customer_interactions add column if not exists subject        text;
alter table customer_interactions add column if not exists occurred_at    timestamptz default now();
alter table customer_interactions add column if not exists direction      text;   -- Incoming / Outgoing (calls)
alter table customer_interactions add column if not exists outcome        text;   -- free text result of the contact

create index if not exists ci_opportunity_idx on customer_interactions(opportunity_id);
create index if not exists ci_lead_idx        on customer_interactions(lead_id);
create index if not exists ci_occurred_idx    on customer_interactions(occurred_at desc);

-- ── (5) Brand Master pricing factors ───────────────────────────────────────
-- brands already carries exchange_factor and price_factor. The pricing chain in
-- core/itempricing.js also expects an added margin and a special-offer discount, which had no
-- home on the master — so they could never be "configured in the Brand Master" as specified.
alter table brands add column if not exists add_margin_pct     numeric default 0;
alter table brands add column if not exists special_offer_pct  numeric default 0;

-- Estimated vs actual, recorded per quotation line so the Brand Master factors can be reviewed
-- against what the item really cost once purchased.
alter table quotation_items add column if not exists estimated_cost numeric;
alter table quotation_items add column if not exists pricing_basis  text;   -- how the estimate was derived

comment on column brands.add_margin_pct is
  'Added margin % applied after the price factor, per Brand Master.';
comment on column brands.special_offer_pct is
  'Special offer discount % applied last, per Brand Master.';
comment on column quotation_items.estimated_cost is
  'Cost estimated at quotation time, for later comparison against actual landed cost.';
comment on column quotation_items.pricing_basis is
  'Which inputs produced the estimate (valuation rate / supplier price / manual).';
