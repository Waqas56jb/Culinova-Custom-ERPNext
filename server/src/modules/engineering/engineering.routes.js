import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize, redactFinancials } from '../../middleware/rbac.js'
import { isManagement } from '../../rbac/permissions.js'
import { asyncWrap } from '../../middleware/error.js'
import { logAudit } from '../../core/audit.js'
import { nextNumber } from '../../core/numbering.js'
import { pushEngineeringRequest, syncEngineeringStatus, patchEngineeringOnEos, STATUSES } from '../../core/engineeringSync.js'
import { recommendEquipment } from '../../core/equipmentRecommend.js'
import { resolveApprovedItems } from '../../core/approvedItemsResolve.js'
import { uploadAttachment } from '../../core/chatfiles.js'

const r = Router()
const clean = (v) => (v === '' || v === undefined ? null : v)

const ATTACH_CATEGORIES = ['BOQ', 'Drawings', 'Client Specifications', 'Site Photos', 'Layouts', 'Other']

/**
 * Store any newly-uploaded files (base64 data URLs) in the private bucket and return the attachment
 * records to persist: [{ category, name, path }]. Files are kept private — EOS receives short-lived
 * signed links, never the raw bucket path — because these are the client's project documents.
 */
async function ingestAttachments(list = []) {
  const out = []
  for (const a of Array.isArray(list) ? list : []) {
    if (a?.path && a?.name) { out.push({ category: a.category || 'Other', name: a.name, path: a.path }); continue } // already stored
    if (!a?.dataUrl) continue
    const stored = await uploadAttachment({ dataUrl: a.dataUrl, name: a.name })
    if (stored.attachment_path) {
      out.push({ category: ATTACH_CATEGORIES.includes(a.category) ? a.category : 'Other', name: stored.attachment_name, path: stored.attachment_path })
    }
  }
  return out
}

/** Add a short-lived signed URL to each stored attachment so it can be opened (private bucket). */
async function signAttachmentList(attachments = []) {
  const signed = []
  for (const a of attachments || []) {
    if (!a?.path) { signed.push(a); continue }
    const { data } = await supabase.storage.from('chat-uploads').createSignedUrl(a.path, 3600)
    signed.push({ ...a, url: data?.signedUrl || null })
  }
  return signed
}

r.get('/requests', authRequired, authorize('sales', 'read'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('engineering_requests').select('*').order('created_at', { ascending: false })
  if (error) throw error
  res.json(data || [])
}))

r.get('/requests/:id', authRequired, authorize('sales', 'read'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('engineering_requests').select('*').eq('id', req.params.id).single()
  if (error || !data) return res.status(404).json({ error: 'Not found' })
  const eos = await syncEngineeringStatus(data)
  if (eos?.status && eos.status !== data.status) {
    const patch = { status: eos.status, updated_at: new Date().toISOString() }
    if (eos.approved_items) patch.approved_items = eos.approved_items
    if (eos.ceks_project_id) patch.eos_project_id = eos.ceks_project_id
    await supabase.from('engineering_requests').update(patch).eq('id', data.id)
    Object.assign(data, patch)
  }
  res.json({ ...data, attachments: await signAttachmentList(data.attachments), _eos: eos || null })
}))

r.post('/requests', authRequired, authorize('sales', 'create'), asyncWrap(async (req, res) => {
  const p = req.body || {}
  if (!p.opportunity_id) return res.status(422).json({ error: 'opportunity_id is required' })

  const { data: opp } = await supabase.from('opportunities').select('*').eq('id', p.opportunity_id).single()
  if (!opp) return res.status(404).json({ error: 'Opportunity not found' })

  const row = {
    number: await nextNumber('engineering_requests', 'ENG'),
    opportunity_id: opp.id,
    customer: opp.customer,
    project_name: clean(p.project_name) || opp.project_name,
    project_type: clean(p.project_type) || opp.project_type,
    project_location: clean(p.project_location) || opp.project_location || [opp.project_city, opp.project_district].filter(Boolean).join(' → '),
    drawings: Array.isArray(p.drawings) ? p.drawings : [],
    // G9 parity: same attachment ingest as from-opportunity path
    attachments: await ingestAttachments(p.attachments),
    boq_text: clean(p.boq_text),
    sales_notes: clean(p.sales_notes),
    required_date: clean(p.required_date),
    status: 'Pending Engineering Review',
    owner_id: req.user.id,
    created_by: req.user.id,
  }
  const { data, error } = await supabase.from('engineering_requests').insert(row).select().single()
  if (error) throw error

  const eos = await pushEngineeringRequest({ ...data, attachments: await signAttachmentList(data.attachments) })
  if (eos?.id) {
    await supabase.from('engineering_requests').update({ eos_request_id: eos.id }).eq('id', data.id)
    data.eos_request_id = eos.id
  }

  await logAudit(req.user, 'engineering_request', data.id, 'created', { number: data.number, opportunity_id: opp.id })
  res.status(201).json({ ...data, _eos_sync: eos })
}))

