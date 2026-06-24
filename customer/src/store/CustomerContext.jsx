import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'

const Ctx = createContext(null)
export const useCustomer = () => useContext(Ctx)
const d10 = (r) => (r.created_at || '').slice(0, 10)

export function CustomerProvider({ children }) {
  const { user } = useAuth()
  const [projects, setProjects] = useState([])
  const [quotations, setQuotations] = useState([])
  const [invoices, setInvoices] = useState([])
  const [tickets, setTickets] = useState([])
  const [messages, setMessages] = useState([])

  const loadMessages = useCallback(async () => {
    try { const m = await api('/portal/customer/messages'); setMessages(m || []) } catch { /* not authed */ }
  }, [])

  const load = useCallback(async () => {
    try {
      const o = await api('/portal/customer/overview')
      setQuotations((o.quotations || []).map((q) => ({ id: q.id, ref: q.number || q.id, project: q.project_name || '—', amount: Number(q.total_amount) || 0, date: d10(q), valid: q.valid_till || '', status: q.status })))
      setInvoices((o.invoices || []).map((i) => ({ id: i.number || i.id, project: i.project_id || '—', total: Number(i.total) || 0, paid: Number(i.paid) || 0, due: i.due_date || '', status: i.status })))
      setProjects((o.projects || []).map((p) => ({ id: p.number || p.id, name: p.name, value: Number(p.contract_value) || 0, progress: p.progress || 0, status: p.status, start: p.start_date || '', end: p.end_date || '', items: [] })))
      setTickets((o.tickets || []).map((t) => ({ id: t.number || t.id, subject: t.subject, priority: t.priority, status: t.status, date: d10(t) })))
    } catch { /* not authed */ }
  }, [])
  useEffect(() => { if (user) { load(); loadMessages() } }, [user, load, loadMessages])

  // quotation actions — REAL (accept creates order+project; reject/concession notify sales)
  const acceptQuote = async (id) => { await api(`/portal/customer/quotations/${id}/accept`, { method: 'POST' }); await load(); await loadMessages() }
  const rejectQuote = async (id, reason) => { await api(`/portal/customer/quotations/${id}/reject`, { method: 'POST', body: { reason } }); await load(); await loadMessages() }
  const requestConcession = async (id, note) => { await api(`/portal/customer/quotations/${id}/concession`, { method: 'POST', body: { note } }); await loadMessages() }
  const payInvoice = (id) => setInvoices((p) => p.map((i) => (i.id === id ? { ...i, paid: i.total, status: 'Paid' } : i)))
  const raiseTicket = async (d) => { await api('/portal/customer/tickets', { method: 'POST', body: { subject: d.subject, priority: d.priority } }); await load() }
  // chat — message goes to ONE recipient: the sales team
  const sendMessage = async (body) => { await api('/portal/customer/messages', { method: 'POST', body: { body } }); await loadMessages() }

  return <Ctx.Provider value={{ projects, quotations, invoices, tickets, messages, acceptQuote, rejectQuote, requestConcession, payInvoice, raiseTicket, sendMessage, loadMessages }}>{children}</Ctx.Provider>
}
