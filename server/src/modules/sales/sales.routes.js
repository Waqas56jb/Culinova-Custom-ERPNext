import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize, redactFinancials } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'
import { logAudit } from '../../core/audit.js'
import { uploadAttachment, signAttachments } from '../../core/chatfiles.js'
import { ensureLeadAndOpportunity, advanceOpportunity, winOpportunityForCustomer } from '../../core/crmflow.js'
import { validateRequiredFields, computeFinancials, evaluateApproval, discountSource, RULES } from './quotation.rules.js'

const r = Router()
const num = (p) => `${p}-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`

// Resolve each line's COST from the Item Master (by name) when not explicitly given.
// → Salesperson never enters/sees cost, yet GP can still be computed (rule #5).
async function resolveItems(items = []) {
  const out = []
  for (const it of items) {
    const name = it.item_name || it.name
    let cost = Number(it.cost) || 0
    if (!cost && name) {
      const { data } = await supabase.from('items').select('cost').ilike('name', name).limit(1).maybeSingle()
      if (data && data.cost != null) cost = Number(data.cost) || 0
    }
    out.push({ item_name: name, qty: Number(it.qty) || 0, rate: Number(it.rate) || 0, cost })
  }
  return out
}
const validTillFrom = (days) => new Date(Date.now() + Number(days) * 86400000).toISOString().slice(0, 10)

// ── SALES ORDERS enriched with linked project number + BOQ installation progress ──
r.get('/orders', authRequired, authorize('sales', 'read'), asyncWrap(async (req, res) => {
  const { data: orders, error } = await supabase.from('sales_orders').select('*').order('created_at', { ascending: false })
  if (error) throw error
  const out = []
  for (const so of orders || []) {
    let project_number = null, total = 0, done = 0, progress = 0
    if (so.project_id) {
      const { data: pr } = await supabase.from('projects').select('number, progress').eq('id', so.project_id).maybeSingle()
      project_number = pr?.number || null
      const { data: boq } = await supabase.from('project_boq').select('status').eq('project_id', so.project_id)
      total = (boq || []).length
      done = (boq || []).filter((b) => ['Installed', 'Delivered'].includes(b.status)).length
      progress = total ? Math.round((done / total) * 100) : (pr?.progress || 0)
    }
    out.push({ ...so, project_number, boq_total: total, boq_done: done, progress })
  }
  res.json(out)
}))

// ── LIST (items embedded; cost/GP redacted for non-management) ──
r.get('/quotations', authRequired, authorize('sales', 'read'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('quotations').select('*, quotation_items(*)').order('created_at', { ascending: false })
  if (error) throw error
  res.json(redactFinancials(req.user.role, data))
}))

r.get('/quotations/:id', authRequired, authorize('sales', 'read'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('quotations').select('*, quotation_items(*)').eq('id', req.params.id).single()
  if (error) return res.status(404).json({ error: 'Not found' })
  res.json(redactFinancials(req.user.role, data))
}))

