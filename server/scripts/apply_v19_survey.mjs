import dotenv from 'dotenv'
import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()
const sql = fs.readFileSync(path.resolve(__dirname, '../db/migrations_v19_survey_qty.sql'), 'utf8')
const { rows: cnt } = await c.query('select count(*)::int as n from survey_visit_lines')
console.log('survey_visit_lines rows', cnt[0].n)
await c.query('begin')
try {
  await c.query(sql)
  await c.query("insert into erp_migrations(name) values ($1) on conflict (name) do nothing", ['migrations_v19_survey_qty.sql'])
  await c.query('commit')
  await c.query("notify pgrst, 'reload schema'")
  console.log('OK migrations_v19_survey_qty applied')
} catch (e) {
  await c.query('rollback')
  console.error('ROLLED BACK', e.message)
  process.exitCode = 1
}
await c.end()
