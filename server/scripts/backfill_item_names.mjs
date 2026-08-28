/**
 * One-time backfill: EOS-linked items whose name is still the old auto-format
 * (EOS title or "Brand Model") → Brand + Model + Family via buildItemName.
 *
 *   node scripts/backfill_item_names.mjs           # dry-run (print before/after)
 *   node scripts/backfill_item_names.mjs --apply   # write changes
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { supabase } from '../src/config/supabase.js'
import { buildItemName } from '../src/core/itempricing.js'
import { eosDetail, mapEosToItem } from '../src/core/eos.js'
import { recordVersion } from '../src/core/eosfields.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const APPLY = process.argv.includes('--apply')
const clean = (s) => (s == null ? null : String(s).trim() || null)
const norm = (s) => {
  const c = clean(s)
  return c ? c.toLowerCase().replace(/\s+/g, ' ').trim() : ''
}

function legacyNameCandidates(detail) {
  const e = detail.entry || {}, m = detail.model || {}
  const b = clean(e.brand || m.brand)
  const mod = clean(e.model_number || e.code || m.model_number)
  const title = clean(e.title)
  const out = []
  if (title) out.push(norm(title))
  if (b && mod) out.push(norm(`${b} ${mod}`))
  if (mod) out.push(norm(mod))
  return [...new Set(out.filter(Boolean))]
}

function isLegacyName(itemName, detail) {
  const cur = norm(itemName)
  if (!cur) return false
  return legacyNameCandidates(detail).some((c) => c === cur)
}

/** When EOS detail is unavailable, match using stored brand/model (multi-word brand safe). */
function localLegacyProposed(it) {
  const cur = norm(it.item_name || it.name)
  if (!cur) return null
  const b = clean(it.brand)
  const mod = clean(it.model)
  const fam = clean(it.product_family)
  const candidates = []
  if (b && mod) candidates.push(norm(`${b} ${mod}`))
  if (mod) candidates.push(norm(mod))
  if (!candidates.some((c) => c === cur)) return null
  const next = buildItemName(b, mod, fam)
  return next && norm(next) !== cur ? next : null
}

const { data: linked, error } = await supabase
  .from('items')
  .select('id, item_name, name, brand, model, product_family, eos_entry_id')
  .not('eos_entry_id', 'is', null)

if (error) {
  console.error(error.message)
  process.exit(1)
}

console.log(`\n######## BACKFILL ITEM NAMES (${APPLY ? 'APPLY' : 'DRY-RUN'}) ########\n`)
console.log(`EOS-linked items: ${(linked || []).length}\n`)
console.log('id | current name | proposed name')
console.log('---|--------------|---------------')

const changes = []
for (const it of linked || []) {
  let next = null
  try {
    const detail = await eosDetail(it.eos_entry_id)
    if (detail?.entry && isLegacyName(it.item_name || it.name, detail)) {
      const mapped = mapEosToItem(detail)
      next = mapped.fields.item_name
    }
  } catch (e) {
    console.warn(`  skip EOS ${it.item_name}: ${e.message}`)
  }
  if (!next) next = localLegacyProposed(it)
  if (!next || next === (it.item_name || it.name)) continue
  changes.push({ id: it.id, before: it.item_name || it.name, after: next })
  console.log(`${it.id} | ${it.item_name || it.name} | ${next}`)
}

if (!changes.length) {
  console.log('\nNothing to change — all names already upgraded or manually set.')
  process.exit(0)
}

if (APPLY) {
  for (const c of changes) {
    const { data: before } = await supabase.from('items').select('*').eq('id', c.id).single()
    const { error: upErr } = await supabase.from('items').update({ item_name: c.after, name: c.after }).eq('id', c.id)
    if (upErr) {
      console.error(`  ✗ ${c.id}: ${upErr.message}`)
      continue
    }
    const { data: after } = await supabase.from('items').select('*').eq('id', c.id).single()
    if (before && after) {
      await recordVersion(c.id, {
        source: 'backfill-item-names',
        changed_by: null,
        change_note: `Name backfill: ${c.before} → ${c.after}`,
        snapshot: after,
      })
    }
  }
  console.log(`\n✔ Updated ${changes.length} item(s).`)
} else {
  console.log(`\n${changes.length} item(s) would change. Re-run with --apply to write.`)
}
