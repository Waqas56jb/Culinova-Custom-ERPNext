// End-to-end verification of the M2 Pricing Engine API (panel 'warehouse').
// Acts as the REAL Stock User (warehouse@culinova.sa) for the pricing flow and the Full Admin only
// where 'delete' is required. Exercises: preview · apply · breakdown · recalc · landed-cost template
// CRUD · multi-currency FX (rate + history). Creates its OWN throwaway item + masters and deletes
// everything it created — it never mutates real item data.
//
// NOTE: the orchestrator mounts these routes; until then every call 404s and this reports failures.
// That is EXPECTED. Run it after mounting. Model: scripts/verify_stock_flow.mjs.
import { supabase } from '../src/config/supabase.js'
import jwt from 'jsonwebtoken'
import { env } from '../src/config/env.js'

const BASE = process.env.BASE || 'http://localhost:5050/api'
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
const jr = async (r) => { const t = await r.text(); let b; try { b = JSON.parse(t) } catch { b = t }; return { s: r.status, b } }
let pass = 0, fail = 0
const ok = (c, m) => { c ? (pass++, console.log('  ✓', m)) : (fail++, console.log('  ✗ FAIL', m)) }

const { data: wu } = await supabase.from('users').select('*').eq('email', 'warehouse@culinova.sa').single()
const { data: admin } = await supabase.from('users').select('*').eq('email', 'admin@gmail.com').single()
const tok = (u) => jwt.sign({ id: u.id, name: u.name, email: u.email, role: u.role, access_level: u.access_level }, env.jwtSecret, { expiresIn: '1h' })
const H = { authorization: `Bearer ${tok(wu)}`, 'content-type': 'application/json' }
const AH = { authorization: `Bearer ${tok(admin)}`, 'content-type': 'application/json' }

console.log('\n######## PRICING ENGINE (as Stock User) ########')

// ── setup: a throwaway priced item + capture the default template ──
// recalc/all persists new-chain values onto EVERY real priced item, so snapshot their persistable
// columns up-front and restore them in cleanup — this verify must not change any real item's price.
const PERSIST_COLS = ['supplier_price', 'factory_cost', 'freight_cost', 'insurance_cost', 'customs_duty', 'local_transport', 'other_landed_cost', 'landed_cost', 'markup_factor', 'calculated_sale_price', 'selling_price', 'gp_percent', 'net_profit', 'np_percent', 'cost', 'selling_rate', 'avg_cost']
const { data: realSnapshot } = await supabase.from('items').select(['id', ...PERSIST_COLS].join(',')).gt('supplier_price', 0)
const { data: tpl } = await supabase.from('landed_cost_templates').select('*').eq('is_default', true).maybeSingle()
const { data: item, error: itemErr } = await supabase.from('items').insert({
  code: 'ZZ-PRICE-TEST', item_code: 'ZZ-PRICE-TEST', name: 'ZZ Pricing Test Item', item_name: 'ZZ Pricing Test Item',
  brand: 'ZZ Brand', model: 'ZZ-1', currency: 'USD', supplier_price: 1000, factory_cost: 0,
}).select().single()
if (itemErr) { console.error('could not create test item:', itemErr.message); process.exit(1) }

