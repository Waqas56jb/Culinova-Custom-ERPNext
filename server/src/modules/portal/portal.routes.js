import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { redactFinancials } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'
import { uploadAttachment, signAttachments } from '../../core/chatfiles.js'
import { ensureLeadAndOpportunity, advanceOpportunity, winOpportunityForCustomer, loseOpportunityForCustomer } from '../../core/crmflow.js'
import { projectFieldsFromQuote } from '../../core/handover.js'
import { customerCommercialGate } from '../../core/customerGate.js'
import { enrichQuotationList } from '../../core/quotationLines.js'
import { stripCustomerQuotationFields } from '../../rbac/permissions.js'
import { acceptQuotation } from '../../core/acceptQuotation.js'

const r = Router()
const num = (p) => `${p}-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`
const rows = (x) => x?.data || []
// escape LIKE wildcards so an identity like "%" can't match every row (ilike treats % / _ as wildcards)
const esc = (s) => String(s || '').replace(/[\\%_]/g, '\\$&')
// projects a technician is assigned to (snags have no owner column, so scope them by the tech's projects)
const techProjectIds = async (userId) => {
  const [{ data: b }, { data: t }] = await Promise.all([
    supabase.from('project_boq').select('project_id').eq('assignee_id', userId),
    supabase.from('project_tasks').select('project_id').eq('assignee_id', userId),
  ])
  return [...new Set([...(b || []), ...(t || [])].map((x) => x.project_id).filter(Boolean))]
}

// ── CUSTOMER PORTAL — only this customer's records (matched by name/email) ──
r.get('/customer/overview', authRequired, asyncWrap(async (req, res) => {
  const name = esc(req.user.name)
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
  const enrichedQuotes = await enrichQuotationList(rows(q))
  // never expose cost / GP / margin / Sprint 1b internals / discount_source to the customer
  res.json({
    quotations: stripCustomerQuotationFields(redactFinancials(req.user.role, enrichedQuotes)),
    invoices: rows(inv),
    projects,
    tickets: rows(tk),
  })
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
  try {
    const result = await acceptQuotation({
      quotationId: req.params.id,
      actor: req.user,
      channel: 'portal',
    })
    res.json({ ok: true, sales_order: result.sales_order?.number || result.sales_order })
  } catch (e) {
    const status = e.status || 500
    const body = { error: e.message }
    if (e.code) body.code = e.code
    if (e.missing) body.missing = e.missing
    if (e.customer_exists != null) body.customer_exists = e.customer_exists
    return res.status(status).json(body)
  }
}))

// Customer completes commercial registration before order confirmation (CR/VAT/address)
r.patch('/customer/commercial-profile', authRequired, asyncWrap(async (req, res) => {
  const name = (req.user.name || '').trim()
  const body = req.body || {}
  const fields = {
    cr_number: (body.cr_number || '').trim(),
    vat_number: (body.vat_number || '').trim(),
    national_address: (body.national_address || '').trim(),
    billing_address: (body.billing_address || '').trim(),
  }
  const missing = ['cr_number', 'vat_number', 'national_address', 'billing_address'].filter((f) => !fields[f])
  if (missing.length) return res.status(422).json({ error: `Required: ${missing.join(', ')}`, missing })

  const { data: existing } = await supabase.from('customers').select('id').ilike('name', name).maybeSingle()
  if (existing) {
    const { data, error } = await supabase.from('customers').update(fields).eq('id', existing.id).select().single()
    if (error) throw error
    return res.json(data)
  }
  const { data, error } = await supabase.from('customers').insert({
    name, code: `CUST-${Date.now().toString().slice(-6)}`, ...fields, status: 'Active',
  }).select().single()
  if (error) throw error
  res.status(201).json(data)
}))

