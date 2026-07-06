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
  // Make sure the account still EXISTS and is ACTIVE — on EVERY request (incl. GET), so a deactivated or
  // deleted user loses access immediately instead of retaining read access until the token expires (8h).
  try {
    const { data, error } = await supabase.from('users').select('id, status').eq('id', req.user.id).maybeSingle()
    if (!error) {
      if (!data) return res.status(401).json({ error: 'Your session is no longer valid. Please log in again.' })
      if (data.status && data.status !== 'Active') return res.status(403).json({ error: 'Your account is inactive. Contact your administrator.' })
    }
  } catch { /* transient DB hiccup — don't block a legitimate user */ }
  next()
}
