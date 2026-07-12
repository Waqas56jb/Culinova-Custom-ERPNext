import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { asyncWrap } from '../../middleware/error.js'
import { canAccessPanel, isInternal } from '../../rbac/permissions.js'

const r = Router()

// Global search across the core business entities. Returns lightweight, non-financial results
// (labels + reference numbers only). Each entity is gated by the panel it belongs to, so a user only
// ever finds records their role can already open — a portal Customer (zero panels) finds nothing, and
// a Sales user cannot enumerate suppliers or purchase orders. Item Master is the shared catalogue
// (visible to every role, like the sidebar), so it has no panel gate.
r.get('/', authRequired, asyncWrap(async (req, res) => {
  const raw = (req.query.q || '').trim()
  if (raw.length < 2) return res.json({ results: [], query: raw })
  const q = raw.replace(/[,()%_*\\]/g, ' ').trim()   // strip characters that break PostgREST or() / ilike
  if (!q) return res.json({ results: [], query: raw })
  const like = `%${q}%`
  const lim = 6
  const can = (panel) => canAccessPanel(req.user.role, panel)

  // An external (zero-panel) role such as a portal Customer searches nothing.
  if (!isInternal(req.user.role)) return res.json({ query: raw, results: [] })

  // each searchable entity → the panel that owns it (null = shared catalogue, every INTERNAL role).
  // Only entities the caller may access are queried at all.
  const sources = {
    items: { panel: null, run: () => supabase.from('items').select('id, item_code, item_name, brand').or(`item_name.ilike.${like},item_code.ilike.${like},brand.ilike.${like}`).limit(8), map: (x) => ({ type: 'Item', id: x.id, label: x.item_name, sub: [x.item_code, x.brand].filter(Boolean).join(' · '), route: '/stock/item-master' }) },
    customers: { panel: 'sales', run: () => supabase.from('customers').select('id, name').ilike('name', like).limit(lim), map: (x) => ({ type: 'Customer', id: x.id, label: x.name, sub: '', route: '/sales/customers' }) },
    quotations: { panel: 'sales', run: () => supabase.from('quotations').select('id, number, customer').or(`number.ilike.${like},customer.ilike.${like}`).limit(lim), map: (x) => ({ type: 'Quotation', id: x.id, label: x.number, sub: x.customer, route: '/sales/quotations' }) },
    orders: { panel: 'sales', run: () => supabase.from('sales_orders').select('id, number, customer').or(`number.ilike.${like},customer.ilike.${like}`).limit(lim), map: (x) => ({ type: 'Sales Order', id: x.id, label: x.number, sub: x.customer, route: '/sales/orders' }) },
    leads: { panel: 'sales', run: () => supabase.from('leads').select('id, name, company').or(`name.ilike.${like},company.ilike.${like}`).limit(lim), map: (x) => ({ type: 'Lead', id: x.id, label: x.name || x.company, sub: x.company, route: '/sales/leads' }) },
    projects: { panel: 'projects', run: () => supabase.from('projects').select('id, number, name, customer').or(`number.ilike.${like},name.ilike.${like},customer.ilike.${like}`).limit(lim), map: (x) => ({ type: 'Project', id: x.id, label: x.name || x.number, sub: x.customer, route: `/projects/${x.id}` }) },
    suppliers: { panel: 'procurement', run: () => supabase.from('suppliers').select('id, name').ilike('name', like).limit(lim), map: (x) => ({ type: 'Supplier', id: x.id, label: x.name, sub: '', route: '/procurement/suppliers' }) },
    pos: { panel: 'procurement', run: () => supabase.from('purchase_orders').select('id, number, supplier').or(`number.ilike.${like},supplier.ilike.${like}`).limit(lim), map: (x) => ({ type: 'Purchase Order', id: x.id, label: x.number, sub: x.supplier, route: '/procurement/po' }) },
    documents: { panel: 'admin', run: () => supabase.from('documents').select('id, name, doc_type').or(`name.ilike.${like},doc_type.ilike.${like}`).limit(lim), map: (x) => ({ type: 'Document', id: x.id, label: x.name, sub: x.doc_type, route: '/admin/documents' }) },
  }

  const allowed = Object.values(sources).filter((s) => s.panel === null || can(s.panel))
  const settled = await Promise.all(allowed.map((s) => s.run()))
  const results = []
  settled.forEach((rows, i) => (rows.data || []).forEach((x) => results.push(allowed[i].map(x))))

  res.json({ query: raw, results })
}))

export default r
