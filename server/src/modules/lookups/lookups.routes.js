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
    let q = supabase.from('items').select('id, item_code, item_name, brand, uom, stock_uom, eos_entry_id').order('item_name').limit(2000)
    if (req.query.sales === '1') q = q.eq('is_sales_item', true).eq('has_variants', false)
    return q.then(({ data, error }) => ({ data: (data || []).map((i) => ({ id: i.id, item_code: i.item_code, item_name: i.item_name, brand: i.brand, uom: i.uom || i.stock_uom || 'Nos', eos_linked: !!i.eos_entry_id, label: [i.item_code, i.item_name].filter(Boolean).join(' · ') })), error }))
  }))

  // warehouses → { id, code, name }
  r.get('/warehouses', list('warehouses', () =>
    supabase.from('warehouses').select('id, code, name, type').order('name').limit(200)
      .then(({ data, error }) => ({ data: (data || []).map((w) => ({ id: w.id, code: w.code, name: w.name, type: w.type, label: [w.code, w.name].filter(Boolean).join(' · ') })), error }))))

  return r
}

export default lookupsRouter
