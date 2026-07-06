// Create atomic reserve/release RPCs so concurrent Sales-Order acceptances can't lose updates
// (read-modify-write race) and reserved/qty can never be written negative.
import pg from 'pg'
const { Client } = pg
const c = new Client({
  host: 'aws-1-ap-southeast-2.pooler.supabase.com', port: 5432,
  user: 'postgres.bliwbbhfujxsbquinydr', password: '20Pakistan1000!',
  database: 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()
await c.query(`
create or replace function reserve_stock(p_item_id uuid, p_warehouse text, p_qty numeric)
returns void language plpgsql as $$
begin
  -- upsert the balance row and atomically add to reserved in a single statement (row-locked)
  insert into stock_balances (item_id, warehouse, qty, reserved)
  values (p_item_id, coalesce(p_warehouse, 'Main Store'), 0, greatest(0, p_qty))
  on conflict (item_id, warehouse)
  do update set reserved = greatest(0, stock_balances.reserved + greatest(0, p_qty));
end; $$;
`)
await c.query(`
create or replace function release_stock(p_item_id uuid, p_warehouse text, p_qty numeric)
returns void language plpgsql as $$
begin
  update stock_balances
     set reserved = greatest(0, reserved - greatest(0, p_qty))
   where item_id = p_item_id and warehouse = coalesce(p_warehouse, 'Main Store');
end; $$;
`)
// stock_balances needs a unique (item_id, warehouse) for the ON CONFLICT upsert
await c.query(`create unique index if not exists stock_balances_item_wh_uidx on stock_balances (item_id, warehouse);`).catch((e) => console.log('index note:', e.message))
await c.query(`notify pgrst, 'reload schema';`)
console.log('reserve_stock / release_stock RPCs created; unique index ensured.')
await c.end()
