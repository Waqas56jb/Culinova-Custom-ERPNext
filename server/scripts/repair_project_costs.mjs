// Data repair: re-roll EVERY project's cost/billing/progress from its real children.
// Some projects carry a committed_cost that was hand-set once and never recomputed — a number nobody
// can trust, which would silently vanish the next time any BOQ/variation/PO touched the project.
// Safe to re-run: it only ever recomputes from the rows that actually exist.
import { supabase } from '../src/config/supabase.js'
import { recomputeAllProjects } from '../src/core/projectcost.js'

console.log('\n######## REPAIR PROJECT COSTS ########\n')

const { data: before } = await supabase.from('projects').select('id, number, name, contract_value, committed_cost, actual_cost, billed, collected, progress')
const beforeMap = Object.fromEntries((before || []).map((p) => [p.id, p]))

const results = await recomputeAllProjects()

for (const r of results) {
  const b = beforeMap[r.id] || {}
  const changed = ['committed_cost', 'actual_cost', 'billed', 'collected', 'progress']
    .filter((k) => Number(b[k] || 0) !== Number(r[k] || 0))
  const tag = changed.length ? 'CHANGED' : 'ok     '
  console.log(`  ${tag} ${(b.number || r.id).padEnd(18)} ${(b.name || '').slice(0, 30).padEnd(32)}`)
  for (const k of changed) console.log(`          ${k}: ${Number(b[k] || 0)} → ${Number(r[k] || 0)}`)
}

const n = results.filter((r) => {
  const b = beforeMap[r.id] || {}
  return ['committed_cost', 'actual_cost', 'billed', 'collected', 'progress'].some((k) => Number(b[k] || 0) !== Number(r[k] || 0))
}).length
console.log(`\n######## ${results.length} projects re-rolled · ${n} corrected ########\n`)
process.exit(0)
