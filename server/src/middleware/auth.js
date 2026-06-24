import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

export function authRequired(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Authentication required' })
  try {
    req.user = jwt.verify(token, env.jwtSecret) // { id, name, role, access_level }
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}
