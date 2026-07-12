import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { asyncWrap } from '../../middleware/error.js'

const r = Router()

// Per-user preferences (dashboard widget layout, UI settings). Scoped to the logged-in user only.
r.get('/', authRequired, asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('user_preferences').select('pref_key, pref_value').eq('user_id', req.user.id)
  if (error) throw error
  const out = {}
  for (const row of data || []) out[row.pref_key] = row.pref_value
  res.json(out)
}))

r.put('/:key', authRequired, asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('user_preferences')
    .upsert({ user_id: req.user.id, pref_key: req.params.key, pref_value: req.body.value ?? null, updated_at: new Date().toISOString() }, { onConflict: 'user_id,pref_key' })
    .select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
}))

export default r
