/** S5B1 T4 — hygiene report (list + optional clean). Shared DB = prod data. */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })
const CLEAN = process.argv.includes('--clean')

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
await c.connect()

console.log('\n=== TBS.110 Active reservations ===')
const res = await c.query(`
  select sr.id, sr.status, sr.qty, sr.short_qty, sr.created_at, i.item_code, i.model, i.item_name
  from stock_reservations sr
  join items i on i.id = sr.item_id
  where (i.model ilike '%TBS.110%' or i.item_name ilike '%TBS.110%')
    and coalesce(sr.status,'Active') in ('Active','active','Reserved','reserved')
  order by sr.created_at desc
`)
console.table(res.rows)
console.log(`count=${res.rowCount}`)

if (CLEAN && res.rowCount) {
  const ids = res.rows.map((r) => r.id)
  const u = await c.query(
    `update stock_reservations set status='Released', updated_at=now() where id = any($1::uuid[]) returning id`,
    [ids],
  )
  console.log(`Released ${u.rowCount} TBS.110 reservations`)
}

console.log('\n=== Test-tagged quotations (candidates) ===')
const q = await c.query(`
  select id, number, status, customer, left(coalesce(notes,''), 80) as notes
  from quotations
  where number in ('QTN-2026-000181')
     or coalesce(notes,'') ilike '%test%'
     or coalesce(notes,'') ilike '%[S2%'
     or coalesce(notes,'') ilike '%[S3%'
     or coalesce(notes,'') ilike '%[S4%'
     or coalesce(number,'') ilike '%TEST%'
  order by number
  limit 40
`)
console.table(q.rows)

if (CLEAN) {
  const lost = await c.query(`
    update quotations
    set status='Lost',
        lost_reason=coalesce(nullif(lost_reason,''), 'S5B1 hygiene — test artifact')
    where status not in ('Ordered','Lost','Cancelled')
      and (
        number = 'QTN-2026-000181'
        or coalesce(notes,'') ilike '%[S2B1-TEST]%'
        or coalesce(notes,'') ilike '%[S3%'
        or coalesce(notes,'') ilike '%[S4%'
      )
    returning number, status
  `)
  console.log('Marked Lost:', lost.rows)
}

console.log('\n=== Top 20 Active items with VR=0 / null (demo risk) ===')
const z = await c.query(`
  select item_code, model, item_name, brand, category,
         coalesce(valuation_rate,0) as vr,
         coalesce(selling_price, 0) as sell
  from items
  where coalesce(disabled,false)=false
    and coalesce(valuation_rate,0)=0
  order by item_name
  limit 20
`)
console.table(z.rows)

await c.end()
