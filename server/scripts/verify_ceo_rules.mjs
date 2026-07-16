// CEO BUSINESS RULES (14 Jul 2026) — end-to-end proof.
//
// R1  STOCK FIRST. A quotation must consume available stock BEFORE anything is purchased.
//     Only the shortfall may become a purchase. (Maximise margin, minimise buying.)
// R2  EOS IS THE SINGLE SOURCE OF TRUTH FOR ITEMS. No panel may create an item in the ERP.
//     Only approved EOS items sync in — automatically.
//
// Proves the WHOLE chain with real stock:
//   quotation (5 units, 3 in stock) → 3 from_stock / 2 to_purchase
//     → accept → reserves ONLY 3 → BOQ carries the split
//       → Send to Procurement → PR asks for 2, NOT 5
// Self-cleaning.
import { supabase } from '../src/config/supabase.js'
import jwt from 'jsonwebtoken'
import { env } from '../src/config/env.js'
import { postStock } from '../src/core/stockmove.js'

const BASE = process.env.BASE || 'http://localhost:5050/api'
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
let pass = 0, fail = 0; const fails = []
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m) } else { fail++; fails.push(m); console.log('  ✗ FAIL', m) } }
const S = (s) => console.log(`\n── ${s} ──`)
const n0 = (v) => Number(v) || 0

const userBy = async (e) => (await supabase.from('users').select('*').eq('email', e).single()).data
const sign = (u) => jwt.sign({ id: u.id, name: u.name, email: u.email, role: u.role, access_level: u.access_level }, env.jwtSecret, { expiresIn: '1h' })
const H = (t) => ({ authorization: `Bearer ${t}`, 'content-type': 'application/json' })

const admin = await userBy('admin@gmail.com')
const sales = await userBy('ali@culinova.sa')
const wh = await userBy('warehouse@culinova.sa')
const pm = await userBy('pm@gmail.com')
const A = H(sign(admin)), SL = H(sign(sales)), W = H(sign(wh)), P = H(sign(pm))

console.log(`\n######## CEO BUSINESS RULES — ${BASE} ########`)
const clean = { quotations: [], projects: [], sales_orders: [], prs: [], item_id: null, warehouse: null }

// ═════════════════════════════════════════════════════════════════════════════
S('R2 — ITEMS COME ONLY FROM EOS (no panel may create one in the ERP)')

const mk = (headers) => fetch(`${BASE}/items`, {
  method: 'POST', headers,
  body: JSON.stringify({ item_name: 'ZZCEO Illegal Item', brand: 'ZZBrand', model: 'ZZ-1', product_family: 'Test' }),
})
for (const [who, h] of [['Warehouse (Stock User)', W], ['Management', A]]) {
  const r = await mk(h); const d = await j(r)
  ok(r.status === 403 && /EOS/i.test(d.error || ''), `${who} → POST /items ${r.status} BLOCKED · "${(d.error || '').slice(0, 58)}…"`)
  if (d.id) await supabase.from('items').delete().eq('id', d.id)   // must never happen
}
const bulk = await fetch(`${BASE}/items/import`, { method: 'POST', headers: W, body: JSON.stringify({ rows: [{ item_name: 'ZZCEO Bulk' }] }) })
ok(bulk.status === 403, `bulk import → ${bulk.status} BLOCKED (the back door is shut too)`)
const { data: anyItem } = await supabase.from('items').select('id').limit(1).single()
const variants = await fetch(`${BASE}/items/${anyItem.id}/variants`, { method: 'POST', headers: W, body: JSON.stringify({ combinations: [] }) })
ok(variants.status === 403, `variant generation → ${variants.status} BLOCKED (variants would also mint ERP items)`)

// the EOS path itself must still work — that is the ONLY way in
const pend = await fetch(`${BASE}/eos/pending`, { headers: W }).then(j)
ok(Array.isArray(pend.entries), `EOS is still open: /eos/pending → ${pend.imported} imported · ${pend.pending} pending approval`)
const pol = await fetch(`${BASE}/eos/policy`, { headers: W }).then(j)
ok(pol.item_creation_source === 'eos', `policy is DB-driven (not hardcoded): item_creation_source="${pol.item_creation_source}"`)
ok(pol.eos_auto_sync === 'on', `automatic sync is ON, every ${pol.eos_auto_sync_minutes} minutes`)

const syncRun = await fetch(`${BASE}/eos/auto-sync/run`, { method: 'POST', headers: W }).then(j)
ok(syncRun.ok === true, `automatic sync runs → imported ${syncRun.imported} · updated ${syncRun.updated} · unchanged ${syncRun.unchanged}`)

