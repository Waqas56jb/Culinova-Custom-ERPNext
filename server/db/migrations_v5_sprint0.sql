-- ============================================================================
-- CULINOVA ERP — Sprint 0 (production unblock)
-- Schema gaps: discount_fixed, stock_ledger, brands country columns,
-- optional unique index on items(brand, model).
-- Idempotent — safe to re-run.
-- ============================================================================

-- ── 2.1 quotations.discount_fixed ───────────────────────────────────────────
alter table quotations add column if not exists discount_fixed numeric default 0;

comment on column quotations.discount_fixed is
  'Fixed-amount discount (SAR) applied in addition to discount_pct; used by quotation builder.';

-- ── 2.2 stock_ledger (from scripts/m_ops.mjs — exact definition) ───────────
create table if not exists stock_ledger (
  id uuid primary key default gen_random_uuid(), item_id uuid, item_name text, warehouse text,
  qty_in numeric default 0, qty_out numeric default 0, balance numeric,
  ref_type text, ref_id text, note text, created_at timestamptz default now());

create index if not exists stock_ledger_item on stock_ledger(item_id);

-- ── 2.3 brands.country_of_origin / country_of_purchase ──────────────────────
alter table brands add column if not exists country_of_origin  text;
alter table brands add column if not exists country_of_purchase text;

-- ── 2.4 unique index on items(brand, model) — skip if duplicates exist ─────
do $$
declare
  r record;
  dup_groups int := 0;
begin
  for r in
    select lower(brand) as b, lower(model) as m, count(*)::int as cnt,
           array_agg(item_code order by item_code) as codes
    from items
    where brand is not null and model is not null and (disabled is not true)
    group by lower(brand), lower(model)
    having count(*) > 1
  loop
    dup_groups := dup_groups + 1;
    raise warning 'Duplicate brand+model: % / % (count=%, items=%)', r.b, r.m, r.cnt, r.codes;
  end loop;

  if dup_groups > 0 then
    raise warning 'Skipping uq_items_brand_model index creation — % duplicate group(s) found.', dup_groups;
  else
    create unique index if not exists uq_items_brand_model
      on items (lower(brand), lower(model))
      where brand is not null and model is not null and (disabled is not true);
    raise notice 'Created (or already had) uq_items_brand_model index.';
  end if;
end $$;

notify pgrst, 'reload schema';
