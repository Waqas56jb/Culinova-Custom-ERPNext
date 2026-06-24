import { createContext, useContext, useState, useEffect } from 'react'
import { api } from '../api.js'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)
const PORTAL_ROLE = 'Technician'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('culinova_user') || 'null') } catch { return null } })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!localStorage.getItem('culinova_token')) { setLoading(false); return }
    api('/auth/me').then(() => {}).catch(() => logout()).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const persist = (token, u) => { localStorage.setItem('culinova_token', token); localStorage.setItem('culinova_user', JSON.stringify(u)); setUser(u) }
  async function login(email, password) { const { token, user: u } = await api('/auth/login', { method: 'POST', auth: false, body: { email, password } }); if (u.role !== PORTAL_ROLE) throw new Error('This app is for technicians only.'); persist(token, u) }
  async function signup(name, email, password) { const { token, user: u } = await api('/auth/signup', { method: 'POST', auth: false, body: { name, email, password, role: PORTAL_ROLE } }); persist(token, u) }
  async function reset(email, newPassword) { await api('/auth/reset-password', { method: 'POST', auth: false, body: { email, newPassword } }) }
  function logout() { localStorage.removeItem('culinova_token'); localStorage.removeItem('culinova_user'); setUser(null) }

  return <Ctx.Provider value={{ user, login, signup, reset, logout, loading }}>{children}</Ctx.Provider>
}
