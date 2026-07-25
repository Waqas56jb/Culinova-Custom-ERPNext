import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize, redactFinancials } from '../../middleware/rbac.js'
import { isManagement } from '../../rbac/permissions.js'
import { asyncWrap } from '../../middleware/error.js'
import { logAudit } from '../../core/audit.js'
import { uploadAttachment, signAttachments } from '../../core/chatfiles.js'
import { ensureLeadAndOpportunity, advanceOpportunity, winOpportunityForCustomer, loseOpportunityForCustomer } from '../../core/crmflow.js'
import { projectFieldsFromQuote } from '../../core/handover.js'
import { customerCommercialGate } from '../../core/customerGate.js'
import { notifyManagementApproval } from '../../core/notify.js'
import { recomputeProject } from '../../core/projectcost.js'
import { reserveForSalesOrder } from '../../core/inventory.js'
import { allocateLines } from '../../core/availability.js'
import { enrichQuotationList, enrichQuotationRecord } from '../../core/quotationLines.js'
import { validateRequiredFields, computeFinancials, evaluateApproval, discountSource, RULES } from './quotation.rules.js'
import { nextNumber } from '../../core/numbering.js'

const r = Router()
// Document numbers come from the editable numbering_series (Company Settings), NOT from Date.now();
// nextNumber falls back to a safe reference only when no series is configured for the doc type.
const num = (p) => `${p}-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`

// The approval decision's reason can spell out the GP margin ("GP 18% < 20%") — never expose that to
// a salesperson. Keep the needs-approval / blocked flags, drop any GP-bearing reason text + numbers.
const safeApproval = (role, d) => {
  if (isManagement(role) || !d) return d
  const parts = String(d.reason || '').split(' · ').filter((s) => s && !/gp\b/i.test(s))
  const { gp_percent, cost_amount, ...rest } = d
  return { ...rest, reason: parts.join(' · ') || (d.needsApproval ? 'Sent for management approval' : null) }
}

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
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0)
  const out = []
  for (const so of orders || []) {
    let project_number = null, total = 0, done = 0, progress = 0, contract = Number(so.amount) || 0, billed = 0, collected = 0, delivered_value = 0
    if (so.project_id) {
      const { data: pr } = await supabase.from('projects').select('number, progress, contract_value, billed, collected').eq('id', so.project_id).maybeSingle()
      project_number = pr?.number || null
      contract = Number(pr?.contract_value) || contract
      billed = Number(pr?.billed) || 0
      collected = Number(pr?.collected) || 0
      const { data: boq } = await supabase.from('project_boq').select('status').eq('project_id', so.project_id)
      total = (boq || []).length
      done = (boq || []).filter((b) => ['Installed', 'Delivered'].includes(b.status)).length
      progress = total ? Math.round((done / total) * 100) : (pr?.progress || 0)
      const { data: dns } = await supabase.from('delivery_notes').select('value, status').eq('project_id', so.project_id)
      delivered_value = (dns || []).filter((d) => ['Accepted', 'Delivered'].includes(d.status)).reduce((s, d) => s + (Number(d.value) || 0), 0)
    }
    out.push({
      ...so, project_number, boq_total: total, boq_done: done, progress,
      // DEL-008..011 completion metrics
      op_completion: progress, delivered_value, delivered_pct: pct(delivered_value, contract),
      fin_completion: pct(collected, contract), collection_pct: pct(collected, billed),
      contract_value: contract, billed, collected,
    })
  }
  res.json(out)
}))

// ── TOP CUSTOMERS by outstanding balance (sales-readable) ──
// The invoices table is finance-panel-gated, so a salesperson could never populate this chart from
// /invoices. This returns ONLY the aggregate a salesperson legitimately needs — customer + outstanding
// — and no cost, margin or per-invoice detail.
r.get('/top-customers', authRequired, authorize('sales', 'read'), asyncWrap(async (req, res) => {
  const { data: invs, error } = await supabase.from('invoices').select('customer, total, paid, status')
  if (error) throw error
  const by = {}
  for (const i of invs || []) {
    const name = (i.customer || '').trim()
    if (!name) continue
    const outstanding = (Number(i.total) || 0) - (Number(i.paid) || 0)
    if (outstanding <= 0) continue                  // fully paid → nothing outstanding
    by[name] = (by[name] || 0) + outstanding
  }
  const rows = Object.entries(by)
    .map(([customer, outstanding]) => ({ customer, outstanding: Math.round(outstanding * 100) / 100 }))
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, 8)
  res.json(rows)
}))

