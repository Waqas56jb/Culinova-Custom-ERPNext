import { createContext, useContext, useState, useEffect } from 'react'
import { api } from '../api.js'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)
const ADMIN_ROLES = ['Management', 'System Admin']

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('culinova_user') || 'null') } catch { return null } })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!localStorage.getItem('culinova_token')) { setLoading(false); return }
    api('/auth/me').then(() => {}).catch(() => logout()).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function login(email, password) {
    const { token, user: u } = await api('/auth/login', { method: 'POST', auth: false, body: { email, password } })
    if (!ADMIN_ROLES.includes(u.role)) throw new Error('This console is for administrators only.')
    localStorage.setItem('culinova_token', token)
    localStorage.setItem('culinova_user', JSON.stringify(u))
    setUser(u)
  }
  function logout() { localStorage.removeItem('culinova_token'); localStorage.removeItem('culinova_user'); setUser(null) }

  return <Ctx.Provider value={{ user, login, logout, loading }}>{children}</Ctx.Provider>
}
