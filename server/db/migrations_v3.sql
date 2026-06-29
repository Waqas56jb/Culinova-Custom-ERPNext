-- ============================================================
-- CULINOVA ERP — v3 MIGRATIONS  (Item Master 2.0 — Ali's spec)
-- Brand factors · Product Families · Supplier Price Lists · Pricing engine fields
-- Idempotent — safe to re-run. Run after migrations_v2.sql.
-- ============================================================

-- (4) Brand factors — items inherit currency / exchange / price factor
alter table brands add column if not exists currency        text default 'SAR';
alter table brands add column if not exists exchange_factor numeric default 1;
alter table brands add column if not exists price_factor    numeric default 1;

-- (2) Product Family master (comparison / alternatives / quotation selection)
create table if not exists product_families (
  id uuid primary key default gen_random_uuid(),
  name text unique not null, category text, sub_category text,
  datasheet_url text, image_url text, specs text, created_at timestamptz default now());

-- (5) Supplier Price Lists — separate from Item Master, Excel import
create table if not exists supplier_price_lists (
  id uuid primary key default gen_random_uuid(),
  name text, brand text, currency text, year text, created_at timestamptz default now());
create table if not exists price_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid references supplier_price_lists(id) on delete cascade,
  brand text, model text, supplier_price numeric, created_at timestamptz default now());
create index if not exists idx_pli_brand_model on price_list_items (lower(brand), lower(model));

-- (7) Pricing history
create table if not exists item_pricing_history (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references items(id) on delete cascade,
  brand text, model text, cost numeric, selling_price numeric, source text,
  created_by uuid references users(id), created_at timestamptz default now());

-- Item 2.0 product + pricing fields
alter table items add column if not exists product_family text;
alter table items add column if not exists category       text;   -- Equipment | Custom Fabrication
alter table items add column if not exists sub_category   text;
alter table items add column if not exists supplier_price numeric;
alter table items add column if not exists landed_cost    numeric;
alter table items add column if not exists selling_price  numeric;
alter table items add column if not exists gp_percent     numeric;
alter table items add column if not exists eta_days       int;