// ── DIRECT Sales Order creation is DISABLED ──
// Per the business flow, a Sales Order is created ONLY when a customer approves a quotation
// (Lead → Opportunity → Quotation → Customer Approved → Sales Order). The old walk-in path let an SO
// be raised with no quotation and no opportunity, bypassing the whole flow — so it is now refused. A
// Sales Order comes from accepting a quotation (/quotations/:id/accept or the customer portal accept).
r.post('/orders', authRequired, authorize('sales', 'create'), asyncWrap(async (req, res) => {
  res.status(422).json({
    error: 'Direct Sales Orders are disabled. A Sales Order is created only when the customer approves a quotation — build a Quotation from the Opportunity and accept it.',
    code: 'DIRECT_SO_DISABLED',
  })
}))

// ── SO-007: item-level Procurement / Inventory / Delivery / Installation status ──
r.get('/orders/:id/items', authRequired, authorize('sales', 'read'), asyncWrap(async (req, res) => {
  const { data: so } = await supabase.from('sales_orders').select('*').eq('id', req.params.id).single()
  if (!so || !so.project_id) return res.json([])
  const { data: boq } = await supabase.from('project_boq').select('*').eq('project_id', so.project_id)
  const lines = []
  for (const b of boq || []) {
    const name = b.item_name
    // Procurement
    const { data: pos } = await supabase.from('purchase_orders').select('status').ilike('item_name', name)
    let procurement = 'Not ordered'
    if (pos?.length) procurement = pos.some((p) => ['Received', 'Closed', 'Delivered'].includes(p.status)) ? 'Received' : 'Ordered'
    // Inventory
    const { data: item } = await supabase.from('items').select('id').ilike('name', name).limit(1).maybeSingle()
    let inventory = 'No master'
    if (item) {
      const { data: bal } = await supabase.from('stock_balances').select('qty, reserved').eq('item_id', item.id)
      const phys = (bal || []).reduce((s, x) => s + (Number(x.qty) || 0), 0)
      const resv = (bal || []).reduce((s, x) => s + (Number(x.reserved) || 0), 0)
      const avail = phys - resv
      inventory = avail > 0 ? `${avail} available` : (resv > 0 ? `${resv} reserved` : 'Out of stock')
    }
    // Delivery
    const { data: dns } = await supabase.from('delivery_notes').select('qty').ilike('item_name', name).eq('project_id', so.project_id)
    const delivered = (dns || []).reduce((s, x) => s + (Number(x.qty) || 0), 0)
    const need = Number(b.qty) || 0
    const delivery = delivered > 0 ? (delivered >= need ? 'Delivered' : `Partial (${delivered}/${need})`) : 'Pending'
    lines.push({ id: b.id, item: name, qty: b.qty, installation: b.status, procurement, inventory, delivery })
  }
  res.json(lines)
}))

// ── LIST (items embedded; cost/GP redacted for non-management) ──
r.get('/quotations', authRequired, authorize('sales', 'read'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('quotations').select('*, quotation_items(*)').order('created_at', { ascending: false })
  if (error) throw error
  const enriched = await enrichQuotationList(data || [])
  res.json(redactFinancials(req.user.role, enriched))
}))

r.get('/quotations/:id', authRequired, authorize('sales', 'read'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('quotations').select('*, quotation_items(*)').eq('id', req.params.id).single()
  if (error) return res.status(404).json({ error: 'Not found' })
  const enriched = await enrichQuotationRecord(data)
  res.json(redactFinancials(req.user.role, enriched))
}))