// ── CREATE — enforces ALL sales rules ──
r.post('/quotations', authRequired, authorize('sales', 'create'), asyncWrap(async (req, res) => {
  const p = req.body
  const missing = validateRequiredFields(p)              // #16 mandatory fields
  if (missing.length) return res.status(422).json({ error: 'Missing required fields', fields: missing })

  const items = await resolveItems(p.items || [])         // cost from Item Master
  const fin = computeFinancials(items, p.discount_pct || 0)
  const decision = evaluateApproval(fin)                  // #5 / #6 / #11
  if (decision.blocked) return res.status(422).json({ error: decision.reason }) // #6 >25% blocked

  const status = decision.needsApproval ? 'Pending Approval' : 'Open'
  const approval_status = decision.needsApproval ? 'Pending' : 'Not Required'

  const row = {
    number: num('QTN'), customer: p.customer, contact_person: p.contact_person,
    project_name: p.project_name, project_location: p.project_location, customer_email: p.customer_email,
    validity_days: Number(p.validity_days), valid_till: validTillFrom(p.validity_days), payment_terms: p.payment_terms,
    ...fin, discount_source: discountSource(req.user.role),
    status, approval_status, revision: 0, owner_id: req.user.id, created_by: req.user.id,
  }
  const { data: q, error } = await supabase.from('quotations').insert(row).select().single()
  if (error) throw error

  if (items.length) {
    await supabase.from('quotation_items').insert(items.map((it) => ({
      quotation_id: q.id, item_name: it.item_name, qty: it.qty, rate: it.rate, cost: it.cost,
      amount: it.qty * it.rate,
    })))
  }
  await supabase.from('quotation_revisions').insert({ quotation_id: q.id, revision: 0, changed_by: req.user.id, changes: { action: 'created', ...fin } })
  // CRM automation: ensure the customer has an opportunity, then move it to the Quotation stage
  await ensureLeadAndOpportunity({ name: q.customer, email: q.customer_email })
  await advanceOpportunity(q.customer, 'Quotation')
  await logAudit(req.user, 'quotation', q.id, 'created', { number: q.number, status, gp: fin.gp_percent })
  res.status(201).json({ ...redactFinancials(req.user.role, q), _approval: decision })
}))

// ── EDIT — recomputes, re-evaluates approval, keeps revision history (#10) ──
r.patch('/quotations/:id', authRequired, authorize('sales', 'update'), asyncWrap(async (req, res) => {
  const { data: existing } = await supabase.from('quotations').select('*, quotation_items(*)').eq('id', req.params.id).single()
  if (!existing) return res.status(404).json({ error: 'Not found' })
  if (existing.status === 'Ordered') return res.status(422).json({ error: 'An ordered quotation cannot be edited' })
  if (existing.status === 'Lost') return res.status(422).json({ error: 'A lost quotation cannot be edited' })

  const p = req.body
  const patch = {}
  for (const f of ['customer', 'contact_person', 'project_name', 'project_location', 'customer_email', 'payment_terms']) {
    if (p[f] != null && p[f] !== '') patch[f] = p[f]
  }
  if (p.validity_days != null) {
    if (!RULES.VALID_DAYS.includes(Number(p.validity_days))) return res.status(422).json({ error: 'validity_days must be 15, 30 or 60' })
    patch.validity_days = Number(p.validity_days)
    patch.valid_till = validTillFrom(p.validity_days)
  }

  let fin = null, decision = null
  const itemsChanged = Array.isArray(p.items)
  const discountChanged = p.discount_pct != null
  if (itemsChanged || discountChanged) {
    const srcItems = itemsChanged ? p.items : (existing.quotation_items || [])
    const items = await resolveItems(srcItems)
    fin = computeFinancials(items, discountChanged ? p.discount_pct : existing.discount_pct)
    decision = evaluateApproval(fin)
    if (decision.blocked) return res.status(422).json({ error: decision.reason })
    Object.assign(patch, fin)
    patch.status = decision.needsApproval ? 'Pending Approval' : 'Open'
    patch.approval_status = decision.needsApproval ? 'Pending' : 'Not Required'
    patch.discount_source = discountSource(req.user.role)
    // replace line items
    await supabase.from('quotation_items').delete().eq('quotation_id', existing.id)
    if (items.length) {
      await supabase.from('quotation_items').insert(items.map((it) => ({
        quotation_id: existing.id, item_name: it.item_name, qty: it.qty, rate: it.rate, cost: it.cost, amount: it.qty * it.rate,
      })))
    }
  }
  patch.revision = (existing.revision || 0) + 1
  const { data: updated, error } = await supabase.from('quotations').update(patch).eq('id', existing.id).select().single()
  if (error) throw error
  // #10 — revision history is NEVER deleted, every edit is appended
  await supabase.from('quotation_revisions').insert({ quotation_id: existing.id, revision: patch.revision, changed_by: req.user.id, changes: { action: 'edited', ...(fin || {}) } })
  await logAudit(req.user, 'quotation', existing.id, 'edited', { revision: patch.revision })
  res.json({ ...redactFinancials(req.user.role, updated), _approval: decision })
}))

