// Cost Engine. A cost sheet is the profitability model for a project (or a quotation before it wins):
// every cost bucket the business actually incurs, plus the revenue it expects, rolled into
// gross profit and net profit. Totals are always DERIVED from the lines — a stored total can never
// disagree with its breakdown.
import { supabase } from '../config/supabase.js'

const round = (n) => Math.round((Number(n) || 0) * 100) / 100
const n0 = (v) => Number(v) || 0

// The buckets a cost line can belong to. Each maps to the column it rolls up into on the sheet.
export const COST_CATEGORIES = [
  { key: 'Material', column: 'material_cost' },
  { key: 'Manufacturing', column: 'manufacturing_cost' },
  { key: 'Purchase', column: 'purchase_cost' },
  { key: 'Labor', column: 'labor_cost' },
  { key: 'Installation', column: 'installation_cost' },
]
export const CATEGORY_KEYS = COST_CATEGORIES.map((c) => c.key)

// Roll lines up into the sheet. Overhead is a % of the direct cost (project overhead allocation),
// so it scales with the job instead of being a number someone forgets to update.
export function rollup(lines = [], sheet = {}) {
  const buckets = {}
  for (const c of COST_CATEGORIES) buckets[c.column] = 0
  for (const l of lines) {
    const cat = COST_CATEGORIES.find((c) => c.key.toLowerCase() === String(l.category || '').toLowerCase())
    const amount = l.amount != null ? n0(l.amount) : n0(l.qty) * n0(l.rate)
    if (cat) buckets[cat.column] += amount
  }
  const direct = Object.values(buckets).reduce((s, v) => s + v, 0)
  const overhead_pct = n0(sheet.overhead_pct)
  const overhead_cost = (direct * overhead_pct) / 100
  const total_cost = direct + overhead_cost
  const revenue = n0(sheet.revenue)
  const gross_profit = revenue - direct
  const net_profit = revenue - total_cost
  return {
    ...Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, round(v)])),
    overhead_pct: round(overhead_pct),
    overhead_cost: round(overhead_cost),
    total_cost: round(total_cost),
    revenue: round(revenue),
    gross_profit: round(gross_profit),
    gp_percent: revenue > 0 ? round((gross_profit / revenue) * 100) : 0,
    net_profit: round(net_profit),
    np_percent: revenue > 0 ? round((net_profit / revenue) * 100) : 0,
  }
}

// Recompute a sheet from its lines and persist the totals. Called after ANY line change.
export async function recalcSheet(sheetId) {
  const { data: sheet, error } = await supabase.from('cost_sheets').select('*').eq('id', sheetId).single()
  if (error) throw new Error(error.message)
  const { data: lines } = await supabase.from('cost_sheet_lines').select('*').eq('cost_sheet_id', sheetId)
  const totals = rollup(lines || [], sheet)
  const { data: updated, error: uErr } = await supabase
    .from('cost_sheets').update({ ...totals, updated_at: new Date().toISOString() })
    .eq('id', sheetId).select().single()
  if (uErr) throw new Error(uErr.message)
  return { ...updated, lines: lines || [] }
}

// The breakdown a UI can render directly: every bucket with its share of total cost.
export function breakdown(sheet = {}) {
  const rows = COST_CATEGORIES.map((c) => ({ category: c.key, amount: round(sheet[c.column]) }))
  rows.push({ category: 'Overhead', amount: round(sheet.overhead_cost) })
  const total = rows.reduce((s, r) => s + r.amount, 0)
  return rows.map((r) => ({ ...r, pct: total > 0 ? round((r.amount / total) * 100) : 0 }))
}
