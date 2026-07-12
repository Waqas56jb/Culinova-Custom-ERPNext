import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { asyncWrap } from '../../middleware/error.js'
import { logAudit } from '../../core/audit.js'

const r = Router()

// ── DOCUMENTS with version history ──
// Documents can be attached to any entity (entity_type + entity_id) or stand alone.
r.get('/', authRequired, asyncWrap(async (req, res) => {
  let q = supabase.from('documents').select('*').order('created_at', { ascending: false }).limit(300)
  if (req.query.entity_type) q = q.eq('entity_type', req.query.entity_type)
  if (req.query.entity_id) q = q.eq('entity_id', String(req.query.entity_id))
  const { data, error } = await q
  if (error) throw error
  res.json(data || [])
}))

r.get('/:id', authRequired, asyncWrap(async (req, res) => {
  const { data: doc, error } = await supabase.from('documents').select('*').eq('id', req.params.id).single()
  if (error) return res.status(404).json({ error: 'Not found' })
  const { data: versions } = await supabase.from('document_versions').select('*').eq('document_id', doc.id).order('version', { ascending: false })
  res.json({ ...doc, versions: versions || [] })
}))

r.post('/', authRequired, asyncWrap(async (req, res) => {
  const b = req.body
  const { data: doc, error } = await supabase.from('documents').insert({
    name: b.name, doc_type: b.doc_type || null, entity_type: b.entity_type || null, entity_id: b.entity_id != null ? String(b.entity_id) : null,
    file_url: b.file_url || null, mime_type: b.mime_type || null, size: b.size || null,
    version: 1, uploaded_by: req.user.id, uploaded_by_name: req.user.name, notes: b.notes || null,
  }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  await supabase.from('document_versions').insert({ document_id: doc.id, version: 1, file_url: doc.file_url, note: 'Initial version', uploaded_by_name: req.user.name })
  await logAudit(req.user, 'document', doc.id, 'uploaded', { name: doc.name }).catch(() => {})
  res.status(201).json(doc)
}))

// add a NEW version of an existing document (keeps full history)
r.post('/:id/version', authRequired, asyncWrap(async (req, res) => {
  const { data: doc } = await supabase.from('documents').select('*').eq('id', req.params.id).single()
  if (!doc) return res.status(404).json({ error: 'Not found' })
  const nextV = (Number(doc.version) || 1) + 1
  await supabase.from('documents').update({ file_url: req.body.file_url, version: nextV }).eq('id', doc.id)
  const { data: v, error } = await supabase.from('document_versions').insert({ document_id: doc.id, version: nextV, file_url: req.body.file_url, note: req.body.note || `Version ${nextV}`, uploaded_by_name: req.user.name }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  await logAudit(req.user, 'document', doc.id, 'new-version', { version: nextV }).catch(() => {})
  res.status(201).json(v)
}))

r.delete('/:id', authRequired, asyncWrap(async (req, res) => {
  await supabase.from('documents').delete().eq('id', req.params.id) // versions cascade
  await logAudit(req.user, 'document', req.params.id, 'deleted', {}).catch(() => {})
  res.json({ ok: true })
}))

export default r
