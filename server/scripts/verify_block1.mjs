/**
 * Sprint 1a Block 1 verification — naming, factors_pending, eos_entry_id resolution.
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'
import { env } from '../src/config/env.js'
import { supabase } from '../src/config/supabase.js'
import { eosCatalog, eosDetail, mapEosToItem } from '../src/core/eos.js'
import { buildItemName } from '../src/core/itempricing.js'
import { resolveApprovedItem } from '../src/core/approvedItemsResolve.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const results = []
const pass = (name, ok, detail = '') => results.push({ name, ok, detail })
const clean = (s) => (s == null ? null : String(s).trim() || null)

// ── (a) Item name = Brand + Model + Family on EOS import mapping ─────────────
try {
  const cat = await eosCatalog({ limit: 10, page: 1 })
  const entries = (cat?.items || cat?.data || []).filter((e) => e.current_status === 'approved' || e.status === 'approved').slice(0, 2)
  if (entries.length < 2 && (cat?.items || cat?.data || []).length >= 2) {
    entries.push(...(cat.items || cat.data).slice(0, 2))
  }
  let nameOk = 0
  const samples = []
  for (const row of entries.slice(0, 2)) {
    const id = row.id || row.entry_id
    if (!id) continue
    const detail = await eosDetail(id)
    const mapped = mapEosToItem(detail)
    const e = detail.entry || {}, m = detail.model || {}
    const brand = clean(e.brand || m.brand)
    const model = clean(e.model_number || e.code || m.model_number)
    const family = clean(e.equipment_type || m.equipment_type)
    const expected = buildItemName(brand, model, family) || clean(e.title)
    const got = mapped.fields.item_name
    samples.push(`${got}`)
    if (got === expected) nameOk++
  }
  pass('(a) mapEosToItem name = Brand+Model+Family', nameOk >= Math.min(2, entries.length) && nameOk > 0,
    samples.length ? samples.join(' | ') : 'no approved EOS entries returned')
} catch (e) {
  pass('(a) mapEosToItem name = Brand+Model+Family', false, e.message)
}

// ── (b) brands.factors_pending column + EOS-sync brands flagged ────────────
const DATABASE_URL = process.env.DATABASE_URL
if (DATABASE_URL) {
  const c = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })
  try {
    await c.connect()
    const { rows: col } = await c.query(
      `select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'brands' and column_name = 'factors_pending'`,
    )
    pass('(b) brands.factors_pending column exists', col.length > 0)

    const { rows: pending } = await c.query(
      `select b.brand, b.factors_pending from brands b
       inner join items i on lower(i.brand) = lower(b.brand) and i.eos_entry_id is not null
       where b.factors_pending = true limit 3`,
    )
    if (pending.length > 0) {
      pass('(b) EOS-linked brands can have factors_pending=true', true, pending.map((r) => r.brand).join(', '))
    } else {
      const { rows: eosBrands } = await c.query(
        `select distinct b.brand, b.factors_pending, b.exchange_factor, b.price_factor
         from brands b inner join items i on lower(i.brand) = lower(b.brand) and i.eos_entry_id is not null limit 5`,
      )
      const unset = eosBrands.filter((b) => Number(b.exchange_factor) === 1 && Number(b.price_factor) === 1 && !b.factors_pending)
      pass('(b) EOS-sync brands factors_pending flag', unset.length === 0,
        unset.length ? `${unset.length} EOS brand(s) still at default factors but factors_pending=false` : eosBrands.length ? 'EOS brands OK or factors already set' : 'no EOS-linked brands in DB yet')
    }
  } catch (e) {
    pass('(b) brands.factors_pending checks', false, e.message)
  } finally {
    await c.end().catch(() => {})
  }
} else {
  pass('(b) brands.factors_pending column exists', false, 'DATABASE_URL not set')
}

// ── (c) resolveApprovedItem resolves by eos_entry_id only ───────────────────
try {
  const { data: linked } = await supabase.from('items').select('id, eos_entry_id, item_name').not('eos_entry_id', 'is', null).limit(1).maybeSingle()
  if (!linked?.eos_entry_id) {
    pass('(c) resolveApprovedItem by eos_entry_id only', false, 'no EOS-linked item in ERP DB')
  } else {
    const r = await resolveApprovedItem({ eos_entry_id: linked.eos_entry_id, qty: 1 }, { tryImport: false })
    pass('(c) resolveApprovedItem by eos_entry_id only', !!r && r.match === 'eos_entry_id' && r.item.id === linked.id,
      r ? `matched ${r.item.item_name} via ${r.match}` : 'no match')
  }
} catch (e) {
  pass('(c) resolveApprovedItem by eos_entry_id only', false, e.message)
}

// ── summary ─────────────────────────────────────────────────────────────────
console.log('\n######## BLOCK 1 VERIFY ########')
console.log(`EOS API: ${env.eosApiUrl}\n`)
for (const r of results) {
  console.log(`  ${r.ok ? '✓ PASS' : '✗ FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
}
const ok = results.filter((r) => r.ok).length
console.log(`\n  ${ok}/${results.length} passed\n`)
process.exit(ok === results.length ? 0 : 1)
