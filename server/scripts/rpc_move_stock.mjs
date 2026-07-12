// Atomic stock movement: qty delta on (item, warehouse). Never goes negative.
import pg from 'pg'
const c = new pg.Client({ host: 'aws-1-ap-southeast-2.pooler.supabase.com', port: 5432, user: 'postgres.bliwbbhfujxsbquinydr', password: '20Pakistan1000!', database: 'postgres', ssl: { rejectUnauthorized: false } })
await c.connect()
await c.query(`
create or replace function move_stock(p_item_id uuid, p_warehouse text, p_qty numeric)
returns numeric language plpgsql as $$
declare new_qty numeric;
begin
  insert into stock_balances (item_id, warehouse, qty, reserved, received_at)
  values (p_item_id, coalesce(p_warehouse,'Main Store'), greatest(0, p_qty), 0, now())
  on conflict (item_id, warehouse)
  do update set qty = greatest(0, stock_balances.qty + p_qty),
                received_at = case when p_qty > 0 then now() else stock_balances.received_at end
  returning qty into new_qty;
  return new_qty;
end; $$;
`)
await c.query(`notify pgrst, 'reload schema';`)
console.log('move_stock RPC created (atomic, never negative).')
await c.end()
