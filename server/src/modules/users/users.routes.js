import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'
import { logAudit } from '../../core/audit.js'

const r = Router()
const clean = (u) => { if (!u) return u; const c = { ...u }; delete c.password_hash; return c }
// external portal accounts — their record ownership is keyed on the account NAME
const PORTAL_ROLES = ['Customer', 'Supplier', 'Technician']

// ---- self-service (any logged-in user) — change own email / password ----
r.patch('/me', authRequired, asyncWrap(async (req, res) => {
  const patch = {}
  // SECURITY: portal ownership (quotations/POs/visits) is matched by name — a portal user must NOT be able
  // to rename into another user's records. Staff may rename freely (RBAC-scoped, not name-scoped).
  if (req.body.name && req.body.name !== req.user.name && PORTAL_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Your account name cannot be changed here — please contact support.' })
  }
  if (req.body.name) patch.name = req.body.name
  if (req.body.email) patch.email = req.body.email
  const { data, error } = await supabase.from('users').update(patch).eq('id', req.user.id).select().single()
  if (error) throw error
  await logAudit(req.user, 'user', req.user.id, 'updated-own-profile')
  res.json(clean(data))
}))

r.post('/me/change-password', authRequired, asyncWrap(async (req, res) => {
  const { currentPassword, newPassword } = req.body
  if (!newPassword || newPassword.length < 6) return res.status(422).json({ error: 'New password must be at least 6 characters' })
  const { data: u } = await supabase.from('users').select('*').eq('id', req.user.id).single()
  const ok = await bcrypt.compare(currentPassword || '', u.password_hash)
  if (!ok) return res.status(403).json({ error: 'Current password is incorrect' })
  await supabase.from('users').update({ password_hash: await bcrypt.hash(newPassword, 10) }).eq('id', req.user.id)
  await logAudit(req.user, 'user', req.user.id, 'changed-own-password')
  res.json({ ok: true })
}))

// ---- admin user management (Management / Full Admin) ----
r.get('/', authRequired, authorize('admin', 'read'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false })
  if (error) throw error
  res.json((data || []).map(clean))
}))

r.post('/', authRequired, authorize('admin', 'create'), asyncWrap(async (req, res) => {
  const { name, email, password, role, access_level, designation, department } = req.body
  if (!name || !email || !password) return res.status(422).json({ error: 'name, email, password required' })
  const hash = await bcrypt.hash(password, 10)
  const { data, error } = await supabase.from('users').insert({
    name, email, password_hash: hash, role: role || 'Sales User', access_level: access_level || 'Create',
    designation, department,
  }).select().single()
  if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: error.message })
  await logAudit(req.user, 'user', data.id, 'created-user', { email, role })
  res.status(201).json(clean(data))
}))

r.patch('/:id', authRequired, authorize('admin', 'update'), asyncWrap(async (req, res) => {
  const patch = { ...req.body }
  delete patch.password // password changes go through reset-password
  delete patch.password_hash
  const { data, error } = await supabase.from('users').update(patch).eq('id', req.params.id).select().single()
  if (error) throw error
  await logAudit(req.user, 'user', req.params.id, 'updated-user', patch)
  res.json(clean(data))
}))

r.post('/:id/reset-password', authRequired, authorize('admin', 'update'), asyncWrap(async (req, res) => {
  const { newPassword } = req.body
  if (!newPassword || newPassword.length < 6) return res.status(422).json({ error: 'Password must be at least 6 characters' })
  const { error } = await supabase.from('users').update({ password_hash: await bcrypt.hash(newPassword, 10) }).eq('id', req.params.id)
  if (error) throw error
  await logAudit(req.user, 'user', req.params.id, 'reset-password')
  res.json({ ok: true })
}))

r.delete('/:id', authRequired, authorize('admin', 'delete'), asyncWrap(async (req, res) => {
  const { error } = await supabase.from('users').delete().eq('id', req.params.id)
  if (error) throw error
  await logAudit(req.user, 'user', req.params.id, 'deleted-user')
  res.json({ ok: true })
}))

export default r