let testTplId = null, testFxId = null
try {
  console.log('\n[1] PREVIEW — live what-if, no save')
  let r = await jr(await fetch(`${BASE}/pricing/preview`, { method: 'POST', headers: H, body: JSON.stringify({ item: { supplier_price: 1000, currency: 'USD', landed_template_id: tpl?.id, add_margin_pct: 10 } }) }))
  ok(r.s === 200 && r.b.priced === true, `preview priced (status ${r.s})`)
  ok(r.b.fx_rate === 3.75, `USD FX applied: fx_rate=${r.b.fx_rate}`)
  // supplier 1000*3.75=3750; landed=3750*(1+6+1.5+5+2+1 %)=4331.25
  ok(Math.abs((r.b.landed_cost || 0) - 4331.25) < 1, `landed via template = ${r.b.landed_cost} (~4331.25)`)
  ok((r.b.selling_price || 0) > (r.b.landed_cost || 0), `selling ${r.b.selling_price} > landed`)

  r = await jr(await fetch(`${BASE}/pricing/preview`, { method: 'POST', headers: H, body: JSON.stringify({ item: { item_name: 'no cost' } }) }))
  ok(r.s === 200 && r.b.priced === false, 'preview no-cost → priced:false (honest)')
  r = await jr(await fetch(`${BASE}/pricing/preview`, { method: 'POST', headers: H, body: JSON.stringify({}) }))
  ok(r.s === 422, 'preview without item → 422')

  console.log('\n[2] BREAKDOWN — full chain for a saved item')
  r = await jr(await fetch(`${BASE}/pricing/breakdown/${item.id}`, { headers: H }))
  ok(r.s === 200 && r.b.item_id === item.id, `breakdown returns chain (priced=${r.b.priced})`)

  console.log('\n[3] APPLY — price the real item + persist + history row')
  const { count: histBefore } = await supabase.from('item_pricing_history').select('*', { count: 'exact', head: true }).eq('item_id', item.id)
  r = await jr(await fetch(`${BASE}/pricing/apply/${item.id}`, { method: 'POST', headers: H, body: JSON.stringify({ landed_template_id: tpl?.id, add_margin_pct: 5 }) }))
  ok(r.s === 200 && r.b.priced === true, `apply priced (landed ${r.b.landed_cost}, selling ${r.b.selling_price})`)
  const { data: saved } = await supabase.from('items').select('selling_price,landed_cost,add_margin_pct,landed_template_id').eq('id', item.id).single()
  ok(Number(saved.selling_price) === r.b.selling_price, `item.selling_price persisted (${saved.selling_price})`)
  ok(saved.landed_template_id === tpl?.id && Number(saved.add_margin_pct) === 5, 'panel overrides persisted onto item')
  const { count: histAfter } = await supabase.from('item_pricing_history').select('*', { count: 'exact', head: true }).eq('item_id', item.id)
  ok(histAfter === histBefore + 1, `item_pricing_history row inserted (${histBefore}→${histAfter})`)
  r = await jr(await fetch(`${BASE}/pricing/apply/00000000-0000-0000-0000-000000000000`, { method: 'POST', headers: H, body: JSON.stringify({}) }))
  ok(r.s === 404, 'apply unknown item → 404')

  console.log('\n[4] RECALC')
  r = await jr(await fetch(`${BASE}/pricing/recalc`, { method: 'POST', headers: H, body: JSON.stringify({ ids: [item.id] }) }))
  ok(r.s === 200 && r.b.updated === 1, `recalc one id → updated ${r.b.updated}`)
  r = await jr(await fetch(`${BASE}/pricing/recalc`, { method: 'POST', headers: H, body: JSON.stringify({}) }))
  ok(r.s === 200 && Array.isArray(r.b.unpriced), `recalc all → updated=${r.b.updated} skipped=${r.b.skipped} unpriced=${r.b.unpriced?.length}`)
  ok((r.b.unpriced?.length || 0) > 0, 'recalc reports an honest "cannot be priced" list (items with no supplier cost)')

  console.log('\n[5] LANDED-COST TEMPLATES CRUD')
  r = await jr(await fetch(`${BASE}/pricing/templates`, { headers: H }))
  ok(r.s === 200 && Array.isArray(r.b) && r.b.length >= 1, `GET templates → ${r.b?.length}`)
  r = await jr(await fetch(`${BASE}/pricing/templates`, { method: 'POST', headers: H, body: JSON.stringify({ name: 'ZZ Verify Tpl', freight_pct: 7, markup_factor: 1.4, is_active: true }) }))
  ok(r.s === 201 && r.b.id, `POST template → ${r.b.id}`)
  testTplId = r.b.id
  r = await jr(await fetch(`${BASE}/pricing/templates/${testTplId}`, { method: 'PATCH', headers: H, body: JSON.stringify({ freight_pct: 9 }) }))
  ok(r.s === 200 && Number(r.b.freight_pct) === 9, 'PATCH template freight_pct → 9')
  // is_default exclusivity: make the test template default, confirm only one default remains
  r = await jr(await fetch(`${BASE}/pricing/templates/${testTplId}`, { method: 'PATCH', headers: H, body: JSON.stringify({ is_default: true }) }))
  const { data: dflts } = await supabase.from('landed_cost_templates').select('id').eq('is_default', true)
  ok(dflts.length === 1 && dflts[0].id === testTplId, 'setting is_default clears it on the others')
  await supabase.from('landed_cost_templates').update({ is_default: true }).eq('id', tpl.id)   // restore real default
  await supabase.from('landed_cost_templates').update({ is_default: false }).eq('id', testTplId)
  // delete needs 'delete' — Stock User (Edit) must be forbidden; Admin succeeds
  r = await jr(await fetch(`${BASE}/pricing/templates/${testTplId}`, { method: 'DELETE', headers: H }))
  ok(r.s === 403, 'DELETE template as Stock User → 403 (Edit cannot delete)')
  r = await jr(await fetch(`${BASE}/pricing/templates/${testTplId}`, { method: 'DELETE', headers: AH }))
  ok(r.s === 200 && r.b.ok, 'DELETE template as Admin → ok')
  if (r.s === 200) testTplId = null

  console.log('\n[6] MULTI-CURRENCY FX')
  r = await jr(await fetch(`${BASE}/pricing/fx`, { headers: H }))
  ok(r.s === 200 && Array.isArray(r.b) && r.b.find((c) => c.is_base)?.exchange_rate === 1, `GET fx → ${r.b?.length} currencies, base rate 1`)
  ok(r.b?.find((c) => c.code === 'USD')?.latest_rate === 3.75, 'USD latest_rate = 3.75')
  r = await jr(await fetch(`${BASE}/pricing/fx`, { method: 'POST', headers: H, body: JSON.stringify({ from_currency: 'USD', rate: 3.77, valid_from: new Date().toISOString().slice(0, 10) }) }))
  ok(r.s === 201 && Number(r.b.rate) === 3.77, `POST fx USD 3.77 → ${r.s}`)
  testFxId = r.b?.id || null
  r = await jr(await fetch(`${BASE}/pricing/fx`, { method: 'POST', headers: H, body: JSON.stringify({ from_currency: 'SAR', rate: 1 }) }))
  ok(r.s === 422, 'POST fx for base currency → 422')
  r = await jr(await fetch(`${BASE}/pricing/fx`, { method: 'POST', headers: H, body: JSON.stringify({ from_currency: 'USD', rate: -1 }) }))
  ok(r.s === 422, 'POST fx negative rate → 422')
  r = await jr(await fetch(`${BASE}/pricing/fx/history?currency=USD`, { headers: H }))
  ok(r.s === 200 && Array.isArray(r.b) && r.b[0]?.from_currency === 'USD', `GET fx/history?currency=USD → ${r.b?.length} rows`)
} finally {
  console.log('\n[cleanup]')
  await supabase.from('item_pricing_history').delete().eq('item_id', item.id)
  await supabase.from('items').delete().eq('id', item.id)
  if (testTplId) await supabase.from('landed_cost_templates').delete().eq('id', testTplId)
  if (testFxId) await supabase.from('exchange_rates').delete().eq('id', testFxId)
  await supabase.from('currencies').update({ exchange_rate: 3.75 }).eq('code', 'USD')  // revert the test rate write
  // restore every real priced item that recalc/all may have re-priced
  for (const row of realSnapshot || []) { const { id, ...vals } = row; await supabase.from('items').update(vals).eq('id', id) }
  console.log('  cleaned test item, history, template, fx rate; restored real priced items')
}

console.log(`\n######## RESULT: ${pass} passed, ${fail} failed ########`)
process.exit(fail ? 1 : 0)
