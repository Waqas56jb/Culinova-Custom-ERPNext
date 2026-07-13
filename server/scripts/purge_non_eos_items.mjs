// CEO / client rule: the Item Master shows ONLY items approved in EOS.
// Anything that was previously added, uploaded or bulk-imported straight into the ERP must go.
//
// This removes every item that is NOT linked to an approved EOS entry (eos_entry_id IS NULL),
// together with its child rows. It REFUSES to delete an item that a real business document depends on
// (a quotation line, a project BOQ line, stock, a PO…) — deleting those would corrupt history. Those
// are listed so the owner can decide.
//
// DRY RUN BY DEFAULT.  Apply with:  node scripts/purge_non_eos_items.mjs --apply
import { supabase } from '../src/config/supabase.js'

const APPLY = process.argv.includes('--apply')
console.log(`\n######## PURGE NON-EOS ITEMS ${APPLY ? '(APPLYING)' : '(DRY RUN — nothing is written)'} ########\n`)

const { data: all } = await supabase.from('items').select('id, item_code, item_name, brand, model, eos_entry_id, created_at')
const eosItems = (all || []).filter((i) => i.eos_entry_id)
const nonEos = (all || []).filter((i) => !i.eos_entry_id)

console.log(`  Item Master today : ${all.length} items`)
console.log(`  From EOS (keep)   : ${eosItems.length}`)
console.log(`  NOT from EOS      : ${nonEos.length}  ← these must go\n`)
if (!nonEos.length) { console.log('  Nothing to purge — every item already comes from EOS.\n'); process.exit(0) }

// ── who depends on each item? ────────────────────────────────────────────────
// Documents that would lose their meaning if the item vanished. Matched by item_id where the column
// exists, and by item_name where the table only stores a name (the older tables do).
const ids = nonEos.map((i) => i.id)
const names = nonEos.map((i) => i.item_name).filter(Boolean)

const byId = async (table, col = 'item_id') => (await supabase.from(table).select(`id, ${col}`).in(col, ids)).data || []
const byName = async (table, col = 'item_name') => (names.length ? (await supabase.from(table).select(`id, ${col}`).in(col, names)).data || [] : [])

const [qi, boq, pe, boqi, sb, sl, po, dn, sa, st, pri, rfqi] = await Promise.all([
  byId('quotation_items'), byName('project_boq'), byId('project_equipment'), byId('boq_items'),
  byId('stock_balances'), byId('stock_ledger'), byName('purchase_orders'), byName('delivery_notes'),
  byName('stock_adjustments'), byName('stock_transfers'), byId('purchase_requisition_items'), byId('rfq_items'),
])

const usedBy = {}
const note = (rows, key, col) => { for (const r of rows) { const k = String(r[col]); (usedBy[k] ||= new Set()).add(key) } }
note(qi, 'quotation', 'item_id'); note(pe, 'project equipment', 'item_id'); note(boqi, 'BOQ', 'item_id')
note(sb, 'stock balance', 'item_id'); note(sl, 'stock ledger', 'item_id'); note(pri, 'purchase requisition', 'item_id')
note(rfqi, 'RFQ', 'item_id')
// name-keyed tables → map the name back to the item id
const nameToId = Object.fromEntries(nonEos.filter((i) => i.item_name).map((i) => [i.item_name, i.id]))
const noteByName = (rows, key, col) => { for (const r of rows) { const id = nameToId[r[col]]; if (id) (usedBy[id] ||= new Set()).add(key) } }
noteByName(boq, 'project BOQ', 'item_name'); noteByName(po, 'purchase order', 'item_name')
noteByName(dn, 'delivery note', 'item_name'); noteByName(sa, 'stock adjustment', 'item_name'); noteByName(st, 'stock transfer', 'item_name')

const blocked = nonEos.filter((i) => usedBy[i.id]?.size)
const free = nonEos.filter((i) => !usedBy[i.id]?.size)

console.log(`  ── SAFE TO DELETE (nothing references them): ${free.length}`)
for (const i of free) console.log(`     · ${(i.item_code || '').padEnd(18)} ${(i.item_name || '').slice(0, 42)}`)

console.log(`\n  ── IN USE — will NOT be deleted (a real document depends on them): ${blocked.length}`)
for (const i of blocked) console.log(`     ! ${(i.item_code || '').padEnd(18)} ${(i.item_name || '').slice(0, 34).padEnd(36)} used by: ${[...usedBy[i.id]].join(', ')}`)

if (!APPLY) {
  console.log(`\n  DRY RUN — nothing was changed. Re-run with --apply to delete the ${free.length} unreferenced item(s).\n`)
  process.exit(0)
}

// ── delete ───────────────────────────────────────────────────────────────────
const CHILD = [
  'item_barcodes', 'item_uoms', 'item_reorders', 'item_suppliers', 'item_customer_details',
  'item_taxes', 'item_defaults', 'item_variant_attributes', 'item_manufacturers', 'item_alternatives',
  'item_prices', 'item_pricing_history', 'item_versions',
]
let removed = 0
for (const i of free) {
  for (const t of CHILD) await supabase.from(t).delete().eq('item_id', i.id)
  const { error } = await supabase.from('items').delete().eq('id', i.id)
  if (error) console.log(`     ✗ ${i.item_code}: ${error.message}`)
  else { removed++; console.log(`     ✓ removed ${i.item_code} — ${i.item_name}`) }
}

const { count } = await supabase.from('items').select('id', { count: 'exact', head: true })
const { count: linked } = await supabase.from('items').select('id', { count: 'exact', head: true }).not('eos_entry_id', 'is', null)
console.log(`\n######## REMOVED ${removed} · Item Master now ${count} items (${linked} from EOS) ########`)
if (blocked.length) console.log(`   ${blocked.length} item(s) kept because live documents reference them — see the list above.\n`)
process.exit(0)
