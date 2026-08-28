// Shared read-only LOOKUP layer. A page's dropdown often needs records from a panel the page's own
// role does not own (e.g. a Stock User raising a Delivery Note must pick a Customer + Project, but the
// customers/projects stores are gated to Sales/Projects). Rather than granting a blanket cross-panel
// data grant, these endpoints return ONLY the minimal {id, ref, name} needed to populate a picker —
// no financials, no detail — and are readable by any INTERNAL staff role. External Customers are blocked.
import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { internalOnly } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'

export function lookupsRouter() {
  const r = Router()
  r.use(authRequired, internalOnly)

  const list = (label, run) => asyncWrap(async (req, res) => {
    const { data, error } = await run(req)
    if (error) throw error
    res.json(data || [])
  })

  // projects → { id, ref, name, customer }
  r.get('/projects', list('projects', () =>
    supabase.from('projects').select('id, number, name, customer').order('created_at', { ascending: false }).limit(500)
      .then(({ data, error }) => ({ data: (data || []).map((p) => ({ id: p.id, ref: p.number, name: p.name, label: [p.number, p.name].filter(Boolean).join(' · '), customer: p.customer })), error }))))

  // customers → { id, name, code }
  r.get('/customers', list('customers', () =>
    supabase.from('customers').select('id, name, code, category').order('name').limit(1000)
      .then(({ data, error }) => ({ data: (data || []).map((c) => ({ id: c.id, name: c.name, code: c.code, category: c.category, label: c.name })), error }))))

  // suppliers → { id, name, code }
  r.get('/suppliers', list('suppliers', () =>
    supabase.from('suppliers').select('id, name, code, category').order('name').limit(1000)
      .then(({ data, error }) => ({ data: (data || []).map((s) => ({ id: s.id, name: s.name, code: s.code, category: s.category, label: s.name })), error }))))

  // items → { id, item_code, item_name, brand } (catalogue is already internal-wide; no cost here)
  r.get('/items', list('items', (req) => {
    let q = supabase.from('items').select('id, item_code, item_name, brand, uom, stock_uom, eos_entry_id').eq('disabled', false).order('item_name').limit(2000)
    if (req.query.sales === '1') q = q.eq('is_sales_item', true).eq('has_variants', false)
    return q.then(({ data, error }) => ({ data: (data || []).map((i) => ({ id: i.id, item_code: i.item_code, item_name: i.item_name, brand: i.brand, uom: i.uom || i.stock_uom || 'Nos', eos_linked: !!i.eos_entry_id, label: [i.item_code, i.item_name].filter(Boolean).join(' · ') })), error }))
  }))

  // warehouses → { id, code, name }
  r.get('/warehouses', list('warehouses', () =>
    supabase.from('warehouses').select('id, code, name, type').order('name').limit(200)
      .then(({ data, error }) => ({ data: (data || []).map((w) => ({ id: w.id, code: w.code, name: w.name, type: w.type, label: [w.code, w.name].filter(Boolean).join(' · ') })), error }))))

  // sales orders → { id, number, customer }. A Project Manager cannot read the sales panel, so without
  // this the project's originating Sales Order could only ever render as '—'. No money is exposed.
  r.get('/sales-orders', list('sales-orders', () =>
    supabase.from('sales_orders').select('id, number, customer, project_id').order('created_at', { ascending: false }).limit(500)
      .then(({ data, error }) => ({ data: (data || []).map((s) => ({ id: s.id, number: s.number, customer: s.customer, project_id: s.project_id, label: [s.number, s.customer].filter(Boolean).join(' · ') })), error }))))

  // quotations → { id, number, customer, status }. Needed by the PM's "Generate BOQ from Quotation" and
  // the Cost Sheet's quotation link — both dead for a PM otherwise. Deliberately carries NO money field
  // (no amount, no cost, no margin) — it is a picker, not a financial read.
  r.get('/quotations', list('quotations', () =>
    supabase.from('quotations').select('id, number, customer, status, project_id, created_at').order('created_at', { ascending: false }).limit(500)
      .then(({ data, error }) => ({ data: (data || []).map((q) => ({ id: q.id, number: q.number, customer: q.customer, status: q.status, project_id: q.project_id, label: [q.number, q.customer].filter(Boolean).join(' · ') })), error }))))

  // internal staff → { id, name, role }. Used to assign a Project Manager / a task assignee.
  r.get('/team', list('team', () =>
    supabase.from('users').select('id, name, role, designation').neq('role', 'Customer').order('name').limit(500)
      .then(({ data, error }) => ({ data: (data || []).map((u) => ({ id: u.id, name: u.name, role: u.role, designation: u.designation, label: `${u.name} · ${u.role}` })), error }))))

  return r
}

export default lookupsRouter
