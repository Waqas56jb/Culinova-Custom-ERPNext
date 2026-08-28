-- ============================================================================
-- Sprint 1a Block 2 — brand_audit_log (Ali §12 factor change trail)
-- ============================================================================
create table if not exists brand_audit_log (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid,
  brand_name text,
  field text not null,
  old_value text,
  new_value text,
  changed_by text,
  changed_by_id uuid,
  created_at timestamptz default now()
);

create index if not exists brand_audit_log_brand_id on brand_audit_log (brand_id);
create index if not exists brand_audit_log_created_at on brand_audit_log (created_at desc);

comment on table brand_audit_log is
  'Audit trail for brand master create/update/delete — field-level old/new values with user and timestamp.';
