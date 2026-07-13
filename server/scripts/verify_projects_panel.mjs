// PROJECT MANAGEMENT PANEL — end-to-end verification as the REAL Project Manager.
// Covers: the Sales→Projects handover, the cost engine (BOQ + variations + POs + EQUIPMENT + invoices),
// every page's data contract, the PM's cross-panel lookups, the procurement hand-off, and role access.
// Self-cleaning.
import { supabase } from '../src/config/supabase.js'
import jwt from 'jsonwebtoken'
import { env } from '../src/config/env.js'
import { recomputeProject } from '../src/core/projectcost.js'

const BASE = process.env.BASE || 'http://localhost:5050/api'
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
let pass = 0, fail = 0; const fails = []
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m) } else { fail++; fails.push(m); console.log('  ✗ FAIL', m) } }
const S = (s) => console.log(`\n── ${s} ──`)
const n0 = (v) => Number(v) || 0

const userBy = async (e) => (await supabase.from('users').select('*').eq('email', e).single()).data
const sign = (u) => jwt.sign({ id: u.id, name: u.name, email: u.email, role: u.role, access_level: u.access_level }, env.jwtSecret, { expiresIn: '1h' })
const H = (t) => ({ authorization: `Bearer ${t}`, 'content-type': 'application/json' })

const pm = await userBy('pm@gmail.com')          // Project Manager / Edit  ← the panel's real user
const admin = await userBy('admin@gmail.com')    // Management / Full Admin
const sales = await userBy('ali@culinova.sa')    // Sales User — must NOT see projects
const P = H(sign(pm)), A = H(sign(admin)), SL = H(sign(sales))

console.log(`\n######## PROJECTS PANEL — ${BASE} ########`)
console.log(`  Project Manager: ${pm.name} <${pm.email}> (${pm.role} / ${pm.access_level})`)

const clean = { quotations: [], projects: [], sales_orders: [], prs: [], equipment: [], tasks: [], variations: [], invoices: [], opps: [], leads: [] }

// ─────────────────────────────────────────────────────────────────────────────
S('ROLE ACCESS — the panel belongs to the PM, and to nobody else')
ok((await fetch(`${BASE}/projects`, { headers: SL })).status === 403, 'Sales User → /projects 403 (correctly locked out)')
ok((await fetch(`${BASE}/projects`, { headers: P })).status === 200, 'Project Manager → /projects 200')
for (const ep of ['project-boq', 'project-tasks', 'variations', 'project-equipment', 'boqs', 'cost-sheets', 'ai/margin-analysis']) {
  ok((await fetch(`${BASE}/${ep}`, { headers: P })).status === 200, `PM → /${ep} 200`)
}

S('CROSS-PANEL LOOKUPS — the pickers a PM needs from panels they cannot read')
for (const ep of ['lookups/sales-orders', 'lookups/quotations', 'lookups/team', 'lookups/warehouses', 'lookups/items']) {
  const r = await fetch(`${BASE}/${ep}`, { headers: P }); const d = await j(r)
  ok(r.status === 200 && Array.isArray(d), `PM → /${ep} ${r.status} (${Array.isArray(d) ? d.length : '?'} rows)`)
}
const lq = await fetch(`${BASE}/lookups/quotations`, { headers: P }).then(j)
ok(!lq[0] || (lq[0].amount === undefined && lq[0].total_amount === undefined && lq[0].cost_amount === undefined),
  'lookups/quotations exposes NO money field (it is a picker, not a financial read)')
ok((await fetch(`${BASE}/sales/quotations`, { headers: P })).status === 403, 'PM still cannot read the sales panel itself (403) — only the lookup')

// ─────────────────────────────────────────────────────────────────────────────
S('HANDOVER — customer accepts a quotation → Sales Order + Project + BOQ land with the PM')
const { data: item } = await supabase.from('items').select('*').limit(1).single()
const q = await fetch(`${BASE}/quotations`, {
  method: 'POST', headers: A,
  body: JSON.stringify({
    customer: 'ZZPROJ Verify Co', customer_email: 'zzproj@example.com', contact_person: 'Mr ZZ',
    project_name: 'ZZ Verify Kitchen', project_location: 'ZZ Riyadh', payment_terms: '30% advance',
    delivery_date: '2026-12-01', notes: 'ZZ handover note',
    items: [{ item_id: item.id, qty: 2, rate: 5000 }],
  }),
}).then(j)
ok(!!q.id, `quotation built → ${q.number}`)
if (q.id) clean.quotations.push(q.id)