r.get('/customer/commercial-profile', authRequired, asyncWrap(async (req, res) => {
  const { data } = await supabase.from('customers').select('id, name, cr_number, vat_number, national_address, billing_address')
    .ilike('name', req.user.name).maybeSingle()
  res.json(data || { name: req.user.name, complete: false })
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

// ── CUSTOMER DELIVERIES — view + Accept / Reject / request Return (DEL-003/004/005) ──
const ownsDN = (dn, user) => dn && (dn.customer || '').toLowerCase() === (user.name || '').toLowerCase()

r.get('/customer/deliveries', authRequired, asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('delivery_notes').select('*').ilike('customer', esc(req.user.name)).order('created_at', { ascending: false })
  if (error) throw error
  res.json(data || [])
}))

r.post('/customer/deliveries/:id/accept', authRequired, asyncWrap(async (req, res) => {
  const { data: dn } = await supabase.from('delivery_notes').select('*').eq('id', req.params.id).single()
  if (!ownsDN(dn, req.user)) return res.status(403).json({ error: 'Not your delivery' })
  await supabase.from('delivery_notes').update({ status: 'Accepted', accepted_at: new Date().toISOString(), signature_name: (req.body.signature_name || req.user.name) }).eq('id', dn.id)
  // DEL-003 → delivered item marks the BOQ line Delivered → operational completion updates
  if (dn.project_id && dn.item_name) {
    await supabase.from('project_boq').update({ status: 'Delivered' }).eq('project_id', dn.project_id).ilike('item_name', dn.item_name)
    await recomputeProject(dn.project_id)
  }
  res.json({ ok: true })
}))

r.post('/customer/deliveries/:id/reject', authRequired, asyncWrap(async (req, res) => {
  const reason = (req.body.reason || '').trim()
  if (!reason) return res.status(422).json({ error: 'Please tell us why (reason is required)' })
  const { data: dn } = await supabase.from('delivery_notes').select('*').eq('id', req.params.id).single()
  if (!ownsDN(dn, req.user)) return res.status(403).json({ error: 'Not your delivery' })
  await supabase.from('delivery_notes').update({ status: 'Rejected', rejection_reason: reason }).eq('id', dn.id) // DEL-004
  res.json({ ok: true })
}))

r.post('/customer/deliveries/:id/return', authRequired, asyncWrap(async (req, res) => {
  const reason = (req.body.reason || '').trim()
  const { data: dn } = await supabase.from('delivery_notes').select('*').eq('id', req.params.id).single()
  if (!ownsDN(dn, req.user)) return res.status(403).json({ error: 'Not your delivery' })
  await supabase.from('delivery_notes').update({ status: 'Return Requested', return_reason: reason || 'Return requested' }).eq('id', dn.id) // DEL-005 (staff authorizes)
  res.json({ ok: true })
}))

// ── SUPPLIER PORTAL — open RFQs to quote + this supplier's POs/deliveries ──
r.get('/supplier/overview', authRequired, asyncWrap(async (req, res) => {
  const name = esc(req.user.name)
  const [rfqs, pos] = await Promise.all([
    supabase.from('rfqs').select('*').order('created_at', { ascending: false }),
    supabase.from('purchase_orders').select('*').ilike('supplier', name).order('created_at', { ascending: false }),
  ])
  // delivery_notes are customer delivery documents with no supplier link — never expose them to a supplier
  res.json({ rfqs: rows(rfqs), purchaseOrders: rows(pos), deliveries: [] })
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
  // scope to THIS supplier's PO — otherwise any user could accept/ship another supplier's order (IDOR)
  const { data, error } = await supabase.from('purchase_orders').update(patch).eq('id', req.params.id).ilike('supplier', esc(req.user.name)).select().maybeSingle()
  if (error) throw error
  if (!data) return res.status(404).json({ error: 'Not your purchase order' })
  res.json(data)
}))

// ── TECHNICIAN PORTAL — tasks/visits assigned to this technician + snags ──
r.get('/technician/overview', authRequired, asyncWrap(async (req, res) => {
  const projIds = await techProjectIds(req.user.id)
  const [tasks, visits, boq] = await Promise.all([
    supabase.from('project_tasks').select('*').eq('assignee_id', req.user.id).order('id', { ascending: false }),
    supabase.from('maintenance_visits').select('*').ilike('technician', esc(req.user.name)).order('id', { ascending: false }),
    supabase.from('project_boq').select('*, projects(number, name, customer, location)').eq('assignee_id', req.user.id),
  ])
  // snags have no owner column → scope to the projects this technician is assigned to
  const snags = projIds.length ? await supabase.from('snags').select('*').in('project_id', projIds).order('created_at', { ascending: false }) : { data: [] }
  res.json({ tasks: rows(tasks), snags: rows(snags), visits: rows(visits), boq: rows(boq) })
}))
r.patch('/technician/task/:id', authRequired, asyncWrap(async (req, res) => {
  // scope to a task assigned to this technician (IDOR guard)
  const { data, error } = await supabase.from('project_tasks').update({ status: req.body.status, progress: req.body.progress }).eq('id', req.params.id).eq('assignee_id', req.user.id).select().maybeSingle()
  if (error) throw error
  if (!data) return res.status(404).json({ error: 'Not your task' })
  res.json(data)
}))
// technician updates an assigned BOQ item's status → project progress/cost auto roll up
r.patch('/technician/boq/:id', authRequired, asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('project_boq').update({ status: req.body.status }).eq('id', req.params.id).eq('assignee_id', req.user.id).select().single()
  if (error) throw error
  if (!data) return res.status(404).json({ error: 'Not your item' })
  await recomputeProject(data.project_id)
  res.json(data)
}))
r.post('/technician/snag', authRequired, asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('snags').insert({ project_id: req.body.project_id || null, item_name: req.body.item, description: req.body.description, severity: req.body.severity || 'Low' }).select().single()
  if (error) throw error
  res.status(201).json(data)
}))
r.patch('/technician/snag/:id', authRequired, asyncWrap(async (req, res) => {
  // only snags on a project this technician is assigned to
  const projIds = await techProjectIds(req.user.id)
  if (!projIds.length) return res.status(404).json({ error: 'Not your snag' })
  const { data, error } = await supabase.from('snags').update({ status: req.body.status }).eq('id', req.params.id).in('project_id', projIds).select().maybeSingle()
  if (error) throw error
  if (!data) return res.status(404).json({ error: 'Not your snag' })
  res.json(data)
}))
r.patch('/technician/visit/:id', authRequired, asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('maintenance_visits').update({ status: req.body.status }).eq('id', req.params.id).ilike('technician', esc(req.user.name)).select().maybeSingle()
  if (error) throw error
  if (!data) return res.status(404).json({ error: 'Not your visit' })
  res.json(data)
}))

export default r
