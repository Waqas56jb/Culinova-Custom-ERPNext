import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { supabase } from '../../config/supabase.js'
import { env } from '../../config/env.js'
import { authRequired } from '../../middleware/auth.js'
import { asyncWrap } from '../../middleware/error.js'

const r = Router()
const sign = (u) => jwt.sign({ id: u.id, name: u.name, email: u.email, role: u.role, access_level: u.access_level }, env.jwtSecret, { expiresIn: env.jwtExpires })

// First-run: create the single admin account if it doesn't exist.
r.post('/seed', asyncWrap(async (req, res) => {
  const email = 'admin@gmail.com'
  const { data: existing } = await supabase.from('users').select('id').eq('email', email).maybeSingle()
  if (existing) return res.status(200).json({ ok: true, note: 'Admin already exists', email })
  const hash = await bcrypt.hash('admin@123!', 10)
  const { data, error } = await supabase.from('users').insert({
    name: 'System Administrator', email, password_hash: hash,
    designation: 'Administrator', department: 'Management', role: 'Management', access_level: 'Full Admin',
  }).select().single()
  if (error) throw error
  res.status(201).json({ ok: true, email: data.email, password: 'admin@123!' })
}))

r.post('/login', asyncWrap(async (req, res) => {
  const { email, password } = req.body
  const { data: user } = await supabase.from('users').select('*').eq('email', email).single()
  if (!user || user.status !== 'Active') return res.status(401).json({ error: 'Invalid credentials' })
  const ok = await bcrypt.compare(password || '', user.password_hash)
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' })
  res.json({ token: sign(user), user: { id: user.id, name: user.name, email: user.email, role: user.role, access_level: user.access_level, designation: user.designation } })
}))

r.get('/me', authRequired, (req, res) => res.json(req.user))

// Self-registration for EXTERNAL portals only (Customer / Supplier / Technician).
// Internal staff are created by the admin in the management panel.
const PORTAL_ROLES = ['Customer', 'Supplier', 'Technician']
r.post('/signup', asyncWrap(async (req, res) => {
  const { name, email, password, role } = req.body
  if (!name || !email || !password) return res.status(422).json({ error: 'name, email, password required' })
  if (!PORTAL_ROLES.includes(role)) return res.status(403).json({ error: 'Self-signup allowed only for portal roles' })
  const hash = await bcrypt.hash(password, 10)
  const { data, error } = await supabase.from('users').insert({
    name, email, password_hash: hash, role, access_level: 'Create', department: role,
  }).select().single()
  if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: error.code === '23505' ? 'Email already registered' : error.message })
  res.status(201).json({ token: sign(data), user: { id: data.id, name: data.name, email: data.email, role: data.role, access_level: data.access_level } })
}))

// Password reset (simplified — production should email a one-time token).
r.post('/reset-password', asyncWrap(async (req, res) => {
  const { email, newPassword } = req.body
  if (!email || !newPassword || newPassword.length < 6) return res.status(422).json({ error: 'email + newPassword (min 6) required' })
  const { data: user } = await supabase.from('users').select('id, role').eq('email', email).maybeSingle()
  if (!user) return res.status(404).json({ error: 'No account with this email' })
  await supabase.from('users').update({ password_hash: await bcrypt.hash(newPassword, 10) }).eq('id', user.id)
  res.json({ ok: true })
}))

export default r