const acc = await fetch(`${BASE}/sales/quotations/${q.id}/accept`, { method: 'POST', headers: A }).then(j)
ok(acc.ok && acc.project?.id, `accepted → Sales Order ${acc.sales_order?.number} + Project ${acc.project?.number}`)
const PID = acc.project?.id
if (PID) clean.projects.push(PID)
if (acc.sales_order?.id) clean.sales_orders.push(acc.sales_order.id)

if (PID) {
  // the PM must actually SEE the project that Sales just handed over
  const mine = await fetch(`${BASE}/projects`, { headers: P }).then(j)
  const proj = (mine || []).find((x) => x.id === PID)
  ok(!!proj, 'PM SEES the newly handed-over project')
  ok(n0(proj?.contract_value) > 0, `contract_value handed over → ${proj?.contract_value}`)
  ok(!!proj?.contact_person && !!proj?.location && !!proj?.payment_terms, 'handover fields populated (contact / location / payment terms)')

  const boq = await fetch(`${BASE}/project-boq?project_id=${PID}`, { headers: P }).then(j)
  ok(Array.isArray(boq) && boq.length > 0, `BOQ lines handed over → ${boq.length} line(s)`)

  // the PM sees the originating Sales Order via the lookup (they cannot read the sales panel)
  const sos = await fetch(`${BASE}/lookups/sales-orders`, { headers: P }).then(j)
  ok((sos || []).some((s) => s.id === proj?.sales_order_id), 'PM can resolve the originating Sales Order number (was always "—")')
}

// ─────────────────────────────────────────────────────────────────────────────
S('COST ENGINE — every input must move the project P&L')
if (PID) {
  const cost = async () => (await supabase.from('projects').select('committed_cost, actual_cost, billed, collected, progress').eq('id', PID).single()).data
  const base = await cost()
  ok(true, `baseline: committed ${base.committed_cost} · actual ${base.actual_cost} · billed ${base.billed}`)

  // 1) BOQ budget/actual
  const { data: line } = await supabase.from('project_boq').select('id').eq('project_id', PID).limit(1).single()
  await fetch(`${BASE}/pm/boq/${line.id}`, { method: 'PATCH', headers: P, body: JSON.stringify({ budget_cost: 700, actual_cost: 250 }) })
  let c = await cost()
  ok(n0(c.committed_cost) === 700 && n0(c.actual_cost) === 250, `BOQ budget/actual → committed ${c.committed_cost} · actual ${c.actual_cost}`)

  // 2) variation order
  const vo = await fetch(`${BASE}/variations`, { method: 'POST', headers: P, body: JSON.stringify({ project_id: PID, description: 'ZZ extra scope', amount: 300, status: 'Approved' }) }).then(j)
  if (vo.id) clean.variations.push(vo.id)
  c = await cost()
  ok(n0(c.committed_cost) === 1000, `+ approved variation 300 → committed ${c.committed_cost}`)

  // 3) purchase order raised against the project
  const po = await fetch(`${BASE}/purchase-orders`, { method: 'POST', headers: A, body: JSON.stringify({ supplier: 'ZZ Supplier', item_name: item.item_name, qty: 1, amount: 900, project_id: PID, status: 'Pending' }) }).then(j)
  c = await cost()
  ok(n0(c.actual_cost) === 1150, `+ PO 900 → actual ${c.actual_cost} (procurement spend reaches the PM)`)
  if (po.id) await supabase.from('purchase_orders').delete().eq('id', po.id)

  // 4) EQUIPMENT — this used to be completely invisible to the project P&L
  const eq = await fetch(`${BASE}/project-equipment`, { method: 'POST', headers: P, body: JSON.stringify({ project_id: PID, item_id: item.id, qty: 2, unit_cost: 400 }) }).then(j)
  if (eq.id) clean.equipment.push(eq.id)
  c = await cost()
  ok(n0(c.committed_cost) === 1800, `+ equipment 2×400 → committed ${c.committed_cost} (was NEVER counted before)`)

  // 5) INVOICE — billed/collected were dead columns that nothing ever wrote
  const inv = await fetch(`${BASE}/invoices`, { method: 'POST', headers: A, body: JSON.stringify({ customer: 'ZZPROJ Verify Co', project_id: PID, total: 6000, paid: 2500, status: 'Sent' }) }).then(j)
  if (inv.id) clean.invoices.push(inv.id)
  c = await cost()
  ok(n0(c.billed) === 6000 && n0(c.collected) === 2500, `+ invoice → billed ${c.billed} · collected ${c.collected} (both were permanently 0)`)

  // 6) progress + auto-complete
  await supabase.from('project_boq').update({ status: 'Installed' }).eq('project_id', PID)
  await recomputeProject(PID)
  c = await cost()
  ok(n0(c.progress) === 100, `all BOQ installed → progress ${c.progress}% (auto-complete)`)
}

