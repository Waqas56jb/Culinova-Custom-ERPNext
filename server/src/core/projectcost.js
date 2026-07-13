import { supabase } from '../config/supabase.js'

// Single source of truth for project cost, billing & progress — recomputed from the project's REAL
// children every time one of them changes. This keeps committed_cost / actual_cost / billed / collected
// (and therefore GP and the collection %) ALWAYS real and in sync.
//
// COMMITTED = what we have promised to spend:  BOQ budgets + approved variations + assigned equipment
// ACTUAL    = what we have actually spent:     BOQ actuals + purchase orders raised on the project
// BILLED    = what we have invoiced the customer      (Σ invoices.total)
// COLLECTED = what the customer has actually paid us  (Σ invoices.paid)
const DEAD = ['Rejected', 'Cancelled', 'Draft', 'Void']
const n0 = (v) => Number(v) || 0
const alive = (rows, key = 'status') => (rows || []).filter((r) => !DEAD.includes(r[key]))

export async function recomputeProject(projectId) {
  if (!projectId) return
  const [{ data: boq }, { data: vars }, { data: pos }, { data: equip }, { data: invs }] = await Promise.all([
    supabase.from('project_boq').select('budget_cost, actual_cost, status').eq('project_id', projectId),
    supabase.from('variation_orders').select('amount, status').eq('project_id', projectId),
    supabase.from('purchase_orders').select('amount, status').eq('project_id', projectId),
    // equipment assigned to the project is a real committed cost — it used to be invisible to the P&L,
    // so anything added through the Project Equipment page never reached the PM's margin
    supabase.from('project_equipment').select('total_cost').eq('project_id', projectId),
    // billed / collected were NEVER written by any code path, so every project reported 0 forever
    supabase.from('invoices').select('total, paid, status').eq('project_id', projectId),
  ])

  const rows = boq || []
  const varAmt = alive(vars).reduce((s, v) => s + n0(v.amount), 0)
  const equipAmt = (equip || []).reduce((s, e) => s + n0(e.total_cost), 0)
  const committed = rows.reduce((s, b) => s + n0(b.budget_cost), 0) + varAmt + equipAmt

  const poAmt = alive(pos).reduce((s, p) => s + n0(p.amount), 0)
  const actual = rows.reduce((s, b) => s + n0(b.actual_cost), 0) + poAmt

  const liveInvs = alive(invs)
  const billed = liveInvs.reduce((s, i) => s + n0(i.total), 0)
  const collected = liveInvs.reduce((s, i) => s + n0(i.paid), 0)

  const total = rows.length
  const done = rows.filter((b) => ['Installed', 'Delivered'].includes(b.status)).length
  const progress = total ? Math.round((done / total) * 100) : 0

  const patch = {
    committed_cost: committed, actual_cost: actual,
    billed, collected, progress,
  }
  if (total > 0 && done === total) patch.status = 'Completed' // all installed → auto-complete
  await supabase.from('projects').update(patch).eq('id', projectId)
  return patch
}

// Re-roll EVERY project. Used by the data-repair script and after a bulk import — a stored total that
// was hand-set once and never recomputed is a number nobody can trust.
export async function recomputeAllProjects() {
  const { data: projects } = await supabase.from('projects').select('id')
  const out = []
  for (const p of projects || []) out.push({ id: p.id, ...(await recomputeProject(p.id)) })
  return out
}
