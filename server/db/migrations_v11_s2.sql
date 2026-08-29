-- Sprint 2 Block 1 — stock reservation integrity (G62/G63/G64)
-- Cap reserved ≤ physical; shortfall tracking; Consumed status support.

alter table stock_reservations
  add column if not exists short_qty numeric not null default 0,
  add column if not exists requested_qty numeric;

comment on column stock_reservations.short_qty is 'Qty requested but not reserved (uncapped request shortfall)';
comment on column stock_reservations.requested_qty is 'Original requested reservation qty before capping';

-- Cap reserved so it never exceeds physical qty on the balance row.
-- Returns the actual reserved delta applied (may be < p_qty).
create or replace function reserve_stock(p_item_id uuid, p_warehouse text, p_qty numeric)
returns numeric
language plpgsql
as $$
declare
  v_wh text := coalesce(nullif(trim(p_warehouse), ''), 'Main Store');
  v_req numeric := greatest(0, coalesce(p_qty, 0));
  v_old numeric;
  v_phys numeric;
  v_new numeric;
  v_delta numeric;
begin
  if v_req <= 0 then
    return 0;
  end if;

  insert into stock_balances (item_id, warehouse, qty, reserved)
  values (p_item_id, v_wh, 0, 0)
  on conflict (item_id, warehouse) do nothing;

  select qty, reserved into v_phys, v_old
    from stock_balances
   where item_id = p_item_id and warehouse = v_wh
   for update;

  v_phys := coalesce(v_phys, 0);
  v_old := coalesce(v_old, 0);
  v_new := least(v_phys, v_old + v_req);
  v_delta := greatest(0, v_new - v_old);

  update stock_balances
     set reserved = v_new
   where item_id = p_item_id and warehouse = v_wh;

  return v_delta;
end;
$$;

create or replace function release_stock(p_item_id uuid, p_warehouse text, p_qty numeric)
returns void
language plpgsql
as $$
declare
  v_wh text := coalesce(nullif(trim(p_warehouse), ''), 'Main Store');
begin
  update stock_balances
     set reserved = greatest(0, reserved - greatest(0, coalesce(p_qty, 0)))
   where item_id = p_item_id and warehouse = v_wh;
end;
$$;

notify pgrst, 'reload schema';
