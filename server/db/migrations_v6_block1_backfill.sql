-- Backfill factors_pending for brands already linked to EOS items (pre-Block-1 imports).
update brands b
set factors_pending = true
where factors_pending = false
  and coalesce(exchange_factor, 1) = 1
  and coalesce(price_factor, 1) = 1
  and exists (
    select 1 from items i
    where lower(trim(i.brand)) = lower(trim(b.brand))
      and i.eos_entry_id is not null
  );
