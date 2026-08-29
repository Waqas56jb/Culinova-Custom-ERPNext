-- Sprint 2 Block 2 — stock-first procurement guard metadata
alter table purchase_requisitions
  add column if not exists override_reason text,
  add column if not exists stock_override_by uuid;

alter table purchase_orders
  add column if not exists override_reason text,
  add column if not exists stock_override_by uuid;

comment on column purchase_requisitions.override_reason is 'Management reason when purchasing an in-stock item (stock-first exception)';
comment on column purchase_orders.override_reason is 'Management reason when purchasing an in-stock item (stock-first exception)';

notify pgrst, 'reload schema';
