import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'

const r = Router()

// ── recipient's own feed (any logged-in user) ──
r.get('/', authRequired, asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('notifications').select('*')
    .eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(50)
  if (error) throw error
  const items = data || []
  res.json({ items, unread: items.filter((n) => !n.read).length })
}))

r.post('/read-all', authRequired, asyncWrap(async (req, res) => {
  await supabase.from('notifications').update({ read: true }).eq('user_id', req.user.id).eq('read', false)
  res.json({ ok: true })
}))

r.post('/:id/read', authRequired, asyncWrap(async (req, res) => {
  await supabase.from('notifications').update({ read: true }).eq('id', req.params.id).eq('user_id', req.user.id)
  res.json({ ok: true })
}))

// ── admin: audience metadata (designations + live counts) for the compose form ──
r.get('/audiences', authRequired, authorize('admin', 'read'), asyncWrap(async (req, res) => {
  const { data } = await supabase.from('users').select('role, designation')
  const all = data || []
  res.json({
    customers: all.filter((u) => u.role === 'Customer').length,
    employees: all.filter((u) => u.role !== 'Customer').length,
    designations: [...new Set(all.filter((u) => u.role !== 'Customer' && u.designation).map((u) => u.designation))].sort(),
  })
}))

// ── admin: send a notification / announcement to a target audience ──
r.post('/send', authRequired, authorize('admin', 'create'), asyncWrap(async (req, res) => {
  const { audience, value, title, body } = req.body
  const msg = (body || '').trim()
  if (!msg) return res.status(422).json({ error: 'Message is required' })

  let q = supabase.from('users').select('id')
  if (audience === 'all_customers') q = q.eq('role', 'Customer')
  else if (audience === 'all_employees') q = q.neq('role', 'Customer')
  else if (audience === 'designation') {
    if (!value) return res.status(422).json({ error: 'Pick a designation' })
    q = q.neq('role', 'Customer').ilike('designation', value)
  } else if (audience === 'email') {
    if (!value) return res.status(422).json({ error: 'Enter the recipient email' })
    q = q.ilike('email', value.trim())
  } else return res.status(422).json({ error: 'Choose who should receive this' })

  const { data: recipients, error } = await q
  if (error) throw error
  if (!recipients?.length) return res.status(404).json({ error: 'No matching recipients found' })

  const rows = recipients.map((u) => ({ user_id: u.id, title: (title || 'Announcement').trim(), body: msg, sender: req.user.name }))
  const { error: e2 } = await supabase.from('notifications').insert(rows)
  if (e2) throw e2
  res.status(201).json({ ok: true, sent: rows.length })
}))

export default r
