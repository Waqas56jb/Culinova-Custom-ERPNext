import dotenv from 'dotenv'
import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()
const sql = fs.readFileSync(path.resolve(__dirname, '../db/migrations_v17_s4b3.sql'), 'utf8')
await c.query(sql)
await c.query("notify pgrst, 'reload schema'")
console.log('OK migrations_v17_s4b3 applied')
await c.end()
