import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'
import { logAudit } from '../../core/audit.js'
import { rolePanels, PANELS, levelActions, canAccessPanel } from '../../rbac/permissions.js'

const r = Router()

// ── AUDIT TRAIL viewer (admin) — filterable ──
r.get('/audit', authRequired, authorize('admin', 'read'), asyncWrap(async (req, res) => {
  let q = supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(Math.min(500, Number(req.query.limit) || 200))
  if (req.query.entity) q = q.eq('entity', req.query.entity)
  if (req.query.action) q = q.eq('action', req.query.action)
  if (req.query.user_id) q = q.eq('user_id', req.query.user_id)
  const { data, error } = await q
  if (error) throw error
  res.json(data || [])
}))

// ── LIVE MODULE STATS (admin "All Modules" snapshot) — real counts per operational panel ──
r.get('/module-stats', authRequired, authorize('admin', 'read'), asyncWrap(async (req, res) => {
  const n = async (table, filter) => {
    let q = supabase.from(table).select('id', { count: 'exact', head: true })
    if (filter) q = filter(q)
    const { count } = await q
    return count || 0
  }
  const [quotations, orders, projects, pos, suppliers, items, warehouses, invoices, payments, snags, tickets, employees, users, customers] = await Promise.all([
    n('quotations'), n('sales_orders'), n('projects'), n('purchase_orders'), n('suppliers'),
    n('items'), n('warehouses'), n('invoices'), n('payments'), n('snags'), n('service_tickets'),
    n('employees'), n('users'), n('customers'),
  ])
  res.json([
    { name: 'Sales & Estimation', icon: 'sales', metric: quotations + orders, sub: `${quotations} quotations · ${orders} orders` },
    { name: 'Projects', icon: 'projects', metric: projects, sub: `${projects} projects` },
    { name: 'Procurement', icon: 'procurement', metric: pos, sub: `${pos} POs · ${suppliers} suppliers` },
    { name: 'Warehouse / Stock', icon: 'stock', metric: items, sub: `${items} items · ${warehouses} warehouses` },
    { name: 'Finance', icon: 'finance', metric: invoices, sub: `${invoices} invoices · ${payments} payments` },
    { name: 'Site Execution', icon: 'site', metric: snags, sub: `${snags} snags logged` },
    { name: 'Service', icon: 'service', metric: tickets, sub: `${tickets} tickets` },
    { name: 'HR', icon: 'hr', metric: employees, sub: `${employees} employees` },
    { name: 'Users', icon: 'sales', metric: users, sub: `${users} system users` },
    { name: 'Customers', icon: 'projects', metric: customers, sub: `${customers} customers` },
  ])
}))

// ── COMPANY KPIs + revenue trend (admin Executive Dashboard) — real aggregates ──
r.get('/company-stats', authRequired, authorize('admin', 'read'), asyncWrap(async (req, res) => {
  const [so, po, inv, projects, tickets, bals, items] = await Promise.all([
    supabase.from('sales_orders').select('amount, created_at'),
    supabase.from('purchase_orders').select('amount, created_at'),
    supabase.from('invoices').select('total, paid, status'),
    supabase.from('projects').select('status'),
    supabase.from('service_tickets').select('status'),
    supabase.from('stock_balances').select('item_id, qty'),
    supabase.from('items').select('id, cost'),
  ])
  const rows = (x) => x.data || []
  const sum = (arr, f) => arr.reduce((s, r) => s + (Number(r[f]) || 0), 0)
  const revenue = sum(rows(so), 'amount')
  const procurementSpend = sum(rows(po), 'amount')
  const receivables = rows(inv).reduce((s, r) => s + Math.max(0, (Number(r.total) || 0) - (Number(r.paid) || 0)), 0)
  const active = ['On Track', 'At Risk', 'Delayed', 'Working', 'In Progress']
  const activeProjects = rows(projects).filter((p) => active.includes(p.status)).length
  const openTickets = rows(tickets).filter((t) => !['Resolved', 'Closed', 'Done'].includes(t.status)).length
  const costOf = Object.fromEntries(rows(items).map((i) => [i.id, Number(i.cost) || 0]))
  const stockValue = rows(bals).reduce((s, b) => s + (Number(b.qty) || 0) * (costOf[b.item_id] || 0), 0)

  // last 6 months revenue (from SO) and net (revenue − procurement) per month
  const key = (d) => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth()}` }
  const label = (d) => new Date(d).toLocaleString('en', { month: 'short' })
  const months = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ k: `${d.getFullYear()}-${d.getMonth()}`, m: label(d) }) }
  const byMonth = (arr) => { const map = {}; for (const r of arr) { if (!r.created_at) continue; map[key(r.created_at)] = (map[key(r.created_at)] || 0) + (Number(r.amount) || 0) } return map }
  const soM = byMonth(rows(so)), poM = byMonth(rows(po))
  const trend = months.map(({ k, m }) => ({ m, revenue: Math.round((soM[k] || 0) / 1000), profit: Math.round(((soM[k] || 0) - (poM[k] || 0)) / 1000) }))

  res.json({
    revenue, netProfit: revenue - procurementSpend, procurementSpend, receivables, stockValue,
    activeProjects, totalProjects: rows(projects).length, openTickets, trend,
  })
}))

// ── RBAC matrix (read-only reference of the single source of truth in permissions.js) ──
r.get('/rbac', authRequired, authorize('admin', 'read'), (req, res) => {
  res.json({ panels: PANELS, rolePanels, levelActions })
})

// ── APPROVAL WORKFLOW (generic) ──
// list — admin/management see every request; everyone else sees ONLY their own (a Customer or a
// Sales user must never be able to enumerate the whole approval queue).
r.get('/approvals', authRequired, asyncWrap(async (req, res) => {
  let q = supabase.from('approvals').select('*').order('created_at', { ascending: false }).limit(200)
  if (req.query.status) q = q.eq('status', req.query.status)
  const isApprover = canAccessPanel(req.user.role, 'admin')
  if (!isApprover || req.query.mine === '1') q = q.eq('requested_by', req.user.id)
  const { data, error } = await q
  if (error) throw error
  res.json(data || [])
}))
// create an approval request (any authenticated user)
r.post('/approvals', authRequired, asyncWrap(async (req, res) => {
  const b = req.body
  const { data, error } = await supabase.from('approvals').insert({
    entity_type: b.entity_type, entity_id: b.entity_id != null ? String(b.entity_id) : null, title: b.title,
    amount: b.amount != null && b.amount !== '' ? Number(b.amount) : null, reason: b.reason || null,
    approver_role: b.approver_role || 'Management', requested_by: req.user.id, requested_by_name: req.user.name,
  }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  await logAudit(req.user, 'approval', data.id, 'requested', { title: b.title }).catch(() => {})
  res.status(201).json(data)
}))
// decide — only users with approve access on the admin panel (Management / Approval level)
r.post('/approvals/:id/decide', authRequired, authorize('admin', 'approve'), asyncWrap(async (req, res) => {
  const decision = req.body.decision === 'approved' ? 'approved' : 'rejected'
  const { data, error } = await supabase.from('approvals').update({
    status: decision, decided_by: req.user.id, decided_by_name: req.user.name,
    decision_note: req.body.note || null, decided_at: new Date().toISOString(),
  }).eq('id', req.params.id).eq('status', 'pending').select().maybeSingle()
  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(409).json({ error: 'Already decided or not found' })
  await logAudit(req.user, 'approval', req.params.id, decision, {}).catch(() => {})
  res.json(data)
}))

export default r