// ── CREATE — enforces ALL sales rules ──
r.post('/quotations', authRequired, authorize('sales', 'create'), asyncWrap(async (req, res) => {
  const p = req.body
  const missing = validateRequiredFields(p)              // #16 mandatory fields
  if (missing.length) return res.status(422).json({ error: 'Missing required fields', fields: missing })

  const items = await resolveItems(p.items || [])         // cost from Item Master
  const fin = computeFinancials(items, p.discount_pct || 0, p.discount_fixed || 0)
  const decision = evaluateApproval(fin, req.user.role)   // #5 / #6 / #11 / SEC-002 per-role
  if (decision.blocked) return res.status(422).json({ error: decision.reason }) // #6 >25% blocked

  const status = decision.needsApproval ? 'Pending Approval' : 'Open'
  const approval_status = decision.needsApproval ? 'Pending' : 'Not Required'

  const row = {
    number: num('QTN'), customer: p.customer, contact_person: p.contact_person,
    project_name: p.project_name, project_location: p.project_location, customer_email: p.customer_email,
    validity_days: Number(p.validity_days), valid_till: validTillFrom(p.validity_days), payment_terms: p.payment_terms,
    delivery_date: p.delivery_date || null, notes: p.notes || null,
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
  if (decision.needsApproval) await notifyManagementApproval(q, req.user.name) // high discount → admin notification
  await logAudit(req.user, 'quotation', q.id, 'created', { number: q.number, status, gp: fin.gp_percent })
  res.status(201).json({ ...redactFinancials(req.user.role, q), _approval: safeApproval(req.user.role, decision) })
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
  if (p.delivery_date !== undefined) patch.delivery_date = p.delivery_date || null
  if (p.notes !== undefined) patch.notes = p.notes || null

  let fin = null, decision = null
  const itemsChanged = Array.isArray(p.items)
  const discountChanged = p.discount_pct != null || p.discount_fixed != null
  if (itemsChanged || discountChanged) {
    const srcItems = itemsChanged ? p.items : (existing.quotation_items || [])
    const items = await resolveItems(srcItems)
    fin = computeFinancials(items, p.discount_pct != null ? p.discount_pct : existing.discount_pct, p.discount_fixed != null ? p.discount_fixed : existing.discount_fixed)
    decision = evaluateApproval(fin, req.user.role)
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
  if (decision?.needsApproval) await notifyManagementApproval(updated, req.user.name) // edit pushed it >20% → admin notification
  await logAudit(req.user, 'quotation', existing.id, 'edited', { revision: patch.revision })
  res.json({ ...redactFinancials(req.user.role, updated), _approval: safeApproval(req.user.role, decision) })
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
  // RULE: only the CUSTOMER accepts (via their portal). A salesperson must never accept on their behalf.
  // Internal acceptance is limited to Management for phone / walk-in orders where there's no portal customer.
  if (!isManagement(req.user.role)) return res.status(403).json({ error: 'Only the customer can accept this quotation (from their portal). Internal acceptance is limited to Management.' })
  const { data: q } = await supabase.from('quotations').select('*, quotation_items(*)').eq('id', req.params.id).single()
  if (!q) return res.status(404).json({ error: 'Not found' })
  if (q.status === 'Ordered') return res.status(422).json({ error: 'Quotation already accepted' })
  if (q.approval_status === 'Pending') return res.status(403).json({ error: 'Quotation needs approval before it can be accepted' })
  const gate = await customerCommercialGate(q.customer)
  if (!gate.ok) return res.status(422).json({ error: gate.error, code: 'COMMERCIAL_PROFILE_REQUIRED', missing: gate.missing })

  // 1) Sales Order
  const { data: so, error: soErr } = await supabase.from('sales_orders').insert({
    number: num('SO'), quotation_id: q.id, customer: q.customer, amount: q.total_amount,
  }).select().single()
  if (soErr) throw soErr

  // 2) Project (auto) — with the full Sales → PM handover details
  const handover = await projectFieldsFromQuote(q)
  const { data: proj, error: pErr } = await supabase.from('projects').insert({
    number: num('PRJ'), name: `${q.customer} — ${q.project_name || 'Project'}`, customer: q.customer,
    sales_order_id: so.id, contract_value: q.total_amount, manager_id: req.user.id, status: 'On Track', ...handover,
  }).select().single()
  if (pErr) throw pErr

  // 3) BOQ (required items) from the quotation lines — budget cost auto-seeded from the
  //    sales Item-Master cost so the PM starts with a ready budget (can adjust later).
  //    STOCK FIRST (CEO rule R1): the line carries the split computed when the quotation was built —
  //    from_stock is already ours, to_purchase is the ONLY part Procurement may ever buy. Re-allocate
  //    against LIVE stock at acceptance time, because stock may have moved since the quote was sent.
  const items = q.quotation_items || []
  const alloc = await allocateLines(items.map((it) => ({ item_id: it.item_id, item_name: it.item_name, qty: it.qty })))
  if (items.length) {
    await supabase.from('project_boq').insert(items.map((it, i) => ({
      project_id: proj.id, item_id: it.item_id || null, item_name: it.item_name, qty: it.qty, status: 'Waiting',
      budget_cost: (Number(it.cost) || 0) * (Number(it.qty) || 0),
      from_stock: Number(alloc[i]?.from_stock) || 0,
      to_purchase: Number(alloc[i]?.to_purchase) || 0,
    })))
  }
  // 4) link + mark ordered
  await supabase.from('sales_orders').update({ project_id: proj.id }).eq('id', so.id)
  await supabase.from('quotations').update({ status: 'Ordered' }).eq('id', q.id)
  await recomputeProject(proj.id) // set committed cost / GP from the seeded budget
  // reserve ONLY what is genuinely on the shelf — reserving a quantity we do not own would create
  // phantom stock and hide the real purchase requirement
  await reserveForSalesOrder({
    items: alloc.filter((l) => Number(l.from_stock) > 0).map((l) => ({ item_name: l.item_name, qty: l.from_stock })),
    sales_order_id: so.id, project_id: proj.id, userId: req.user.id,
  })
  await winOpportunityForCustomer(q.customer, q.total_amount) // opportunity auto-Won
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
  // Flow: "Customer Approved? → No → Close the Opportunity". A rejected quotation must close its
  // opportunity, exactly like the customer-portal reject already does — otherwise a lost quote left the
  // opportunity dangling open. Guard against multi-quote opportunities: only close when no OTHER
  // quotation on the same opportunity is still live (Draft / Open / Pending Approval / Ordered).
  if (data?.opportunity_id) {
    const { data: siblings } = await supabase.from('quotations')
      .select('id, status').eq('opportunity_id', data.opportunity_id).neq('id', data.id)
    const stillLive = (siblings || []).some((s) => ['Draft', 'Open', 'Pending Approval', 'Ordered'].includes(s.status))
    if (!stillLive) { try { await loseOpportunityForCustomer(data.customer, reason) } catch { /* CRM close is best-effort */ } }
  }
  await logAudit(req.user, 'quotation', req.params.id, 'lost', { reason })
  res.json(redactFinancials(req.user.role, data))
}))

// ============================================================
// LEAD CONVERSION — atomic Lead → Opportunity (Create-level permission, not generic PATCH)
// Sales User has Create but not Update — the old two-step client flow 403'd on PATCH /leads/:id.
// ============================================================
const plusDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
const BLOCKED_LEAD = ['Opportunity', 'Converted', 'Lost', 'Do Not Contact']

r.post('/leads/:id/convert', authRequired, authorize('sales', 'create'), asyncWrap(async (req, res) => {
  const { data: lead, error: le } = await supabase.from('leads').select('*').eq('id', req.params.id).single()
  if (le || !lead) return res.status(404).json({ error: 'Lead not found' })
  if (BLOCKED_LEAD.includes(lead.status)) {
    return res.status(422).json({ error: `Lead is already ${lead.status} — cannot convert again` })
  }
  const customer = (lead.company || lead.name || '').trim()
  if (!customer) return res.status(422).json({ error: 'Lead must have a company or contact name' })

  const { data: opp, error: oe } = await supabase.from('opportunities').insert({
    number: await nextNumber('opportunities', 'OPP'),
    lead_id: lead.id,
    customer,
    stage: 'Prospecting',
    value: Number(lead.est_value) || 0,
    probability: 30,
    next_action_date: lead.next_follow_up || plusDays(7),
    owner_id: lead.assigned_to_id || lead.owner_id || req.user.id,
    opportunity_type: 'Retail Sale',
    project_name: lead.project_name || null,
    project_type: lead.project_type || null,
    project_city: lead.project_city || null,
    project_district: lead.project_district || null,
    project_location: [lead.project_city, lead.project_district].filter(Boolean).join(' → ') || null,
    contact_person: lead.name || null,
    customer_email: lead.email || null,
    mobile: lead.mobile || null,
  }).select().single()
  if (oe) throw oe

  const { data: updated, error: ue } = await supabase.from('leads')
    .update({ status: 'Opportunity', last_activity_at: new Date().toISOString() })
    .eq('id', lead.id).select().single()
  if (ue) throw ue

  await logAudit(req.user, 'lead', lead.id, 'converted', { opportunity_id: opp.id, customer })
  res.status(201).json({ lead: updated, opportunity: opp })
}))

// ── CLOSE / DISQUALIFY a lead — the "Qualified? → No → Close Lead" branch ──
// Create-level (not generic PATCH) for the same reason Convert is: a Sales User has Create but not
// Update, so without this dedicated route the sales team could never close an unqualified lead.
r.post('/leads/:id/close', authRequired, authorize('sales', 'create'), asyncWrap(async (req, res) => {
  const reason = (req.body.reason || '').trim()
  const { data: lead, error: le } = await supabase.from('leads').select('*').eq('id', req.params.id).single()
  if (le || !lead) return res.status(404).json({ error: 'Lead not found' })
  if (['Opportunity', 'Converted'].includes(lead.status)) {
    return res.status(422).json({ error: `Lead is already ${lead.status} — it cannot be closed` })
  }
  // The leads table has no lost_reason column, so the reason is appended to notes for the audit trail.
  const notes = reason ? `${lead.notes ? lead.notes + '\n' : ''}[Closed] ${reason}` : lead.notes
  const { data, error } = await supabase.from('leads')
    .update({ status: 'Lost', notes, last_activity_at: new Date().toISOString() })
    .eq('id', req.params.id).select().single()
  if (error) throw error
  await logAudit(req.user, 'lead', req.params.id, 'closed', { reason: reason || null })
  res.json(data)
}))

// ============================================================
// OPPORTUNITIES — enforce next-action date (#2) & lost reason (#13)
// ============================================================
r.post('/opportunities', authRequired, authorize('sales', 'create'), asyncWrap(async (req, res) => {
  const p = req.body
  if (!p.customer) return res.status(422).json({ error: 'Customer is required' })
  if (!p.next_action_date) return res.status(422).json({ error: 'Next action date is required (rule #2)' })
  const loc = p.project_location || [p.project_city, p.project_district].filter(Boolean).join(' → ') || null
  const { data, error } = await supabase.from('opportunities').insert({
    number: await nextNumber('opportunities', 'OPP'),
    customer: p.customer, stage: p.stage || 'Prospecting', value: Number(p.value) || 0,
    probability: Number(p.probability) || 30, next_action_date: p.next_action_date, owner_id: req.user.id,
    lead_id: p.lead_id || null,
    opportunity_type: p.opportunity_type || 'Retail Sale',
    project_name: p.project_name || null,
    project_type: p.project_type || null,
    project_city: p.project_city || null,
    project_district: p.project_district || null,
    project_location: loc,
    contact_person: p.contact_person || null,
    customer_email: p.customer_email || null,
    mobile: p.mobile || null,
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

// NOTE: there is deliberately NO manual "mark opportunity Won" endpoint. Per the business flow an
// opportunity becomes Won ONLY when the customer approves a quotation and a Sales Order is created
// (see /quotations/:id/accept and the customer portal accept, both of which call
// winOpportunityForCustomer). A manual Won shortcut would close deals off-flow with no quotation.

// Prefill payload for creating a quotation FROM an opportunity (mandatory workflow)
r.get('/opportunities/:id/quotation-prefill', authRequired, authorize('sales', 'read'), asyncWrap(async (req, res) => {
  const { data: opp, error } = await supabase.from('opportunities').select('*').eq('id', req.params.id).single()
  if (error || !opp) return res.status(404).json({ error: 'Opportunity not found' })
  const { data: user } = await supabase.from('users').select('name, email, phone').eq('id', req.user.id).maybeSingle()
  res.json({
    opportunity_id: opp.id,
    customer: opp.customer,
    contact_person: opp.contact_person || null,
    customer_email: opp.customer_email || null,
    project_name: opp.project_name || null,
    project_location: opp.project_location || [opp.project_city, opp.project_district].filter(Boolean).join(' → ') || null,
    opportunity_type: opp.opportunity_type || 'Retail Sale',
    sales_consultant: user?.name || req.user.name,
    sales_consultant_email: user?.email || req.user.email,
    sales_consultant_phone: user?.phone || null,
  })
}))

// Payment term templates (not free text)
r.get('/payment-templates', authRequired, authorize('sales', 'read'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('commercial_terms').select('*')
    .eq('is_active', true).eq('category', 'Payment').order('is_default', { ascending: false }).order('name')
  if (error) throw error
  res.json(data || [])
}))

// ============================================================
// SALES CHAT — inbox of customer messages + staff replies
// ============================================================
r.get('/messages', authRequired, authorize('sales', 'read'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('messages').select('*').order('created_at', { ascending: true })
  if (error) throw error
  res.json(await signAttachments(data))
}))

// directory of registered customers (name/email/phone) so Sales can see contact details in chat
r.get('/customers-directory', authRequired, authorize('sales', 'read'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('users').select('name, email, phone').eq('role', 'Customer')
  if (error) throw error
  res.json(data || [])
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
