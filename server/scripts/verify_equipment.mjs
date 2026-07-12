// M8 — Project Equipment Management. Exercises the full flow against the LIVE API as the real role
// (Project Manager): assign an item to a project, snapshot code/name + rates, edit qty (totals
// recompute), enforce the delivery→installation→commissioning workflow, and roll it up in /summary.
// Self-cleaning. NOTE: these routes are mounted by the orchestrator — until then every call 404s;
// that is EXPECTED. Model: server/scripts/verify_stock_flow.mjs
import { supabase } from '../src/config/supabase.js'
import jwt from 'jsonwebtoken'
import { env } from '../src/config/env.js'
const BASE = process.env.BASE || 'http://localhost:5050/api'
const j = async (r) => { const t = await r.text(); let body; try { body = JSON.parse(t) } catch { body = t }; return { status: r.status, body } }
let pass = 0, fail = 0
const ok = (c, m) => { c ? (pass++, console.log('  ✓', m)) : (fail++, console.log('  ✗ FAIL', m)) }

// the real role that uses this module — Project Manager (has the 'projects' panel + sees financials)
const { data: pm } = await supabase.from('users').select('*').eq('email', 'pm@gmail.com').single()
const { data: admin } = await supabase.from('users').select('*').eq('email', 'admin@gmail.com').single()
const tok = (u) => jwt.sign({ id: u.id, name: u.name, email: u.email, role: u.role, access_level: u.access_level }, env.jwtSecret, { expiresIn: '1h' })
const H = { authorization: `Bearer ${tok(pm)}`, 'content-type': 'application/json' }
const AH = { authorization: `Bearer ${tok(admin)}`, 'content-type': 'application/json' }

console.log('\n######## M8 PROJECT EQUIPMENT (as Project Manager) ########')

