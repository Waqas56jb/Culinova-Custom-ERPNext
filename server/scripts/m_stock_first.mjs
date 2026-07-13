// CEO business rules (14 Jul 2026):
//  R1  A quotation must CONSUME AVAILABLE STOCK FIRST. Only the shortfall may become a purchase.
//      → every quotation line and every project BOQ line records what came from stock and what must
//        still be bought, so Procurement only ever buys the shortfall (not the whole quantity).
//  R2  Items are created ONLY in EOS (created → completed → reviewed → approved), then synced.
//      → no panel may create an item directly in the ERP. Made a DB SETTING (not hardcoded) so the
//        owner can change the policy without a code change.
// Additive + idempotent.
import pg from 'pg'

const c = new pg.Client({
  host: 'aws-1-ap-southeast-2.pooler.supabase.com',
  port: 5432,
  user: 'postgres.bliwbbhfujxsbquinydr',
  password: '20Pakistan1000!',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const q = async (sql, label) => { await c.query(sql); if (label) console.log('  ✓', label) }

console.log('\n######## STOCK-FIRST + EOS-ONLY ########')

// ── R2: the item-creation policy lives in the DB, not in code ────────────────
console.log('\n[1] System settings (policy, editable — not hardcoded)')
await q(`create table if not exists system_settings (
  key text primary key,
  value text,
  description text,
  updated_at timestamptz default now()
);`, 'system_settings')

await c.query(
  `insert into system_settings (key, value, description) values
     ('item_creation_source', 'eos',
      'Where new items may be created. eos = ONLY EOS-approved items sync into the Item Master (no panel may create one directly). erp = the ERP may also create items.'),
     ('eos_auto_sync', 'on',
      'Automatically pull newly-approved EOS items and re-sync linked ones on an interval.'),
     ('eos_auto_sync_minutes', '30',
      'How often the automatic EOS sync runs, in minutes.')
   on conflict (key) do nothing`
)
console.log('  ✓ seeded: item_creation_source=eos · eos_auto_sync=on · every 30 min')

// ── R1: stock-first allocation is recorded on the documents ──────────────────
console.log('\n[2] Stock-first columns — what came FROM STOCK vs what must be BOUGHT')
await q(`alter table quotation_items
  add column if not exists available_qty numeric default 0,
  add column if not exists from_stock numeric default 0,
  add column if not exists to_purchase numeric default 0;`, 'quotation_items.available_qty / from_stock / to_purchase')

await q(`alter table project_boq
  add column if not exists item_id uuid references items(id) on delete set null,
  add column if not exists from_stock numeric default 0,
  add column if not exists to_purchase numeric default 0;`, 'project_boq.item_id / from_stock / to_purchase')

// a requisition line must know how much was already covered by stock, so a reader can see WHY the
// requested quantity is smaller than the quantity sold
await q(`alter table purchase_requisition_items
  add column if not exists sold_qty numeric,
  add column if not exists covered_from_stock numeric default 0;`, 'purchase_requisition_items.sold_qty / covered_from_stock')

// ── backfill: existing lines predate the rule → treat the whole qty as to_purchase (honest:
//    nothing was ever allocated from stock for them)
console.log('\n[3] Backfill existing documents (they predate the rule)')
const { rowCount: qi } = await c.query(
  `update quotation_items set to_purchase = coalesce(qty, 0), from_stock = 0, available_qty = 0
   where to_purchase is null or (to_purchase = 0 and from_stock = 0 and coalesce(qty,0) > 0)`
)
console.log(`  ✓ ${qi} quotation lines marked as to_purchase (no stock was allocated at the time)`)
const { rowCount: pb } = await c.query(
  `update project_boq set to_purchase = coalesce(qty, 0), from_stock = 0
   where to_purchase is null or (to_purchase = 0 and from_stock = 0 and coalesce(qty,0) > 0)`
)
console.log(`  ✓ ${pb} BOQ lines marked as to_purchase`)

await q(`notify pgrst, 'reload schema';`, 'PostgREST schema reloaded')
console.log('\n######## DONE ########\n')
await c.end()
