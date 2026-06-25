import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { asyncWrap } from '../../middleware/error.js'
import { uploadAttachment, signAttachments } from '../../core/chatfiles.js'
import { ensureLeadAndOpportunity, advanceOpportunity, winOpportunityForCustomer, loseOpportunityForCustomer } from '../../core/crmflow.js'
import { projectFieldsFromQuote } from '../../core/handover.js'

const r = Router()
const num = (p) => `${p}-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`
const rows = (x) => x?.data || []

// ── CUSTOMER PORTAL — only this customer's records (matched by name/email) ──
r.get('/customer/overview', authRequired, asyncWrap(async (req, res) => {
  const name = req.user.name
  const [q, inv, pr, tk] = await Promise.all([
    supabase.from('quotations').select('*, quotation_items(*)').ilike('customer', name).order('created_at', { ascending: false }),
    supabase.from('invoices').select('*').ilike('customer', name).order('created_at', { ascending: false }),
    supabase.from('projects').select('*').ilike('customer', name).order('created_at', { ascending: false }),
    supabase.from('service_tickets').select('*').ilike('customer', name).order('created_at', { ascending: false }),
  ])
  // enrich each project with live BOQ installation progress (real sync, not the static field)
  const projects = rows(pr)
  for (const p of projects) {
    const { data: boq } = await supabase.from('project_boq').select('item_name, qty, status').eq('project_id', p.id)
    const items = boq || []
    const total = items.length
    const done = items.filter((b) => ['Installed', 'Delivered'].includes(b.status)).length
    p.boq_total = total
    p.boq_done = done
    p.progress = total ? Math.round((done / total) * 100) : (p.progress || 0)
    p.boq = items
  }
  res.json({ quotations: rows(q), invoices: rows(inv), projects, tickets: rows(tk) })
}))
r.post('/customer/tickets', authRequired, asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('service_tickets').insert({ number: num('TKT'), customer: req.user.name, subject: req.body.subject, priority: req.body.priority || 'Medium' }).select().single()
  if (error) throw error
  res.status(201).json(data)
}))

// ── CUSTOMER ↔ SALES CHAT — customer's own thread (one recipient: the sales team) ──
r.get('/customer/messages', authRequired, asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('messages').select('*').eq('customer_email', req.user.email).order('created_at', { ascending: true })
  if (error) throw error
  res.json(await signAttachments(data))
}))
r.post('/customer/messages', authRequired, asyncWrap(async (req, res) => {
  const body = (req.body.body || '').trim()
  const file = await uploadAttachment(req.body.attachment)
  if (!body && !file.attachment_path) return res.status(422).json({ error: 'A message or a file is required' })
  const { data, error } = await supabase.from('messages').insert({
    customer_name: req.user.name, customer_email: req.user.email, sender: 'customer', body, ...file,
  }).select().single()
  if (error) throw error
  // CRM automation: first contact → capture Lead + Opportunity (Prospecting);
  // if a quotation is already in play, a reply moves it to Negotiation.
  await ensureLeadAndOpportunity({ name: req.user.name, email: req.user.email })
  const { data: hasQuote } = await supabase.from('quotations').select('id').ilike('customer', req.user.name).limit(1).maybeSingle()
  if (hasQuote) await advanceOpportunity(req.user.name, 'Negotiation')
  res.status(201).json(data)
}))

// ── CUSTOMER acts on a quotation: Accept / Reject / Request concession ──
const ownsQuote = (q, user) => q && (q.customer || '').toLowerCase() === (user.name || '').toLowerCase()

r.post('/customer/quotations/:id/accept', authRequired, asyncWrap(async (req, res) => {
  const { data: q } = await supabase.from('quotations').select('*, quotation_items(*)').eq('id', req.params.id).single()
  if (!ownsQuote(q, req.user)) return res.status(403).json({ error: 'Not your quotation' })
  if (q.status === 'Ordered') return res.status(422).json({ error: 'Already accepted' })
  const { data: so, error: e1 } = await supabase.from('sales_orders').insert({ number: num('SO'), quotation_id: q.id, customer: q.customer, amount: q.total_amount }).select().single()
  if (e1) throw e1
  const handover = await projectFieldsFromQuote(q)
  const { data: proj, error: e2 } = await supabase.from('projects').insert({ number: num('PRJ'), name: `${q.customer} — ${q.project_name || 'Project'}`, customer: q.customer, sales_order_id: so.id, contract_value: q.total_amount, status: 'On Track', ...handover }).select().single()
  if (e2) throw e2
  const items = q.quotation_items || []
  if (items.length) await supabase.from('project_boq').insert(items.map((it) => ({ project_id: proj.id, item_name: it.item_name, qty: it.qty, status: 'Waiting' })))
  await supabase.from('sales_orders').update({ project_id: proj.id }).eq('id', so.id)
  await supabase.from('quotations').update({ status: 'Ordered' }).eq('id', q.id)
  await winOpportunityForCustomer(q.customer, q.total_amount) // opportunity auto-Won
  await supabase.from('messages').insert({ customer_name: req.user.name, customer_email: req.user.email, sender: 'customer', body: `✅ I have ACCEPTED quotation ${q.number}.` })
  res.json({ ok: true, sales_order: so.number })
}))