let ROW = null
try {
  // [1] status vocabulary
  const meta = await fetch(`${BASE}/project-equipment/meta/status-options`, { headers: H }).then(j)
  ok(meta.status === 200 && Array.isArray(meta.body?.delivery) && meta.body.delivery.includes('Delivered'),
    `GET /meta/status-options -> ${meta.status} ${JSON.stringify(meta.body?.delivery || meta.body)}`)

  // [2] a real project + item to work with
  const projects = await fetch(`${BASE}/projects`, { headers: H }).then(j)
  const PROJ = Array.isArray(projects.body) ? projects.body[0] : null
  const items = await fetch(`${BASE}/items`, { headers: H }).then(j)
  const ITEM = Array.isArray(items.body) ? items.body[0] : null
  ok(!!PROJ && !!ITEM, `project ${PROJ?.number} / item ${ITEM?.item_code}`)
  if (!PROJ || !ITEM) throw new Error('no project/item available — cannot continue')

  // [3] validation — 422 on a project / item that does not exist
  const badProj = await fetch(`${BASE}/project-equipment`, { method: 'POST', headers: H, body: JSON.stringify({ project_id: '00000000-0000-0000-0000-000000000000', item_id: ITEM.id, qty: 1 }) }).then(j)
  ok(badProj.status === 422, `assign to non-existent project -> 422 (${badProj.body?.error})`)
  const badItem = await fetch(`${BASE}/project-equipment`, { method: 'POST', headers: H, body: JSON.stringify({ project_id: PROJ.id, item_name: 'ZZ_NOPE_ITEM', qty: 1 }) }).then(j)
  ok(badItem.status === 422, `assign non-existent item -> 422 (${badItem.body?.error})`)

  // [4] assign — snapshot code/name, totals = qty × rate, default lifecycle statuses
  const assign = await fetch(`${BASE}/project-equipment`, { method: 'POST', headers: H, body: JSON.stringify({ project_id: PROJ.id, item_id: ITEM.id, qty: 2, unit_price: 100, unit_cost: 60, area: 'ZZ Kitchen', position: 'A1' }) }).then(j)
  ok(assign.status === 201, `POST /project-equipment -> 201`)
  ROW = assign.body
  ok(ROW?.item_code === ITEM.item_code && ROW?.item_name === ITEM.item_name, `snapshot code/name: ${ROW?.item_code}`)
  ok(ROW?.total_cost === 120 && ROW?.total_price === 200, `totals qty×rate = cost ${ROW?.total_cost} / price ${ROW?.total_price}`)
  ok(ROW?.delivery_status === 'Pending' && ROW?.installation_status === 'Not Started' && ROW?.commissioning_status === 'Not Started', `default statuses`)

  // [5] edit qty → totals recompute
  const patch = await fetch(`${BASE}/project-equipment/${ROW.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ qty: 3 }) }).then(j)
  ok(patch.status === 200 && patch.body?.total_cost === 180 && patch.body?.total_price === 300, `PATCH qty=3 -> totals 180/300`)

  // [6] workflow gates
  const instEarly = await fetch(`${BASE}/project-equipment/${ROW.id}/status`, { method: 'POST', headers: H, body: JSON.stringify({ field: 'installation', value: 'Completed' }) }).then(j)
  ok(instEarly.status === 422, `installation Completed before Delivered -> 422 (${instEarly.body?.error})`)
  const commEarly = await fetch(`${BASE}/project-equipment/${ROW.id}/status`, { method: 'POST', headers: H, body: JSON.stringify({ field: 'commissioning', value: 'Completed' }) }).then(j)
  ok(commEarly.status === 422, `commissioning Completed before installation -> 422 (${commEarly.body?.error})`)
  const badVal = await fetch(`${BASE}/project-equipment/${ROW.id}/status`, { method: 'POST', headers: H, body: JSON.stringify({ field: 'delivery', value: 'Teleported' }) }).then(j)
  ok(badVal.status === 422, `invalid status value -> 422`)

  // [7] advance through the workflow in order
  const d1 = await fetch(`${BASE}/project-equipment/${ROW.id}/status`, { method: 'POST', headers: H, body: JSON.stringify({ field: 'delivery', value: 'Delivered' }) }).then(j)
  ok(d1.status === 200 && d1.body?.delivery_status === 'Delivered', `delivery -> Delivered`)
  const i1 = await fetch(`${BASE}/project-equipment/${ROW.id}/status`, { method: 'POST', headers: H, body: JSON.stringify({ field: 'installation', value: 'Completed' }) }).then(j)
  ok(i1.status === 200 && i1.body?.installation_status === 'Completed', `installation -> Completed (now allowed)`)
  const c1 = await fetch(`${BASE}/project-equipment/${ROW.id}/status`, { method: 'POST', headers: H, body: JSON.stringify({ field: 'commissioning', value: 'Completed' }) }).then(j)
  ok(c1.status === 200 && c1.body?.commissioning_status === 'Completed', `commissioning -> Completed (now allowed)`)

  // [8] summary roll-up + scoped list
  const sum = await fetch(`${BASE}/project-equipment/summary/${PROJ.id}`, { headers: H }).then(j)
  ok(sum.status === 200 && sum.body?.item_count >= 1 && sum.body?.total_qty >= 3, `summary count ${sum.body?.item_count} qty ${sum.body?.total_qty}`)
  ok(sum.body?.margin === (sum.body?.total_price - sum.body?.total_cost), `margin = price - cost = ${sum.body?.margin}`)
  const list = await fetch(`${BASE}/project-equipment?project_id=${PROJ.id}`, { headers: H }).then(j)
  ok(list.status === 200 && Array.isArray(list.body) && list.body.some((x) => x.id === ROW.id), `scoped list returns the row`)

  // [9] RBAC — PM (Edit level) cannot delete; admin can
  const pmDel = await fetch(`${BASE}/project-equipment/${ROW.id}`, { method: 'DELETE', headers: H }).then(j)
  ok(pmDel.status === 403, `PM (Edit) DELETE -> 403`)
  const del = await fetch(`${BASE}/project-equipment/${ROW.id}`, { method: 'DELETE', headers: AH }).then(j)
  ok(del.status === 200 && del.body?.ok, `admin DELETE -> ok`)
  if (del.status === 200) ROW = null
} catch (e) {
  ok(false, `flow aborted: ${e.message}`)
}

// [10] CLEANUP — remove anything this run created, directly (safety net if the API 404'd)
if (ROW?.id) await supabase.from('project_equipment').delete().eq('id', ROW.id)
await supabase.from('project_equipment').delete().eq('area', 'ZZ Kitchen')
console.log('  cleaned test equipment rows')

console.log(`\n######## RESULT: ${pass} passed, ${fail} failed ########`)
process.exit(fail ? 1 : 0)