// ── APPROVE (Approval/Full Admin only) — #11 ──
r.post('/quotations/:id/approve', authRequired, authorize('sales', 'approve'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('quotations').update({ approval_status: 'Approved', status: 'Open', approved_by: req.user.id }).eq('id', req.params.id).select().single()
  if (error) throw error
  await logAudit(req.user, 'quotation', req.params.id, 'approved', { by: req.user.name })
  res.json(redactFinancials(req.user.role, data))
}))

// ── REJECT (Approval/Full Admin) — sends back to the salesperson ──
r.post('/quotations/:id/reject', authRequired, authorize('sales', 'approve'), asyncWrap(async (req, res) => {
  const reason = (req.body.reason || '').trim()
  const { data, error } = await supabase.from('quotations').update({ approval_status: 'Rejected', status: 'Draft' }).eq('id', req.params.id).select().single()
  if (error) throw error
  await logAudit(req.user, 'quotation', req.params.id, 'rejected', { reason })
  res.json(redactFinancials(req.user.role, data))
}))

// ── SEND — blocked while approval pending ── (part of the salesperson's normal flow → 'create')
r.post('/quotations/:id/send', authRequired, authorize('sales', 'create'), asyncWrap(async (req, res) => {
  const { data: q } = await supabase.from('quotations').select('*').eq('id', req.params.id).single()
  if (!q) return res.status(404).json({ error: 'Not found' })
  if (q.approval_status === 'Pending') return res.status(403).json({ error: 'Quotation needs approval before it can be sent' })
  await supabase.from('quotations').update({ status: 'Open' }).eq('id', req.params.id)
  await logAudit(req.user, 'quotation', req.params.id, 'sent', { to: q.customer_email })
  res.json({ ok: true, sent_to: q.customer_email })
}))

// ── ACCEPT → auto Sales Order + Project + BOQ (full chain, #17) ── (salesperson records customer's yes → 'create')
r.post('/quotations/:id/accept', authRequired, authorize('sales', 'create'), asyncWrap(async (req, res) => {
  const { data: q } = await supabase.from('quotations').select('*, quotation_items(*)').eq('id', req.params.id).single()
  if (!q) return res.status(404).json({ error: 'Not found' })
  if (q.status === 'Ordered') return res.status(422).json({ error: 'Quotation already accepted' })
  if (q.approval_status === 'Pending') return res.status(403).json({ error: 'Quotation needs approval before it can be accepted' })

  // 1) Sales Order
  const { data: so, error: soErr } = await supabase.from('sales_orders').insert({
    number: num('SO'), quotation_id: q.id, customer: q.customer, amount: q.total_amount,
  }).select().single()
  if (soErr) throw soErr

  // 2) Project (auto)
  const { data: proj, error: pErr } = await supabase.from('projects').insert({
    number: num('PRJ'), name: `${q.customer} — ${q.project_name || 'Project'}`, customer: q.customer,
    sales_order_id: so.id, contract_value: q.total_amount, manager_id: req.user.id, status: 'On Track',
  }).select().single()
  if (pErr) throw pErr

  // 3) BOQ (required items) from the quotation lines
  const items = q.quotation_items || []
  if (items.length) {
    await supabase.from('project_boq').insert(items.map((it) => ({
      project_id: proj.id, item_name: it.item_name, qty: it.qty, status: 'Waiting',
    })))
  }
  // 4) link + mark ordered
  await supabase.from('sales_orders').update({ project_id: proj.id }).eq('id', so.id)
  await supabase.from('quotations').update({ status: 'Ordered' }).eq('id', q.id)
  await winOpportunityForCustomer(q.customer) // opportunity auto-Won
  await logAudit(req.user, 'quotation', q.id, 'accepted', { sales_order: so.number, project: proj.number })
  res.status(201).json({ ok: true, sales_order: so, project: proj })
}))

