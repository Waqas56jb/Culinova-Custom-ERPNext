// Add item_code + pos to quotation_items — PDF POS / Item Code columns. Idempotent.
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
console.log('\n######## QUOTATION LINE POS + ITEM_CODE ########\n')

await c.query(`
  alter table quotation_items
    add column if not exists item_code text,
    add column if not exists pos text;
`)
console.log('  ✓ quotation_items.item_code, quotation_items.pos')

await c.query(`
  update quotation_items qi
  set item_code = coalesce(nullif(qi.item_code, ''), i.item_code, i.code)
  from items i
  where qi.item_id = i.id and (qi.item_code is null or qi.item_code = '');
`)
console.log('  ✓ backfilled item_code from items')

await c.end()
console.log('\nDone.\n')