r.post('/requests/from-opportunity/:id', authRequired, authorize('sales', 'create'), asyncWrap(async (req, res) => {
  req.body = { ...req.body, opportunity_id: req.params.id }
  // delegate to create handler logic inline
  const p = req.body
  const { data: opp } = await supabase.from('opportunities').select('*').eq('id', p.opportunity_id).single()
  if (!opp) return res.status(404).json({ error: 'Opportunity not found' })
  const { data: existing } = await supabase.from('engineering_requests').select('id, number, status')
    .eq('opportunity_id', opp.id).neq('status', 'Ready for Quotation').limit(1).maybeSingle()
  if (existing) return res.status(422).json({ error: `An open engineering request already exists (${existing.number})`, request: existing })

  const row = {
    number: await nextNumber('engineering_requests', 'ENG'),
    opportunity_id: opp.id,
    customer: opp.customer,
    project_name: opp.project_name,
    project_type: opp.project_type,
    project_location: opp.project_location || [opp.project_city, opp.project_district].filter(Boolean).join(' → '),
    drawings: Array.isArray(p.drawings) ? p.drawings : [],
    attachments: await ingestAttachments(p.attachments),
    boq_text: clean(p.boq_text),
    sales_notes: clean(p.sales_notes) || clean(p.notes),
    required_date: clean(p.required_date) || opp.next_action_date,
    status: 'Pending Engineering Review',
    owner_id: req.user.id,
    created_by: req.user.id,
  }
  const { data, error } = await supabase.from('engineering_requests').insert(row).select().single()
  if (error) throw error
  // EOS receives the request WITH signed links to the attachments, so the engineer can open the
  // BOQ / drawings / specs / photos from inside the Engineering Inbox.
  const eos = await pushEngineeringRequest({ ...data, attachments: await signAttachmentList(data.attachments) })
  if (eos?.id) {
    await supabase.from('engineering_requests').update({ eos_request_id: eos.id }).eq('id', data.id)
    data.eos_request_id = eos.id
  }
  await logAudit(req.user, 'engineering_request', data.id, 'created', { from_opportunity: opp.id })
  res.status(201).json({ ...data, _eos_sync: eos })
}))

r.patch('/requests/:id/status', authRequired, authorize('sales', 'update'), asyncWrap(async (req, res) => {
  const status = (req.body.status || '').trim()
  if (!STATUSES.includes(status)) return res.status(422).json({ error: `Invalid status. Allowed: ${STATUSES.join(', ')}` })
  const { data, error } = await supabase.from('engineering_requests').update({ status, updated_at: new Date().toISOString() })
    .eq('id', req.params.id).select().single()
  if (error || !data) return res.status(404).json({ error: 'Not found' })
  if (data.eos_request_id) await patchEngineeringOnEos(data.eos_request_id, { status })
  await logAudit(req.user, 'engineering_request', data.id, 'status-updated', { status })
  res.json(data)
}))

r.get('/requests/:id/quotation-prefill', authRequired, authorize('sales', 'read'), asyncWrap(async (req, res) => {
  const { data: er } = await supabase.from('engineering_requests').select('*').eq('id', req.params.id).single()
  if (!er) return res.status(404).json({ error: 'Not found' })
  if (er.status !== 'Ready for Quotation') {
    return res.status(422).json({ error: `Engineering request must be "Ready for Quotation" (current: ${er.status})` })
  }
  const { data: opp } = await supabase.from('opportunities').select('*').eq('id', er.opportunity_id).maybeSingle()
  const { lines, unresolved } = await resolveApprovedItems(er.approved_items || [], { user: req.user })
  // resolveApprovedItems puts landed `cost` on every line. Every other quotation endpoint redacts its
  // output; this one must too, or a Sales user sees each item's cost in the prefill payload (Sales must
  // never see cost/margin). redactFinancials recurses into `lines` and strips cost for non-financial
  // roles, and passes the payload through unchanged for Management — and the save path re-derives cost
  // from the Item Master server-side, so GP is unaffected.
  res.json(redactFinancials(req.user.role, {
    opportunity_id: er.opportunity_id,
    customer: er.customer || opp?.customer,
    contact_person: opp?.contact_person || null,
    customer_email: opp?.customer_email || null,
    project_name: er.project_name,
    project_location: er.project_location,
    engineering_request_id: er.id,
    approved_items: er.approved_items || [],
    lines,
    unresolved,
  }))
}))

r.get('/equipment-recommendations', authRequired, authorize('sales', 'read'), asyncWrap(async (req, res) => {
  const family = req.query.product_family || req.query.family
  if (!family) return res.status(422).json({ error: 'product_family query param is required' })
  const rows = await recommendEquipment({
    product_family: family,
    brand_preference: req.query.brand,
    limit: Number(req.query.limit) || 5,
    includeMargin: isManagement(req.user.role),
  })
  res.json(rows)
}))

r.get('/dashboard-metrics', authRequired, authorize('sales', 'read'), asyncWrap(async (req, res) => {
  const [{ data: leads }, { data: opps }] = await Promise.all([
    supabase.from('leads').select('status, source, owner_id, assigned_to_id'),
    supabase.from('opportunities').select('stage, value, owner_id'),
  ])
  const byStatus = (arr, key) => Object.entries((arr || []).reduce((a, x) => {
    const k = x[key] || 'Other'; a[k] = (a[k] || 0) + 1; return a
  }, {})).map(([name, value]) => ({ name, value }))
  const won = (opps || []).filter((o) => o.stage === 'Won').length
  const lost = (opps || []).filter((o) => o.stage === 'Lost').length
  const pipeline = (opps || []).filter((o) => !['Won', 'Lost'].includes(o.stage)).reduce((s, o) => s + (Number(o.value) || 0), 0)
  res.json({
    leads_by_status: byStatus(leads, 'status'),
    leads_by_source: byStatus(leads, 'source'),
    leads_by_owner: byStatus((leads || []).map((l) => ({ owner: l.assigned_to_id || l.owner_id })), 'owner'),
    opportunities_won: won,
    opportunities_lost: lost,
    pipeline_value: pipeline,
  })
}))

export default r