// ─────────────────────────────────────────────────────────────────────────────
S('PROCUREMENT HAND-OFF — "Send to Procurement" must actually create something')
if (PID) {
  await supabase.from('project_boq').update({ status: 'Waiting' }).eq('project_id', PID)
  const r = await fetch(`${BASE}/pm/projects/${PID}/to-procurement`, { method: 'POST', headers: P, body: JSON.stringify({ priority: 'High' }) })
  const d = await j(r)
  ok(r.status === 201 && d.purchase_requisition, `raised a REAL Purchase Requisition → ${d.purchase_requisition} (${d.items} item/s) — it used to create nothing`)
  if (d.pr_id) clean.prs.push(d.pr_id)
  const { data: after } = await supabase.from('project_boq').select('status').eq('project_id', PID)
  ok((after || []).every((b) => b.status === 'In Progress'), 'BOQ lines marked In Progress only AFTER the PR was created')
  const empty = await fetch(`${BASE}/pm/projects/${PID}/to-procurement`, { method: 'POST', headers: P })
  ok(empty.status === 422, `nothing left Waiting → ${empty.status} (honest refusal, not a silent no-op)`)
}

// ─────────────────────────────────────────────────────────────────────────────
S('TASK BOARD — a PM must be able to plan work')
if (PID) {
  const bad = await fetch(`${BASE}/project-tasks`, { method: 'POST', headers: P, body: JSON.stringify({ project_id: PID, name: 'ZZ bad', assignee: 'someone' }) })
  ok(bad.status >= 400, `posting the non-existent column "assignee" → ${bad.status} (the old client did exactly this)`)
  const t = await fetch(`${BASE}/project-tasks`, { method: 'POST', headers: P, body: JSON.stringify({ project_id: PID, name: 'ZZ verify task', status: 'Open', assignee_id: pm.id, due_date: '2026-12-31' }) }).then(j)
  ok(!!t.id, 'PM can CREATE a task with assignee_id (the board was read-only and unfillable)')
  if (t.id) clean.tasks.push(t.id)
}

// ─────────────────────────────────────────────────────────────────────────────
S('PM ASSIGNMENT — a project can finally have a manager')
if (PID) {
  const up = await fetch(`${BASE}/projects/${PID}`, { method: 'PATCH', headers: P, body: JSON.stringify({ manager_id: pm.id }) })
  const { data: row } = await supabase.from('projects').select('manager_id, contract_value').eq('id', PID).single()
  ok(up.status === 200 && row.manager_id === pm.id, 'PM can assign a Project Manager (every project had manager_id NULL)')
  // and contract_value must STILL be protected from the PM
  const before = n0(row.contract_value)
  await fetch(`${BASE}/projects/${PID}`, { method: 'PATCH', headers: P, body: JSON.stringify({ contract_value: 999999 }) })
  const { data: row2 } = await supabase.from('projects').select('contract_value').eq('id', PID).single()
  ok(n0(row2.contract_value) === before, `contract_value still PROTECTED from the PM (${before} unchanged) — the UI now says so instead of lying`)
}

// ─────────────────────────────────────────────────────────────────────────────
S('CLEANUP')
for (const id of clean.tasks) await supabase.from('project_tasks').delete().eq('id', id)
for (const id of clean.equipment) await supabase.from('project_equipment').delete().eq('id', id)
for (const id of clean.variations) await supabase.from('variation_orders').delete().eq('id', id)
for (const id of clean.invoices) await supabase.from('invoices').delete().eq('id', id)
for (const id of clean.prs) { await supabase.from('purchase_requisition_items').delete().eq('pr_id', id); await supabase.from('purchase_requisitions').delete().eq('id', id) }
for (const id of clean.projects) { await supabase.from('project_boq').delete().eq('project_id', id); await supabase.from('projects').delete().eq('id', id) }
for (const id of clean.sales_orders) await supabase.from('sales_orders').delete().eq('id', id)
for (const id of clean.quotations) {
  await supabase.from('quotation_items').delete().eq('quotation_id', id)
  await supabase.from('quotation_revisions').delete().eq('quotation_id', id)
  await supabase.from('quotations').delete().eq('id', id)
}
await supabase.from('opportunities').delete().ilike('customer', 'ZZPROJ%')
await supabase.from('leads').delete().ilike('company', 'ZZPROJ%')
await supabase.from('notifications').delete().ilike('body', '%ZZPROJ%')
console.log('  cleaned every test row')

console.log(`\n######## PROJECTS PANEL RESULT: ${pass} passed, ${fail} failed ########`)
if (fail) fails.forEach((f) => console.log('   -', f))
process.exit(fail ? 1 : 0)
