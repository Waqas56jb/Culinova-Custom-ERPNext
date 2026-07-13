// Leads and Opportunities had no human reference, so the UI was forced to print the raw uuid.
// Give them a real document number (DB-driven numbering series, like every other document) and
// backfill the rows that already exist. Additive + idempotent.
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
console.log('\n######## SALES REFERENCES ########')

for (const [table, docType, prefix] of [['leads', 'Lead', 'LEAD'], ['opportunities', 'Opportunity', 'OPP']]) {
  await c.query(`alter table ${table} add column if not exists number text;`)
  console.log(`  ✓ ${table}.number`)

  // register the numbering series (editable in Company Settings) if it isn't there yet
  await c.query(
    `insert into numbering_series (doc_type, prefix, next_number, padding, include_year, separator, is_active)
     select $1, $2, 1, 6, true, '-', true
     where not exists (select 1 from numbering_series where doc_type = $1)`,
    [docType, prefix]
  )

  // backfill existing rows in creation order, then advance the series past them so the next new
  // document can never collide with a backfilled one
  const { rows: existing } = await c.query(`select id from ${table} where number is null order by created_at asc`)
  if (existing.length) {
    const { rows: s } = await c.query(`select * from numbering_series where doc_type = $1`, [docType])
    const ser = s[0]
    let n = Number(ser.next_number) || 1
    const year = new Date().getFullYear()
    for (const row of existing) {
      const num = `${ser.prefix}${ser.separator}${ser.include_year ? year + ser.separator : ''}${String(n).padStart(ser.padding || 6, '0')}`
      await c.query(`update ${table} set number = $1 where id = $2`, [num, row.id])
      n++
    }
    await c.query(`update numbering_series set next_number = $1 where doc_type = $2`, [n, docType])
    console.log(`  ✓ backfilled ${existing.length} ${table} → series now at ${n}`)
  } else {
    console.log(`  · ${table}: nothing to backfill`)
  }

  // a reference must be unique once assigned
  await c.query(`create unique index if not exists uq_${table}_number on ${table}(number) where number is not null;`)
}

await c.query(`notify pgrst, 'reload schema';`)
console.log('\n######## DONE ########\n')
await c.end()