r.post('/customer/quotations/:id/reject', authRequired, asyncWrap(async (req, res) => {
  const reason = (req.body.reason || '').trim()
  if (!reason) return res.status(422).json({ error: 'Please tell us why (reason is required)' })
  const { data: q } = await supabase.from('quotations').select('*').eq('id', req.params.id).single()
  if (!ownsQuote(q, req.user)) return res.status(403).json({ error: 'Not your quotation' })
  await supabase.from('quotations').update({ status: 'Lost' }).eq('id', q.id)
  await supabase.from('quotation_revisions').insert({ quotation_id: q.id, revision: 9999, changed_by: req.user.id, changes: { action: 'customer-rejected', reason } })
  await loseOpportunityForCustomer(q.customer, reason) // opportunity → Lost
  await supabase.from('messages').insert({ customer_name: req.user.name, customer_email: req.user.email, sender: 'customer', body: `❌ I have REJECTED quotation ${q.number}. Reason: ${reason}` })
  res.json({ ok: true })
}))

r.delete('/customer/quotations/:id', authRequired, asyncWrap(async (req, res) => {
  const { data: q } = await supabase.from('quotations').select('*').eq('id', req.params.id).single()
  if (!ownsQuote(q, req.user)) return res.status(403).json({ error: 'Not your quotation' })
  if (q.status === 'Ordered') return res.status(422).json({ error: 'An ordered quotation cannot be deleted' })
  await supabase.from('quotations').delete().eq('id', q.id) // cascades items + revisions
  await supabase.from('messages').insert({ customer_name: req.user.name, customer_email: req.user.email, sender: 'customer', body: `🗑️ I removed quotation ${q.number}.` })
  res.json({ ok: true })
}))

r.post('/customer/quotations/:id/concession', authRequired, asyncWrap(async (req, res) => {
  const note = (req.body.note || '').trim()
  const { data: q } = await supabase.from('quotations').select('*').eq('id', req.params.id).single()
  if (!ownsQuote(q, req.user)) return res.status(403).json({ error: 'Not your quotation' })
  await advanceOpportunity(q.customer, 'Negotiation') // concession → Negotiation
  await supabase.from('messages').insert({ customer_name: req.user.name, customer_email: req.user.email, sender: 'customer', body: `💬 Concession request on quotation ${q.number}: ${note || 'Could you please offer a better price?'}` })
  res.json({ ok: true })
}))

// ── SUPPLIER PORTAL — open RFQs to quote + this supplier's POs/deliveries ──
r.get('/supplier/overview', authRequired, asyncWrap(async (req, res) => {
  const name = req.user.name
  const [rfqs, pos, dn] = await Promise.all([
    supabase.from('rfqs').select('*').order('created_at', { ascending: false }),
    supabase.from('purchase_orders').select('*').ilike('supplier', name).order('created_at', { ascending: false }),
    supabase.from('delivery_notes').select('*').order('created_at', { ascending: false }),
  ])
  res.json({ rfqs: rows(rfqs), purchaseOrders: rows(pos), deliveries: rows(dn) })
}))
r.post('/supplier/quote', authRequired, asyncWrap(async (req, res) => {
  const { rfq_id, quote } = req.body
  const { data, error } = await supabase.from('rfq_quotes').insert({ rfq_id, supplier: req.user.name, quote: Number(quote) || 0 }).select().single()
  if (error) throw error
  await supabase.from('rfqs').update({ status: 'Quoted' }).eq('id', rfq_id)
  res.status(201).json(data)
}))
r.patch('/supplier/po/:id', authRequired, asyncWrap(async (req, res) => {
  const patch = {}
  if (req.body.accepted != null) patch.accepted = req.body.accepted
  if (req.body.shipment) patch.shipment = req.body.shipment
  const { data, error } = await supabase.from('purchase_orders').update(patch).eq('id', req.params.id).select().single()
  if (error) throw error
  res.json(data)
}))

// ── TECHNICIAN PORTAL — tasks/visits assigned to this technician + snags ──
r.get('/technician/overview', authRequired, asyncWrap(async (req, res) => {
  const [tasks, snags, visits] = await Promise.all([
    supabase.from('project_tasks').select('*').eq('assignee_id', req.user.id).order('id', { ascending: false }),
    supabase.from('snags').select('*').order('created_at', { ascending: false }),
    supabase.from('maintenance_visits').select('*').ilike('technician', req.user.name).order('id', { ascending: false }),
  ])
  res.json({ tasks: rows(tasks), snags: rows(snags), visits: rows(visits) })
}))
r.patch('/technician/task/:id', authRequired, asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('project_tasks').update({ status: req.body.status, progress: req.body.progress }).eq('id', req.params.id).select().single()
  if (error) throw error
  res.json(data)
}))
r.post('/technician/snag', authRequired, asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('snags').insert({ project_id: req.body.project_id || null, item_name: req.body.item, description: req.body.description, severity: req.body.severity || 'Low' }).select().single()
  if (error) throw error
  res.status(201).json(data)
}))
r.patch('/technician/snag/:id', authRequired, asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('snags').update({ status: req.body.status }).eq('id', req.params.id).select().single()
  if (error) throw error
  res.json(data)
}))
r.patch('/technician/visit/:id', authRequired, asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('maintenance_visits').update({ status: req.body.status }).eq('id', req.params.id).select().single()
  if (error) throw error
  res.json(data)
}))

export default r
