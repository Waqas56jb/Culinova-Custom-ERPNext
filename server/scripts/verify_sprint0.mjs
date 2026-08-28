// Sprint 0 verification — read-only schema checks + integration status endpoint.
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'
import jwt from 'jsonwebtoken'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const API_BASE = (process.env.BASE || `http://localhost:${process.env.PORT || 5050}/api`).replace(/\/$/, '')
const DATABASE_URL = process.env.DATABASE_URL
const JWT_SECRET = process.env.JWT_SECRET

const results = []
const pass = (name, ok, detail = '') => results.push({ name, ok, detail })
const line = (r) => `  ${r.ok ? '✓ PASS' : '✗ FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`

// ── schema checks (pg + information_schema) ─────────────────────────────────
if (DATABASE_URL) {
  const c = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })
  try {
    await c.connect()

    const col = async (table, column) => {
      const { rows } = await c.query(
        `select 1 from information_schema.columns
         where table_schema = 'public' and table_name = $1 and column_name = $2`,
        [table, column],
      )
      return rows.length > 0
    }

    pass('quotations.discount_fixed column', await col('quotations', 'discount_fixed'))

    const { rows: tbl } = await c.query(
      `select 1 from information_schema.tables where table_schema = 'public' and table_name = 'stock_ledger'`,
    )
    pass('stock_ledger table exists', tbl.length > 0)

    pass('brands.country_of_origin column', await col('brands', 'country_of_origin'))
    pass('brands.country_of_purchase column', await col('brands', 'country_of_purchase'))

    const { rows: idx } = await c.query(
      `select 1 from pg_indexes where schemaname = 'public' and indexname = 'uq_items_brand_model'`,
    )
    const indexExists = idx.length > 0
    if (indexExists) {
      pass('uq_items_brand_model index', true)
    } else {
      const { rows: dups } = await c.query(`
        select lower(brand) as brand, lower(model) as model, count(*)::int as cnt,
               array_agg(item_code order by item_code) as item_codes
        from items
        where brand is not null and model is not null and (disabled is not true)
        group by lower(brand), lower(model)
        having count(*) > 1
      `)
      if (dups.length === 0) {
        pass('uq_items_brand_model index', false, 'index missing but no duplicates — run npm run migrate')
      } else {
        pass('uq_items_brand_model index', false, `skipped — ${dups.length} duplicate group(s)`)
        console.log('\n  Blocking duplicates (brand / model / count / item_codes):')
        for (const d of dups) {
          console.log(`    · ${d.brand} / ${d.model}  (${d.cnt})  ${(d.item_codes || []).join(', ')}`)
        }
      }
    }
  } catch (e) {
    pass('database schema checks', false, e.message)
  } finally {
    await c.end().catch(() => {})
  }
} else {
  pass('database schema checks', false, 'DATABASE_URL not set in server/.env')
}

// ── integration status endpoint ─────────────────────────────────────────────
try {
  let token = null
  if (JWT_SECRET && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    const { data: mgmt } = await supabase.from('users').select('id, name, email, role, access_level')
      .in('role', ['Management', 'System Admin']).limit(1).maybeSingle()
    if (mgmt) {
      token = jwt.sign(
        { id: mgmt.id, name: mgmt.name, email: mgmt.email, role: mgmt.role, access_level: mgmt.access_level },
        JWT_SECRET,
        { expiresIn: '1h' },
      )
    }
  }

  if (!token) {
    pass('GET /api/integrations/eos/status', false, 'no Management user / JWT_SECRET for auth')
  } else {
    const res = await fetch(`${API_BASE}/integrations/eos/status`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const body = await res.json().catch(() => ({}))
    if (res.ok) {
      pass('GET /api/integrations/eos/status', true, JSON.stringify(body))
      console.log('\n  Integration status response:')
      console.log('   ', JSON.stringify(body, null, 2).split('\n').join('\n    '))
    } else {
      pass('GET /api/integrations/eos/status', false, `HTTP ${res.status}: ${body.error || JSON.stringify(body)}`)
    }
  }
} catch (e) {
  pass('GET /api/integrations/eos/status', false, e.message)
}

// ── summary ─────────────────────────────────────────────────────────────────
console.log('\n######## SPRINT 0 VERIFY ########\n')
for (const r of results) console.log(line(r))
const failed = results.filter((r) => !r.ok).length
console.log(`\n${failed ? '✗' : '✓'} ${results.length - failed}/${results.length} checks passed\n`)
process.exit(failed ? 1 : 0)
