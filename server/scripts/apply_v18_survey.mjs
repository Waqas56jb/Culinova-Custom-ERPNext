import dotenv from 'dotenv'
import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const raw = process.env.DATABASE_URL
const urls = [raw, raw.replace(':6543/', ':5432/')]
let lastErr = null

for (const connectionString of urls) {
  const port = connectionString.includes(':6543/') ? '6543' : (connectionString.includes(':5432/') ? '5432' : '?')
  const c = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })
  try {
    await c.connect()
    console.log('connected port', port)
    const sql = fs.readFileSync(path.resolve(__dirname, '../db/migrations_v18_survey.sql'), 'utf8')
    await c.query('begin')
    await c.query(sql)
    await c.query("insert into erp_migrations(name) values ($1) on conflict (name) do nothing", ['migrations_v18_survey.sql'])
    await c.query('commit')
    await c.query("notify pgrst, 'reload schema'")
    console.log('OK migrations_v18_survey applied')
    await c.end()
    lastErr = null
    break
  } catch (e) {
    lastErr = e
    console.log('fail port', port, e.message)
    try { await c.end() } catch {}
  }
}

if (lastErr) {
  console.error(lastErr.message)
  process.exit(1)
}
