import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize, redactFinancials } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'
import { logAudit } from '../../core/audit.js'
import { validateRequiredFields, computeFinancials, evaluateApproval, discountSource, RULES } from './quotation.rules.js'

const r = Router()
const num = (p) => `${p}-${Date.now().toString().slice(-6)}`

// LIST quotations (cost/GP redacted for non-management)
r.get('/quotations', authRequired, authorize('sales', 'read'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('quotations').select('*').order('created_at', { ascending: false })
  if (error) throw error
  res.json(redactFinancials(req.user.role, data))
}))

r.get('/quotations/:id', authRequired, authorize('sales', 'read'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('quotations').select('*, quotation_items(*)').eq('id', req.params.id).single()
  if (error) return res.status(404).json({ error: 'Not found' })
  res.json(redactFinancials(req.user.role, data))
}))

// CREATE quotation — enforces all sales rules
r.post('/quotations', authRequired, authorize('sales', 'create'), asyncWrap(async (req, res) => {
  const p = req.body
  // #16 mandatory fields
  const missing = validateRequiredFields(p)
  if (missing.length) return res.status(422).json({ error: 'Missing required fields', fields: missing })

  // financials + #5/#6/#11 rules
  const fin = computeFinancials(p.items || [], p.discount_pct || 0)
  const decision = evaluateApproval(fin)
  if (decision.blocked) return res.status(422).json({ error: decision.reason }) // #6 >25% blocked

  const status = decision.needsApproval ? 'Pending Approval' : 'Open'
  const approval_status = decision.needsApproval ? 'Pending' : 'Not Required'

  const validTill = new Date(Date.now() + Number(p.validity_days) * 86400000).toISOString().slice(0, 10)
  const row = {
    number: num('QTN-2026'), customer: p.customer, contact_person: p.contact_person,
    project_name: p.project_name, project_location: p.project_location, customer_email: p.customer_email,
    validity_days: Number(p.validity_days), valid_till: validTill, payment_terms: p.payment_terms,
    ...fin, discount_source: discountSource(req.user.role),
    status, approval_status, revision: 0, owner_id: req.user.id, created_by: req.user.id,
  }
  const { data: q, error } = await supabase.from('quotations').insert(row).select().single()
  if (error) throw error

  // items
  if (Array.isArray(p.items) && p.items.length) {
    await supabase.from('quotation_items').insert(p.items.map((it) => ({
      quotation_id: q.id, item_name: it.item_name || it.name, qty: it.qty, rate: it.rate, cost: it.cost || 0,
      amount: (Number(it.qty) || 0) * (Number(it.rate) || 0),
    })))
  }
  // #10 revision history (never deleted)
  await supabase.from('quotation_revisions').insert({ quotation_id: q.id, revision: 0, changed_by: req.user.id, changes: { action: 'created', ...fin } })
  await logAudit(req.user, 'quotation', q.id, 'created', { number: q.number, ...fin })

  res.status(201).json({ ...redactFinancials(req.user.role, q), _approval: decision })
}))

// APPROVE (Approval/Full Admin only) — #11
r.post('/quotations/:id/approve', authRequired, authorize('sales', 'approve'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('quotations').update({ approval_status: 'Approved', status: 'Open', approved_by: req.user.id }).eq('id', req.params.id).select().single()
  if (error) throw error
  await logAudit(req.user, 'quotation', req.params.id, 'approved', { by: req.user.name })
  res.json(redactFinancials(req.user.role, data))
}))

// SEND to customer — blocked if approval pending
r.post('/quotations/:id/send', authRequired, authorize('sales', 'update'), asyncWrap(async (req, res) => {
  const { data: q } = await supabase.from('quotations').select('*').eq('id', req.params.id).single()
  if (!q) return res.status(404).json({ error: 'Not found' })
  if (q.approval_status === 'Pending') return res.status(403).json({ error: 'Quotation needs approval before sending' })
  await supabase.from('quotations').update({ status: 'Open' }).eq('id', req.params.id)
  await logAudit(req.user, 'quotation', req.params.id, 'sent', { to: q.customer_email })
  res.json({ ok: true, sent_to: q.customer_email })
}))

// ACCEPT → auto-create Sales Order (#17)
r.post('/quotations/:id/accept', authRequired, authorize('sales', 'update'), asyncWrap(async (req, res) => {
  const { data: q } = await supabase.from('quotations').select('*').eq('id', req.params.id).single()
  if (!q) return res.status(404).json({ error: 'Not found' })
  const { data: so, error } = await supabase.from('sales_orders').insert({
    number: num('SO-2026'), quotation_id: q.id, customer: q.customer, amount: q.total_amount,
  }).select().single()
  if (error) throw error
  await supabase.from('quotations').update({ status: 'Ordered' }).eq('id', q.id)
  await logAudit(req.user, 'quotation', q.id, 'accepted', { sales_order: so.number })
  res.status(201).json({ ok: true, sales_order: so })
}))

export { RULES }
export default r
