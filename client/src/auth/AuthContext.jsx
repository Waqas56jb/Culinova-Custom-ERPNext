import { createContext, useContext, useState, useEffect } from 'react'
import { api } from '../api.js'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('culinova_user') || 'null') } catch { return null } })
  const [panels, setPanels] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!localStorage.getItem('culinova_token')) { setLoading(false); return }
    api('/my-access').then((a) => setPanels(a.panels || [])).catch(() => doLogout()).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function login(email, password) {
    const { token, user: u } = await api('/auth/login', { method: 'POST', auth: false, body: { email, password } })
    localStorage.setItem('culinova_token', token)
    localStorage.setItem('culinova_user', JSON.stringify(u))
    setUser(u)
    const a = await api('/my-access'); setPanels(a.panels || [])
  }

  function doLogout() {
    localStorage.removeItem('culinova_token')
    localStorage.removeItem('culinova_user')
    setUser(null); setPanels([])
  }

  const canSee = (panel) => panels.includes('*') || panels.includes(panel)

  return <Ctx.Provider value={{ user, panels, canSee, login, logout: doLogout, loading }}>{children}</Ctx.Provider>
}
