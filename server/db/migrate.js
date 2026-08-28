/**
 * ERP migration runner — applies additive db/migrations_v*.sql files once, in filename order.
 *
 * Usage:
 *   npm run migrate          → apply pending migrations (normal case)
 *
 * Requires DATABASE_URL in server/.env (Supabase → Project Settings → Database → connection string).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const MIGRATE_LOCK_KEY = 778202

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is missing in server/.env')
  process.exit(1)
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

try {
  console.log('Connecting to database…')
  await client.connect()
  await client.query('select pg_advisory_lock($1)', [MIGRATE_LOCK_KEY])

  await client.query(`
    create table if not exists erp_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
  `)

  const dir = __dirname
  const files = fs.readdirSync(dir)
    .filter((f) => /^migrations_v\d+.*\.sql$/i.test(f))
    .sort()

  const { rows: done } = await client.query('select name from erp_migrations')
  const applied = new Set(done.map((r) => r.name))

  let ran = 0
  for (const f of files) {
    if (applied.has(f)) {
      console.log(`  · ${f} (already applied)`)
      continue
    }
    console.log(`  → applying ${f}…`)
    const sql = fs.readFileSync(path.join(dir, f), 'utf8')
    await client.query('begin')
    try {
      await client.query(sql)
      await client.query('insert into erp_migrations(name) values ($1)', [f])
      await client.query('commit')
      console.log(`    ✔ ${f}`)
      ran++
    } catch (e) {
      await client.query('rollback')
      throw new Error(`${f} failed — rolled back: ${e.message}`)
    }
  }

  console.log(ran ? `\n✔ ${ran} migration(s) applied.` : '\n✔ Nothing to apply — already up to date.')
  await client.query('select pg_advisory_unlock($1)', [MIGRATE_LOCK_KEY])
  await client.end()
  process.exit(0)
} catch (e) {
  console.error('\n✖ MIGRATION FAILED:', e.message)
  try { await client.end() } catch {}
  process.exit(1)
}
