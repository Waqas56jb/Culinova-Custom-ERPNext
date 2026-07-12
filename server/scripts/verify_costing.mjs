// End-to-end Cost Engine (M3) flow: create a cost sheet → add/validate lines → overhead + revenue
// re-roll → profitability → pull real project_equipment + purchase_orders → RBAC. Self-cleaning.
// Acts as the REAL Project Manager (pm@gmail.com) — the role that owns this module — and uses admin
// only for delete + to prove the Edit-level PM is correctly blocked from deleting a whole sheet.
import { supabase } from '../src/config/supabase.js'
import jwt from 'jsonwebtoken'
import { env } from '../src/config/env.js'

const BASE = process.env.BASE || 'http://localhost:5050/api'
let pass = 0, fail = 0
const ok = (c, m) => { c ? (pass++, console.log('  ✓', m)) : (fail++, console.log('  ✗ FAIL', m)) }
const tokenFor = (u) => jwt.sign({ id: u.id, name: u.name, email: u.email, role: u.role, access_level: u.access_level }, env.jwtSecret, { expiresIn: '1h' })
const R = async (path, { method = 'GET', token, body } = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const t = await res.text(); let b; try { b = JSON.parse(t) } catch { b = t }
  return { status: res.status, body: b }
}

// ── users ──
const { data: pm } = await supabase.from('users').select('*').eq('email', 'pm@gmail.com').single()
const { data: admin } = await supabase.from('users').select('*').eq('email', 'admin@gmail.com').single()
const { data: sales } = await supabase.from('users').select('*').eq('role', 'Sales User').limit(1).single()
const PM = tokenFor(pm)          // Project Manager, access Edit — the real user of this module (sees financials)
const AD = tokenFor(admin)       // Management, Full Admin — for delete + setup
const SALES = sales ? tokenFor(sales) : null

console.log('\n######## COST ENGINE (M3) FLOW (as Project Manager) ########')

// ── setup: a throwaway project with real equipment + a real PO to pull from ──
const cleanup = { sheets: [], project: null, equip: [], pos: [] }
const { data: proj } = await supabase.from('projects')
  .insert({ number: 'ZZ-CE-' + Date.now(), name: 'ZZ Cost Engine Test', customer: 'ZZ Customer', status: 'On Track' })
  .select().single()
cleanup.project = proj?.id
const { data: eq } = await supabase.from('project_equipment').insert([
  { project_id: proj.id, item_name: 'ZZ Combi Oven', qty: 2, unit_cost: 1500 },
  { project_id: proj.id, item_name: 'ZZ Blast Chiller', qty: 1, unit_cost: 4000 },
]).select()
cleanup.equip = (eq || []).map((x) => x.id)
const { data: po } = await supabase.from('purchase_orders')
  .insert({ number: 'ZZ-PO-' + Date.now(), supplier: 'ZZ Supplier', item_name: 'ZZ Stainless Bench', qty: 3, amount: 2100, status: 'Pending', project_id: proj.id })
  .select().single()
cleanup.pos = [po?.id]
ok(proj?.id && eq?.length === 2 && po?.id, `setup: project + 2 equipment (3000+4000) + 1 PO (2100)`)

// [1] CREATE
console.log('\n[1] CREATE cost sheet linked to the project')
const c1 = await R('/cost-sheets', { method: 'POST', token: PM, body: { project_id: proj.id, overhead_pct: 10, revenue: 20000 } })
const sheet = c1.body
if (sheet?.id) cleanup.sheets.push(sheet.id)
ok(c1.status === 201 && String(sheet.number || '').startsWith('CS'), `created ${sheet?.number} (${c1.status})`)
ok(sheet.total_cost !== undefined, `financial fields present for PM (total_cost=${sheet.total_cost})`)
ok(Array.isArray(sheet.lines) && Array.isArray(sheet.breakdown), `sheet has lines[] + breakdown[]`)

// [2] ADD a Material line — amount = qty × rate when omitted
console.log('\n[2] ADD line (Material, qty 2 × rate 100 → amount 200)')
const l1 = await R(`/cost-sheets/${sheet.id}/lines`, { method: 'POST', token: PM, body: { category: 'Material', description: 'Sheet metal', qty: 2, rate: 100 } })
const lineId = (l1.body.lines || []).find((x) => x.description === 'Sheet metal')?.id
ok(l1.status === 201 && l1.body.material_cost === 200, `material_cost = ${l1.body.material_cost} (expect 200)`)
ok(!!lineId, `line persisted with id`)

// [3] invalid category → 422
console.log('\n[3] REJECT invalid category')
const bad = await R(`/cost-sheets/${sheet.id}/lines`, { method: 'POST', token: PM, body: { category: 'Bogus', qty: 1, rate: 5 } })
ok(bad.status === 422, `bogus category rejected (${bad.status}) — ${bad.body.error || ''}`)

