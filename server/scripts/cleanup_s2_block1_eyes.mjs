/**
 * Block 1 eyes-on cleanup + TBS.110 duplicate listing (no delete).
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })
const { supabase } = await import('../src/config/supabase.js')

console.log('\n######## S2 Block1 cleanup + TBS.110 list ########\n')

// 1) Void/delete DN-012/013/014 and restore Blender stock to physical 2 / reserved 0
const dnNums = ['DN-2026-000012', 'DN-2026-000013', 'DN-2026-000014']
const { data: dns } = await supabase.from('delivery_notes').select('id, number, item_name, qty, status').in('number', dnNums)
console.log('DNs found:', (dns || []).map((d) => `${d.number} ${d.item_name}×${d.qty} ${d.status}`))

for (const d of dns || []) {
  await supabase.from('delivery_notes').delete().eq('id', d.id)
  console.log('  deleted', d.number)
}

const { data: blender } = await supabase.from('items').select('id, item_name, item_code')
  .ilike('item_name', '%150193%Blender%').limit(1).maybeSingle()
if (blender) {
  await supabase.from('stock_balances').upsert({
    item_id: blender.id, warehouse: 'Main Store', qty: 2, reserved: 0,
  }, { onConflict: 'item_id,warehouse' })
  const { data: bal } = await supabase.from('stock_balances').select('qty, reserved')
    .eq('item_id', blender.id).eq('warehouse', 'Main Store').maybeSingle()
  console.log('Blender stock restored:', blender.item_code, bal)
} else {
  console.log('Blender item not found — skip stock restore')
}

// 2) Mark QTN-091 + PRJ-315583 as test
const { data: qtn } = await supabase.from('quotations').select('id, number, status, notes')
  .eq('number', 'QTN-2026-000091').maybeSingle()
if (qtn) {
  const note = [qtn.notes, '[S2B1-TEST] eyes-on stock reservation'].filter(Boolean).join(' · ')
  await supabase.from('quotations').update({ notes: note }).eq('id', qtn.id)
  console.log('QTN marked test:', qtn.number, qtn.status)
} else console.log('QTN-2026-000091 not found')

const { data: prj } = await supabase.from('projects').select('id, number, name, status')
  .eq('number', 'PRJ-2026-315583').maybeSingle()
if (prj) {
  const name = prj.name?.includes('[S2B1-TEST]') ? prj.name : `${prj.name} [S2B1-TEST]`
  await supabase.from('projects').update({ name }).eq('id', prj.id)
  console.log('PRJ marked test:', prj.number, name)
} else console.log('PRJ-2026-315583 not found')

// 3) List TBS.110 duplicate Active reservations (no delete)
const { data: tbs } = await supabase.from('items').select('id, item_name')
  .ilike('item_name', '%TBS.110%').limit(5)
const ids = (tbs || []).map((t) => t.id)
if (ids.length) {
  const { data: res } = await supabase.from('stock_reservations')
    .select('id, item_name, qty, status, warehouse, sales_order_id, project_id, created_at')
    .in('item_id', ids)
    .eq('status', 'Active')
    .order('created_at', { ascending: true })
  console.log(`\nTBS.110 Active reservations: ${(res || []).length}`)
  for (const r of res || []) {
    console.log(`  ${r.id.slice(0, 8)}… qty=${r.qty} wh=${r.warehouse} so=${r.sales_order_id?.slice(0, 8) || '—'} age=${r.created_at}`)
  }
  console.log('(Listed only — delete deferred to Sprint 5 pre-demo cleanup)')
} else {
  console.log('No TBS.110 items found')
}

console.log('\nCleanup done.\n')
