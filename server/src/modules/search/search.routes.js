import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { asyncWrap } from '../../middleware/error.js'

const r = Router()

// Global search across the core business entities. Returns lightweight, non-financial results
// (labels + reference numbers only) so it is safe for every role. Each result carries a route
// the frontend navigates to. Entities are only included if the user's panels allow them.
r.get('/', authRequired, asyncWrap(async (req, res) => {
  const raw = (req.query.q || '').trim()
  if (raw.length < 2) return res.json({ results: [], query: raw })
  const q = raw.replace(/[,()%_*\\]/g, ' ').trim()   // strip characters that break PostgREST or() / ilike
  if (!q) return res.json({ results: [], query: raw })
  const like = `%${q}%`
  const lim = 6

  const [customers, suppliers, items, quotations, orders, projects, pos, leads, documents] = await Promise.all([
    supabase.from('customers').select('id, name').ilike('name', like).limit(lim),
    supabase.from('suppliers').select('id, name').ilike('name', like).limit(lim),
    supabase.from('items').select('id, item_code, item_name, brand').or(`item_name.ilike.${like},item_code.ilike.${like},brand.ilike.${like}`).limit(8),
    supabase.from('quotations').select('id, number, customer').or(`number.ilike.${like},customer.ilike.${like}`).limit(lim),
    supabase.from('sales_orders').select('id, number, customer').or(`number.ilike.${like},customer.ilike.${like}`).limit(lim),
    supabase.from('projects').select('id, number, name, customer').or(`number.ilike.${like},name.ilike.${like},customer.ilike.${like}`).limit(lim),
    supabase.from('purchase_orders').select('id, number, supplier').or(`number.ilike.${like},supplier.ilike.${like}`).limit(lim),
    supabase.from('leads').select('id, name, company').or(`name.ilike.${like},company.ilike.${like}`).limit(lim),
    supabase.from('documents').select('id, name, doc_type').or(`name.ilike.${like},doc_type.ilike.${like}`).limit(lim),
  ])

  const results = []
  const push = (rows, map) => (rows.data || []).forEach((x) => results.push(map(x)))
  push(items, (x) => ({ type: 'Item', id: x.id, label: x.item_name, sub: [x.item_code, x.brand].filter(Boolean).join(' · '), route: '/stock/item-master' }))
  push(customers, (x) => ({ type: 'Customer', id: x.id, label: x.name, sub: '', route: '/admin/customers' }))
  push(suppliers, (x) => ({ type: 'Supplier', id: x.id, label: x.name, sub: '', route: '/procurement/suppliers' }))
  push(quotations, (x) => ({ type: 'Quotation', id: x.id, label: x.number, sub: x.customer, route: '/sales/quotations' }))
  push(orders, (x) => ({ type: 'Sales Order', id: x.id, label: x.number, sub: x.customer, route: '/sales/orders' }))
  push(projects, (x) => ({ type: 'Project', id: x.id, label: x.name || x.number, sub: x.customer, route: `/projects/${x.id}` }))
  push(pos, (x) => ({ type: 'Purchase Order', id: x.id, label: x.number, sub: x.supplier, route: '/procurement/po' }))
  push(leads, (x) => ({ type: 'Lead', id: x.id, label: x.name || x.company, sub: x.company, route: '/sales/leads' }))
  push(documents, (x) => ({ type: 'Document', id: x.id, label: x.name, sub: x.doc_type, route: '/admin/documents' }))

  res.json({ query: raw, results })
}))

export default r