// [4] overhead + revenue re-roll: direct 200, overhead 10% = 20, total 220, gross 20000-200=19800, net 19780
console.log('\n[4] RE-ROLL profit from overhead % + revenue')
const p1 = await R(`/cost-sheets/${sheet.id}`, { method: 'PATCH', token: PM, body: { overhead_pct: 10, revenue: 20000 } })
ok(p1.body.overhead_cost === 20 && p1.body.total_cost === 220, `overhead ${p1.body.overhead_cost}, total ${p1.body.total_cost} (expect 20 / 220)`)
ok(p1.body.gross_profit === 19800 && p1.body.net_profit === 19780, `GP ${p1.body.gross_profit}, NP ${p1.body.net_profit} (expect 19800 / 19780)`)

// [5] update line qty 2→3 → amount 300, material_cost 300
console.log('\n[5] UPDATE line qty 2 → 3 (amount follows to 300)')
const u1 = await R(`/cost-sheets/${sheet.id}/lines/${lineId}`, { method: 'PATCH', token: PM, body: { qty: 3 } })
const updLine = (u1.body.lines || []).find((x) => x.id === lineId)
ok(updLine?.amount === 300 && u1.body.material_cost === 300, `line amount ${updLine?.amount}, material_cost ${u1.body.material_cost} (expect 300)`)

// [6] pull from project — 2 equipment + 1 PO = 3 lines; re-pull is idempotent (0 added, 3 skipped)
console.log('\n[6] PULL FROM PROJECT (real equipment + POs)')
const pull = await R(`/cost-sheets/${sheet.id}/pull-from-project`, { method: 'POST', token: PM })
ok(pull.body.added === 3, `pulled ${pull.body.added} lines (expect 3: 2 equipment + 1 PO)`)
// material now: 300 (manual) + 3000 + 4000 = 7300 ; purchase: 2100
ok(pull.body.sheet?.material_cost === 7300, `material_cost after pull = ${pull.body.sheet?.material_cost} (expect 7300)`)
ok(pull.body.sheet?.purchase_cost === 2100, `purchase_cost after pull = ${pull.body.sheet?.purchase_cost} (expect 2100)`)
const pull2 = await R(`/cost-sheets/${sheet.id}/pull-from-project`, { method: 'POST', token: PM })
ok(pull2.body.added === 0 && pull2.body.skipped === 3, `re-pull idempotent: added ${pull2.body.added}, skipped ${pull2.body.skipped}`)

// [7] profitability portfolio includes our sheet + totals
console.log('\n[7] PROFITABILITY portfolio')
const prof = await R('/cost-sheets/profitability', { token: PM })
const mine = (prof.body.rows || []).find((x) => x.id === sheet.id)
ok(!!mine && prof.body.totals?.count >= 1, `sheet in portfolio; totals.count=${prof.body.totals?.count}`)
ok(mine && mine.revenue === 20000, `portfolio revenue for sheet = ${mine?.revenue}`)

// [8] delete a line (PM can, it is an edit action)
console.log('\n[8] DELETE a line (PM allowed)')
const dl = await R(`/cost-sheets/${sheet.id}/lines/${lineId}`, { method: 'DELETE', token: PM })
ok(dl.status === 200 && !(dl.body.lines || []).some((x) => x.id === lineId), `line removed; remaining ${dl.body.lines?.length}`)

// [9] RBAC — Edit-level PM cannot delete a whole sheet; Sales cannot see the projects panel at all
console.log('\n[9] RBAC guards')
const delPm = await R(`/cost-sheets/${sheet.id}`, { method: 'DELETE', token: PM })
ok(delPm.status === 403, `PM (Edit) blocked from deleting sheet (${delPm.status})`)
if (SALES) {
  const salesTry = await R('/cost-sheets', { token: SALES })
  ok(salesTry.status === 403, `Sales User blocked from cost sheets panel (${salesTry.status})`)
} else ok(true, 'no Sales user to test panel guard (skipped)')

// [10] admin can delete the sheet (cascade lines)
console.log('\n[10] DELETE sheet (admin)')
const delAd = await R(`/cost-sheets/${sheet.id}`, { method: 'DELETE', token: AD })
ok(delAd.status === 200 && delAd.body.ok, `sheet deleted by admin`)
if (delAd.status === 200) cleanup.sheets = cleanup.sheets.filter((x) => x !== sheet.id)

// ── CLEANUP ──
console.log('\n[11] CLEANUP')
for (const id of cleanup.sheets) await supabase.from('cost_sheets').delete().eq('id', id) // cascade removes lines
if (cleanup.pos.length) await supabase.from('purchase_orders').delete().in('id', cleanup.pos.filter(Boolean))
if (cleanup.equip.length) await supabase.from('project_equipment').delete().in('id', cleanup.equip)
if (cleanup.project) await supabase.from('projects').delete().eq('id', cleanup.project)
await supabase.from('audit_log').delete().eq('entity', 'cost_sheet').eq('entity_id', String(sheet?.id || 'none'))
if (lineId) await supabase.from('audit_log').delete().eq('entity', 'cost_sheet_line').eq('entity_id', String(lineId))
console.log('  cleaned test project + equipment + PO + cost sheet(s)')

console.log(`\n######## RESULT: ${pass} passed, ${fail} failed ########`)
process.exit(fail ? 1 : 0)
