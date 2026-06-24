import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'

const Ctx = createContext(null)
export const useTech = () => useContext(Ctx)
const prog = { Open: 0, 'In Progress': 50, Done: 100, Installed: 100 }

export function TechProvider({ children }) {
  const { user } = useAuth()
  const [tasks, setTasks] = useState([])
  const [snags, setSnags] = useState([])
  const [visits, setVisits] = useState([])

  const load = useCallback(async () => {
    try {
      const o = await api('/portal/technician/overview')
      setTasks((o.tasks || []).map((t) => ({ id: t.id, item: t.name, project: '', customer: '', status: t.status, progress: t.progress || 0, photos: 0 })))
      setSnags((o.snags || []).map((s) => ({ id: s.id, item: s.item_name, description: s.description, severity: s.severity, status: s.status })))
      setVisits((o.visits || []).map((v) => ({ id: v.id, ref: v.number, customer: v.customer, type: v.type, date: v.visit_date || '', status: v.status })))
    } catch { /* not authed */ }
  }, [])
  useEffect(() => { if (user) load() }, [user, load])

  const updateTask = async (id, status) => { await api(`/portal/technician/task/${id}`, { method: 'PATCH', body: { status, progress: prog[status] ?? 0 } }); await load() }
  const addPhoto = (id) => setTasks((p) => p.map((t) => (t.id === id ? { ...t, photos: (t.photos || 0) + 1 } : t)))
  const addSnag = async (d) => { await api('/portal/technician/snag', { method: 'POST', body: { item: d.item, description: d.description, severity: d.severity } }); await load() }
  const completeVisit = async (id) => { await api(`/portal/technician/visit/${id}`, { method: 'PATCH', body: { status: 'Completed' } }); await load() }

  return <Ctx.Provider value={{ tasks, snags, visits, updateTask, addPhoto, addSnag, completeVisit }}>{children}</Ctx.Provider>
}
