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

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const APPLY = process.argv.includes('--apply')
const clean = (s) => (s == null ? null : String(s).trim() || null)

function legacyNames(detail) {
  const e = detail.entry || {}, m = detail.model || {}
  const b = clean(e.brand || m.brand)
  const mod = clean(e.model_number || e.code || m.model_number)
  return { title: clean(e.title), brandModel: [b, mod].filter(Boolean).join(' ') }
}

function isLegacyName(itemName, detail) {
  const cur = clean(itemName)
  if (!cur) return false
  const { title, brandModel } = legacyNames(detail)
  return (title && cur === title) || (brandModel && cur === brandModel)
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

const changes = []
for (const it of linked || []) {
  try {
    const detail = await eosDetail(it.eos_entry_id)
    if (!detail?.entry) continue
    if (!isLegacyName(it.item_name || it.name, detail)) continue
    const mapped = mapEosToItem(detail)
    const next = mapped.fields.item_name
    if (!next || next === (it.item_name || it.name)) continue
    changes.push({ id: it.id, before: it.item_name || it.name, after: next })
  } catch (e) {
    console.warn(`  skip ${it.item_name}: ${e.message}`)
  }
}

if (!changes.length) {
  console.log('Nothing to change — all names already upgraded or manually set.')
  process.exit(0)
}

for (const c of changes) {
  console.log(`  ${c.id}`)
  console.log(`    before: ${c.before}`)
  console.log(`    after:  ${c.after}`)
}

if (APPLY) {
  for (const c of changes) {
    const { error: upErr } = await supabase.from('items').update({ item_name: c.after, name: c.after }).eq('id', c.id)
    if (upErr) console.error(`  ✗ ${c.id}: ${upErr.message}`)
  }
  console.log(`\n✔ Updated ${changes.length} item(s).`)
} else {
  console.log(`\n${changes.length} item(s) would change. Re-run with --apply to write.`)
}
