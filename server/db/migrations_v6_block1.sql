-- ============================================================================
-- Sprint 1a Block 1 — brands.factors_pending (EOS auto-created brands)
-- ============================================================================
alter table brands add column if not exists factors_pending boolean default false;

comment on column brands.factors_pending is
  'True when brand was auto-created by EOS sync with default exchange/price factors (1). Cleared when real factors are set.';