// ═════════════════════════════════════════════════════════════════════════════
S('R2 — THE ITEM MASTER IS READ-ONLY IN THE ERP (edit/delete/approve/reject all live in EOS)')
const { data: anItem2 } = await supabase.from('items').select('*').limit(1).single()
for (const [who, h] of [['Warehouse (Stock User)', W], ['Management', A]]) {
  const del = await fetch(`${BASE}/items/${anItem2.id}`, { method: 'DELETE', headers: h })
  ok(del.status === 403, `${who} → DELETE item ${del.status} BLOCKED (deleting is an EOS decision)`)
  const edit = await fetch(`${BASE}/items/${anItem2.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ item_name: 'ZZCEO Renamed', brand: 'ZZCEO' }) })
  const eb = await j(edit)
  ok(edit.status === 403 && /read-only/i.test(eb.error || ''), `${who} → EDIT item data ${edit.status} BLOCKED · "${(eb.error || '').slice(0, 48)}…"`)
}
// the Item Master shows ONLY EOS-approved data
const { count: total } = await supabase.from('items').select('id', { count: 'exact', head: true })
const { count: fromEos } = await supabase.from('items').select('id', { count: 'exact', head: true }).not('eos_entry_id', 'is', null)
ok(total === fromEos, `every item in the Item Master comes from EOS (${fromEos}/${total})${total !== fromEos ? ` — ${total - fromEos} still non-EOS` : ''}`)

S('R2 — but PRICING is NOT item data: EOS carries no prices, so the ERP still owns it')
const price = await fetch(`${BASE}/items/${anItem2.id}`, { method: 'PATCH', headers: W, body: JSON.stringify({ reorder_level: 5 }) })
ok(price.status < 300, `Warehouse → set reorder_level ${price.status} (stock policy stays ERP-owned)`)
const applyPrice = await fetch(`${BASE}/pricing/apply/${anItem2.id}`, { method: 'POST', headers: W, body: JSON.stringify({ supplier_price: 1000 }) })
ok(applyPrice.status < 300, `Pricing Engine → apply a price ${applyPrice.status} (this is where pricing is set)`)
// restore whatever we touched
await supabase.from('items').update({ reorder_level: anItem2.reorder_level, supplier_price: anItem2.supplier_price, cost: anItem2.cost, selling_price: anItem2.selling_price, standard_rate: anItem2.standard_rate, landed_cost: anItem2.landed_cost }).eq('id', anItem2.id)

S('R2 — item MASTERS (brands / families / groups) belong to EOS too')
const nb = await fetch(`${BASE}/masters/brands`, { method: 'POST', headers: W, body: JSON.stringify({ brand: 'ZZCEO Brand' }) })
ok(nb.status === 403, `create a brand → ${nb.status} BLOCKED (the EOS import creates brands)`)
const nf = await fetch(`${BASE}/masters/product-families`, { method: 'POST', headers: W, body: JSON.stringify({ name: 'ZZCEO Family' }) })
ok(nf.status === 403, `create a product family → ${nf.status} BLOCKED`)
const { data: aBrand } = await supabase.from('brands').select('*').limit(1).single()
const bid = await fetch(`${BASE}/masters/brands/${aBrand.id}`, { method: 'PATCH', headers: W, body: JSON.stringify({ description: 'ZZCEO hacked' }) })
ok(bid.status === 403, `edit a brand's identity → ${bid.status} BLOCKED`)
const bpx = await fetch(`${BASE}/masters/brands/${aBrand.id}`, { method: 'PATCH', headers: W, body: JSON.stringify({ exchange_factor: aBrand.exchange_factor }) })
ok(bpx.status < 300, `edit a brand's PRICING factor → ${bpx.status} allowed (EOS has no prices)`)

S('R2 — every internal role can SEE where items come from (the PM used to get a 403 here)')
for (const [who, h] of [['Project Manager', P], ['Sales User', SL]]) {
  const st = await fetch(`${BASE}/eos/status`, { headers: h })
  ok(st.status === 200, `${who} → /eos/status ${st.status} (the Item Master banner renders for every role)`)
}

// ═════════════════════════════════════════════════════════════════════════════
S('R1 — STOCK FIRST · setting up real stock (3 units, free — nothing reserved)')
const { data: item } = await supabase.from('items').select('*').eq('is_stock_item', true).limit(1).single()
clean.item_id = item.id
const { data: warehouse } = await supabase.from('warehouses').select('name').limit(1).single()
clean.warehouse = warehouse.name

// Snapshot whatever this item's stock looks like now, then put it in a known clean state for the test
// and restore it afterwards. (The live rows carry phantom reservations left by the OLD behaviour —
// reserving quantities we never owned — which is exactly what this rule exists to stop.)
const { data: snapshot } = await supabase.from('stock_balances').select('*').eq('item_id', item.id).eq('warehouse', warehouse.name).maybeSingle()
clean.snapshot = snapshot || null
await supabase.from('stock_balances').delete().eq('item_id', item.id).eq('warehouse', warehouse.name)
await supabase.from('stock_balances').insert({ item_id: item.id, warehouse: warehouse.name, qty: 3, reserved: 0, received_at: new Date().toISOString() })

const { data: bal } = await supabase.from('stock_balances').select('qty, reserved').eq('item_id', item.id).eq('warehouse', warehouse.name).single()
ok(n0(bal.qty) === 3 && n0(bal.reserved) === 0, `stocked "${item.item_name}" → ${bal.qty} on hand, ${bal.reserved} reserved → ${bal.qty - bal.reserved} AVAILABLE in ${warehouse.name}`)

S('R1 — the quotation must SEE the stock before committing (what-if, nothing saved)')
const check = await fetch(`${BASE}/quotations/check-stock`, {
  method: 'POST', headers: SL,
  body: JSON.stringify({ items: [{ item_id: item.id, qty: 5 }] }),
}).then(j)
const cl = check.lines?.[0]
ok(n0(cl?.available) >= 3 && n0(cl?.from_stock) === 3 && n0(cl?.to_purchase) === 2,
  `sell 5, own 3 → from_stock ${cl?.from_stock} · to_purchase ${cl?.to_purchase} (the salesperson sees it BEFORE saving)`)
ok(check.summary?.needs_procurement === true && check.summary?.stock_coverage_pct === 60,
  `summary: ${check.summary?.stock_coverage_pct}% covered by stock, ${check.summary?.to_purchase} unit(s) must be bought`)

S('R1 — the split is PERSISTED on the quotation')
const ceoOpp = await fetch(`${BASE}/sales/opportunities`, {
  method: 'POST', headers: A,
  body: JSON.stringify({ customer: 'ZZCEO Verify Co', stage: 'Prospecting', value: 50000, next_action_date: '2026-08-01' }),
}).then(j)
const q = await fetch(`${BASE}/quotations`, {
  method: 'POST', headers: A,
  body: JSON.stringify({
    customer: 'ZZCEO Verify Co', customer_email: 'zzceo@example.com', project_name: 'ZZ CEO Kitchen',
    opportunity_id: ceoOpp.id,
    items: [{ item_id: item.id, qty: 5, rate: 1000 }],
  }),
}).then(j)
ok(!!q.id, `quotation → ${q.number}`)
if (q.id) clean.quotations.push(q.id)
ok(n0(q.stock?.from_stock) === 3 && n0(q.stock?.to_purchase) === 2,
  `quotation response carries the split: ${q.stock?.from_stock} from stock · ${q.stock?.to_purchase} to buy`)
const { data: qline } = await supabase.from('quotation_items').select('qty, from_stock, to_purchase, available_qty').eq('quotation_id', q.id).single()
ok(n0(qline.from_stock) === 3 && n0(qline.to_purchase) === 2,
  `stored on the line: qty ${qline.qty} = from_stock ${qline.from_stock} + to_purchase ${qline.to_purchase}`)

S('R1 — a SECOND quotation cannot be promised the same stock twice')
const check2 = await fetch(`${BASE}/quotations/check-stock`, {
  method: 'POST', headers: SL, body: JSON.stringify({ items: [{ item_id: item.id, qty: 5 }, { item_id: item.id, qty: 5 }] }),
}).then(j)
const [a1, a2] = check2.lines || []
ok(n0(a1?.from_stock) === 3 && n0(a2?.from_stock) === 0,
  `two lines of the same item: first takes ${a1?.from_stock} from stock, second gets ${a2?.from_stock} (the pool is shared — no double-promise)`)

// ═════════════════════════════════════════════════════════════════════════════
S('R1 — ACCEPT: reserve ONLY what we actually own (3), not the 5 sold')
const before = (await supabase.from('stock_balances').select('reserved').eq('item_id', item.id).eq('warehouse', warehouse.name).single()).data
const acc = await fetch(`${BASE}/sales/quotations/${q.id}/accept`, { method: 'POST', headers: A }).then(j)
ok(acc.ok && acc.project?.id, `accepted → ${acc.sales_order?.number} + ${acc.project?.number}`)
const PID = acc.project?.id
if (PID) clean.projects.push(PID)
if (acc.sales_order?.id) clean.sales_orders.push(acc.sales_order.id)

const after = (await supabase.from('stock_balances').select('qty, reserved').eq('item_id', item.id).eq('warehouse', warehouse.name).single()).data
const reservedDelta = n0(after.reserved) - n0(before.reserved)
ok(reservedDelta === 3, `reserved moved by ${reservedDelta} — ONLY the 3 we own (it used to reserve all 5, inventing phantom stock)`)

const { data: boqLine } = await supabase.from('project_boq').select('qty, from_stock, to_purchase').eq('project_id', PID).single()
ok(n0(boqLine.from_stock) === 3 && n0(boqLine.to_purchase) === 2,
  `the split travelled to the project BOQ: ${boqLine.from_stock} from stock · ${boqLine.to_purchase} to buy`)

// ═════════════════════════════════════════════════════════════════════════════
S('R1 — PROCUREMENT buys the SHORTFALL ONLY (this is the profitability rule)')
const pr = await fetch(`${BASE}/pm/projects/${PID}/to-procurement`, { method: 'POST', headers: P }).then(j)
ok(!!pr.purchase_requisition, `Purchase Requisition → ${pr.purchase_requisition}`)
if (pr.pr_id) clean.prs.push(pr.pr_id)
const { data: prItem } = await supabase.from('purchase_requisition_items').select('qty, sold_qty, covered_from_stock').eq('pr_id', pr.pr_id).single()
ok(n0(prItem.qty) === 2 && n0(prItem.sold_qty) === 5 && n0(prItem.covered_from_stock) === 3,
  `PR asks for ${prItem.qty} — NOT the ${prItem.sold_qty} sold. ${prItem.covered_from_stock} came from stock we already owned.`)
ok(n0(pr.covered_from_stock) === 3, `response states the saving: ${pr.covered_from_stock} unit(s) NOT purchased`)

S('R1 — an item fully covered by stock generates NO purchase at all')
await supabase.from('project_boq').update({ status: 'Waiting', qty: 2, to_purchase: 2, from_stock: 0 }).eq('project_id', PID)
// plenty of FREE stock now (release the reservation the acceptance made, and top up)
await supabase.from('stock_balances').update({ qty: 20, reserved: 0 }).eq('item_id', item.id).eq('warehouse', warehouse.name)
const none = await fetch(`${BASE}/pm/projects/${PID}/to-procurement`, { method: 'POST', headers: P })
const noneBody = await j(none)
ok(none.status === 422 && /covered by stock/i.test(noneBody.error || ''),
  `everything now in stock → ${none.status} "${(noneBody.error || '').slice(0, 62)}…" (it refuses to buy what we own)`)

// ═════════════════════════════════════════════════════════════════════════════
S('CLEANUP')
for (const id of clean.prs) { await supabase.from('purchase_requisition_items').delete().eq('pr_id', id); await supabase.from('purchase_requisitions').delete().eq('id', id) }
for (const id of clean.projects) { await supabase.from('project_boq').delete().eq('project_id', id); await supabase.from('projects').delete().eq('id', id) }
for (const id of clean.sales_orders) await supabase.from('sales_orders').delete().eq('id', id)
for (const id of clean.quotations) {
  await supabase.from('quotation_items').delete().eq('quotation_id', id)
  await supabase.from('quotation_revisions').delete().eq('quotation_id', id)
  await supabase.from('quotations').delete().eq('id', id)
}
// unwind the stock this test created and RESTORE the item's original balance row exactly
for (const id of clean.sales_orders) await supabase.from('stock_reservations').delete().eq('sales_order_id', id)
await supabase.from('stock_ledger').delete().eq('ref_type', 'ZZCEO')
await supabase.from('stock_balances').delete().eq('item_id', clean.item_id).eq('warehouse', clean.warehouse)
if (clean.snapshot) {
  const { id, ...row } = clean.snapshot
  await supabase.from('stock_balances').insert(row)
  console.log(`  restored ${clean.snapshot.item_id.slice(0, 8)}… balance to qty ${clean.snapshot.qty} / reserved ${clean.snapshot.reserved}`)
}
await supabase.from('opportunities').delete().ilike('customer', 'ZZCEO%')
await supabase.from('leads').delete().ilike('company', 'ZZCEO%')
await supabase.from('items').delete().ilike('item_name', 'ZZCEO%')
console.log('  cleaned every test row (stock, reservations, docs)')

console.log(`\n######## CEO RULES RESULT: ${pass} passed, ${fail} failed ########`)
if (fail) fails.forEach((f) => console.log('   -', f))
process.exit(fail ? 1 : 0)
