import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize } from '../../middleware/rbac.js'
import { isManagement } from '../../rbac/permissions.js'
import { asyncWrap } from '../../middleware/error.js'
import { logAudit } from '../../core/audit.js'
import { nextNumber } from '../../core/numbering.js'
import { pushEngineeringRequest, syncEngineeringStatus, patchEngineeringOnEos, STATUSES } from '../../core/engineeringSync.js'
import { recommendEquipment } from '../../core/equipmentRecommend.js'
import { resolveApprovedItems } from '../../core/approvedItemsResolve.js'

const r = Router()
const clean = (v) => (v === '' || v === undefined ? null : v)

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
  res.json({ ...data, _eos: eos || null })
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
    boq_text: clean(p.boq_text),
    sales_notes: clean(p.sales_notes),
    required_date: clean(p.required_date),
    status: 'Pending Engineering Review',
    owner_id: req.user.id,
    created_by: req.user.id,
  }
  const { data, error } = await supabase.from('engineering_requests').insert(row).select().single()
  if (error) throw error

  const eos = await pushEngineeringRequest(data)
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
    boq_text: clean(p.boq_text),
    sales_notes: clean(p.sales_notes) || clean(p.notes),
    required_date: clean(p.required_date) || opp.next_action_date,
    status: 'Pending Engineering Review',
    owner_id: req.user.id,
    created_by: req.user.id,
  }
  const { data, error } = await supabase.from('engineering_requests').insert(row).select().single()
  if (error) throw error
  const eos = await pushEngineeringRequest(data)
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
  const { lines, unresolved } = await resolveApprovedItems(er.approved_items || [])
  res.json({
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
  })
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
