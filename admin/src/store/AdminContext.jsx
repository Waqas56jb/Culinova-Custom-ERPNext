import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { defaultMatrix } from '../data/adminData.js'
import { api } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'

const Ctx = createContext(null)
export const useAdmin = () => useContext(Ctx)

const mapUser = (u) => ({ id: u.id, name: u.name, email: u.email, designation: u.designation || '', dept: u.department || '', role: u.role, access: u.access_level, status: u.status })

export function AdminProvider({ children }) {
  const { user } = useAuth()
  const [users, setUsers] = useState([])
  const [matrix, setMatrix] = useState(defaultMatrix)

  const load = useCallback(async () => { try { const rows = await api('/users'); setUsers((rows || []).map(mapUser)) } catch { /* not authed yet */ } }, [])
  useEffect(() => { if (user) load() }, [user, load])

  // admin creates each person's email/password + role + access
  const addUser = async (d) => {
    await api('/users', { method: 'POST', body: { name: d.name, email: d.email, password: d.password || 'Culinova@123', role: d.role, access_level: d.access, designation: d.designation, department: d.dept } })
    await load()
  }
  // admin can change name/email/role/access
  const updateUser = async (id, d) => {
    await api(`/users/${id}`, { method: 'PATCH', body: { name: d.name, email: d.email, role: d.role, access_level: d.access, designation: d.designation, department: d.dept } })
    await load()
  }
  const deleteUser = async (id) => { await api(`/users/${id}`, { method: 'DELETE' }); await load() }
  const toggleStatus = async (id) => {
    const u = users.find((x) => x.id === id)
    await api(`/users/${id}`, { method: 'PATCH', body: { status: u?.status === 'Active' ? 'Disabled' : 'Active' } })
    await load()
  }
  // admin resets any person's password
  const resetPassword = async (id, newPassword) => { await api(`/users/${id}/reset-password`, { method: 'POST', body: { newPassword } }) }

  const toggleAccess = (role, panel) => setMatrix((m) => ({ ...m, [role]: { ...(m[role] || {}), [panel]: !(m[role]?.[panel]) } }))

  return <Ctx.Provider value={{ users, matrix, addUser, updateUser, deleteUser, toggleStatus, resetPassword, toggleAccess }}>{children}</Ctx.Provider>
}
