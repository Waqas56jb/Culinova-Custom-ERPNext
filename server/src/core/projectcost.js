import { supabase } from '../config/supabase.js'

// Single source of truth for project cost & progress — recomputed from the BOQ
// every time an item changes (budget, actual cost, or install status). This keeps
// committed_cost / actual_cost / progress (and therefore GP) ALWAYS real & in sync.
export async function recomputeProject(projectId) {
  if (!projectId) return
  const { data: boq } = await supabase.from('project_boq').select('budget_cost, actual_cost, status').eq('project_id', projectId)
  const rows = boq || []
  const committed = rows.reduce((s, b) => s + (Number(b.budget_cost) || 0), 0)
  const actual = rows.reduce((s, b) => s + (Number(b.actual_cost) || 0), 0)
  const total = rows.length
  const done = rows.filter((b) => ['Installed', 'Delivered'].includes(b.status)).length
  const progress = total ? Math.round((done / total) * 100) : 0
  const patch = { committed_cost: committed, actual_cost: actual, progress }
  if (total > 0 && done === total) patch.status = 'Completed' // all installed → auto-complete
  await supabase.from('projects').update(patch).eq('id', projectId)
}
