// Equipment condition survey — isolated module. Shared masters: customers + sites.
// Visit / type-catalog / photos stay here so the module can grow independently.
import { Router } from 'express'
import { authRequired } from '../../middleware/auth.js'
import { authorize } from '../../middleware/rbac.js'
import { canAccessPanel, canDoAction } from '../../rbac/permissions.js'
import { asyncWrap } from '../../middleware/error.js'
import { logAudit } from '../../core/audit.js'
import {
  listSites, createSite, updateSite, getCatalog,
  listVisits, getVisit, createVisit, updateVisit, deleteVisit, submitVisit,
  addLine, updateLine, deleteLine, addPhoto, deletePhoto, updatePhoto,
} from './survey.service.js'

const r = Router()
r.use(authRequired)

/** Survey-panel gate. Create-level Technicians may hit Draft visit edits; service enforces ownership. */
function authorizeSurvey(action) {
  return (req, res, next) => {
    const { role, access_level } = req.user || {}
    if (!canAccessPanel(role, 'survey')) return res.status(403).json({ error: 'No access to survey panel' })
    if (canDoAction(access_level, action)) return next()
    if (
      action === 'update'
      && role === 'Technician'
      && canDoAction(access_level, 'create')
    ) return next()
    return res.status(403).json({ error: `Your access level cannot ${action}` })
  }
}

r.get('/catalog', authorize('survey', 'read'), asyncWrap(async (req, res) => {
  res.json(await getCatalog({ q: req.query.q, category: req.query.category }))
}))

r.get('/sites', authorize('survey', 'read'), asyncWrap(async (req, res) => {
  res.json(await listSites({ customer_id: req.query.customer_id }))
}))

r.post('/sites', authorize('survey', 'create'), asyncWrap(async (req, res) => {
  const site = await createSite(req.body || {})
  await logAudit(req.user, 'site', site.id, 'create', { customer_id: site.customer_id, name: site.name })
  res.status(201).json(site)
}))

r.patch('/sites/:id', authorize('survey', 'update'), asyncWrap(async (req, res) => {
  const site = await updateSite(req.params.id, req.body || {})
  await logAudit(req.user, 'site', site.id, 'update', req.body)
  res.json(site)
}))

r.get('/visits', authorize('survey', 'read'), asyncWrap(async (req, res) => {
  res.json(await listVisits({
    site_id: req.query.site_id,
    customer_id: req.query.customer_id,
    status: req.query.status,
  }, req.user))
}))

r.post('/visits', authorize('survey', 'create'), asyncWrap(async (req, res) => {
  const visit = await createVisit(req.body || {}, req.user)
  await logAudit(req.user, 'survey_visit', visit.id, 'create', { site_id: visit.site_id })
  res.status(201).json(visit)
}))

r.get('/visits/:id', authorize('survey', 'read'), asyncWrap(async (req, res) => {
  res.json(await getVisit(req.params.id, req.user))
}))

r.delete('/visits/:id', authorizeSurvey('delete'), asyncWrap(async (req, res) => {
  const result = await deleteVisit(req.params.id, req.user)
  await logAudit(req.user, 'survey_visit', req.params.id, 'delete', null)
  res.json(result)
}))

r.patch('/visits/:id', authorizeSurvey('update'), asyncWrap(async (req, res) => {
  const visit = await updateVisit(req.params.id, req.body || {}, req.user)
  await logAudit(req.user, 'survey_visit', visit.id, 'update', req.body)
  res.json(visit)
}))

r.post('/visits/:id/submit', authorize('survey', 'create'), asyncWrap(async (req, res) => {
  const visit = await submitVisit(req.params.id, req.user)
  await logAudit(req.user, 'survey_visit', visit.id, 'submit', { site_id: visit.site_id })
  res.json(visit)
}))

r.post('/visits/:id/lines', authorize('survey', 'create'), asyncWrap(async (req, res) => {
  const line = await addLine(req.params.id, req.body || {}, req.user)
  await logAudit(req.user, 'survey_visit_line', line.id, 'create', { visit_id: req.params.id })
  res.status(201).json(line)
}))

r.patch('/visits/:id/lines/:lineId', authorizeSurvey('update'), asyncWrap(async (req, res) => {
  const line = await updateLine(req.params.id, req.params.lineId, req.body || {}, req.user)
  await logAudit(req.user, 'survey_visit_line', line.id, 'update', req.body)
  res.json(line)
}))

r.delete('/visits/:id/lines/:lineId', authorizeSurvey('update'), asyncWrap(async (req, res) => {
  const result = await deleteLine(req.params.id, req.params.lineId, req.user)
  await logAudit(req.user, 'survey_visit_line', req.params.lineId, 'delete', { visit_id: req.params.id })
  res.json(result)
}))

r.post('/visits/:id/lines/:lineId/photos', authorize('survey', 'create'), asyncWrap(async (req, res) => {
  const photo = await addPhoto(req.params.id, req.params.lineId, req.body || {}, req.user)
  await logAudit(req.user, 'survey_photo', photo.id, 'create', { line_id: req.params.lineId })
  res.status(201).json(photo)
}))

r.patch('/photos/:id', authorizeSurvey('update'), asyncWrap(async (req, res) => {
  const photo = await updatePhoto(req.params.id, req.body || {}, req.user)
  await logAudit(req.user, 'survey_photo', req.params.id, 'update', { kind: req.body?.kind })
  res.json(photo)
}))

r.delete('/photos/:id', authorizeSurvey('update'), asyncWrap(async (req, res) => {
  const result = await deletePhoto(req.params.id, req.user)
  await logAudit(req.user, 'survey_photo', req.params.id, 'delete', null)
  res.json(result)
}))

export default r