// ── LOST — reason mandatory (#13), kept in revision history ── (salesperson records outcome → 'create')
r.post('/quotations/:id/lost', authRequired, authorize('sales', 'create'), asyncWrap(async (req, res) => {
  const reason = (req.body.reason || '').trim()
  if (!reason) return res.status(422).json({ error: 'A reason is required to mark a quotation as Lost' })
  const { data, error } = await supabase.from('quotations').update({ status: 'Lost' }).eq('id', req.params.id).select().single()
  if (error) throw error
  await supabase.from('quotation_revisions').insert({ quotation_id: req.params.id, revision: 9999, changed_by: req.user.id, changes: { action: 'lost', reason } })
  await logAudit(req.user, 'quotation', req.params.id, 'lost', { reason })
  res.json(redactFinancials(req.user.role, data))
}))

// ============================================================
// OPPORTUNITIES — enforce next-action date (#2) & lost reason (#13)
// ============================================================
r.post('/opportunities', authRequired, authorize('sales', 'create'), asyncWrap(async (req, res) => {
  const p = req.body
  if (!p.customer) return res.status(422).json({ error: 'Customer is required' })
  if (!p.next_action_date) return res.status(422).json({ error: 'Next action date is required (rule #2)' })
  const { data, error } = await supabase.from('opportunities').insert({
    customer: p.customer, stage: p.stage || 'Prospecting', value: Number(p.value) || 0,
    probability: Number(p.probability) || 30, next_action_date: p.next_action_date, owner_id: req.user.id,
  }).select().single()
  if (error) throw error
  await logAudit(req.user, 'opportunity', data.id, 'created', { customer: p.customer })
  res.status(201).json(data)
}))

r.post('/opportunities/:id/lost', authRequired, authorize('sales', 'create'), asyncWrap(async (req, res) => {
  const reason = (req.body.reason || '').trim()
  if (!reason) return res.status(422).json({ error: 'A reason is required to mark an opportunity as Lost (rule #13)' })
  const { data, error } = await supabase.from('opportunities').update({ stage: 'Lost', lost_reason: reason }).eq('id', req.params.id).select().single()
  if (error) throw error
  await logAudit(req.user, 'opportunity', req.params.id, 'lost', { reason })
  res.json(data)
}))

r.post('/opportunities/:id/won', authRequired, authorize('sales', 'create'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('opportunities').update({ stage: 'Won', probability: 100 }).eq('id', req.params.id).select().single()
  if (error) throw error
  await logAudit(req.user, 'opportunity', req.params.id, 'won', {})
  res.json(data)
}))

// ============================================================
// SALES CHAT — inbox of customer messages + staff replies
// ============================================================
r.get('/messages', authRequired, authorize('sales', 'read'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('messages').select('*').order('created_at', { ascending: true })
  if (error) throw error
  res.json(await signAttachments(data))
}))

r.post('/messages', authRequired, authorize('sales', 'create'), asyncWrap(async (req, res) => {
  const { customer_email, customer_name, body } = req.body
  const file = await uploadAttachment(req.body.attachment)
  if (!customer_email || (!(body || '').trim() && !file.attachment_path)) return res.status(422).json({ error: 'customer_email and a message or file are required' })
  const { data, error } = await supabase.from('messages').insert({
    customer_name: customer_name || customer_email, customer_email, sender: 'staff', staff_name: req.user.name, body: (body || '').trim(), ...file,
  }).select().single()
  if (error) throw error
  res.status(201).json(data)
}))

r.post('/messages/read', authRequired, authorize('sales', 'create'), asyncWrap(async (req, res) => {
  if (req.body.customer_email) {
    await supabase.from('messages').update({ read: true }).eq('customer_email', req.body.customer_email).eq('sender', 'customer')
  }
  res.json({ ok: true })
}))

export { RULES }
export default r
