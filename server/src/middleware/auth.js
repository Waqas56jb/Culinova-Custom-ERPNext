import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { supabase } from '../config/supabase.js'

export async function authRequired(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Authentication required' })
  try {
    req.user = jwt.verify(token, env.jwtSecret) // { id, name, email, role, access_level }
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
  // For writes: make sure the account still EXISTS (deleted user / reset DB → end the session
  // cleanly instead of failing later on an owner_id foreign-key constraint).
  if (req.method !== 'GET') {
    try {
      const { data, error } = await supabase.from('users').select('id').eq('id', req.user.id).maybeSingle()
      if (!error && !data) return res.status(401).json({ error: 'Your session is no longer valid. Please log in again.' })
    } catch { /* transient DB hiccup — don't block a legitimate user */ }
  }
  next()
}
