import { useState, useMemo } from 'react'
import { Send, FileText, UserPlus, Mail, MessageSquare, Loader2 } from 'lucide-react'
import { PageHeader } from '../components/ui.jsx'
import { useData } from '../store/DataContext.jsx'

const initials = (n) => (n || '?').split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase()
const timeOf = (s) => (s ? new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')

export default function Chat() {
  const { chatMessages, sendChatReply, markChatRead, openForm } = useData()
  const [active, setActive] = useState(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const threads = useMemo(() => {
    const map = {}
    for (const m of chatMessages) {
      const k = m.customer_email
      if (!map[k]) map[k] = { email: k, name: m.customer_name, messages: [], unread: 0 }
      map[k].messages.push(m)
      map[k].name = m.customer_name
      if (m.sender === 'customer' && !m.read) map[k].unread++
    }
    return Object.values(map).sort((a, b) => (b.messages[b.messages.length - 1]?.created_at || '').localeCompare(a.messages[a.messages.length - 1]?.created_at || ''))
  }, [chatMessages])

  const current = threads.find((t) => t.email === active)
  const openThread = (t) => { setActive(t.email); if (t.unread) markChatRead(t.email) }
  const send = async () => {
    if (!text.trim() || !current) return
    const body = text.trim(); setText(''); setSending(true)
    try { await sendChatReply(current.email, current.name, body) } catch (e) { alert(e.message) } finally { setSending(false) }
  }

  return (
    <>
      <PageHeader title="Customer Chat" subtitle="Messages from customers — reply, then create a quotation or lead from their details" />

      <div className="card grid h-[calc(100vh-220px)] grid-cols-1 overflow-hidden md:grid-cols-[300px_1fr]">
        {/* thread list */}
        <div className="border-r border-slate-100 overflow-y-auto">
          {threads.length === 0 && <p className="p-6 text-center text-sm text-slate-400">No customer messages yet.</p>}
          {threads.map((t) => (
            <button key={t.email} onClick={() => openThread(t)}
              className={`flex w-full items-center gap-3 border-b border-slate-50 p-3 text-left hover:bg-slate-50 ${active === t.email ? 'bg-brand-50/60' : ''}`}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-navy-700 to-brand-600 text-xs font-bold text-white">{initials(t.name)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{t.name}</p>
                <p className="truncate text-xs text-muted">{t.messages[t.messages.length - 1]?.body}</p>
              </div>
              {t.unread > 0 && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-bold text-white">{t.unread}</span>}
            </button>
          ))}
        </div>

        {/* conversation */}
        {current ? (
          <div className="flex flex-col">
            {/* customer profile header */}
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-navy-700 to-brand-600 text-sm font-bold text-white">{initials(current.name)}</span>
              <div className="min-w-0">
                <p className="font-bold text-ink">{current.name}</p>
                <p className="flex items-center gap-1 text-xs text-muted"><Mail size={12} /> {current.email}</p>
              </div>
              <div className="ml-auto flex gap-2">
                <button onClick={() => openForm('quotation', { customer: current.name, email: current.email })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50"><FileText size={14} /> Create Quotation</button>
                <button onClick={() => openForm('lead', { company: current.name, email: current.email, name: current.name })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"><UserPlus size={14} /> Store as Lead</button>
              </div>
            </div>

            {/* messages */}
            <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/50 p-4">
              {current.messages.map((m) => (
                <div key={m.id} className={`flex ${m.sender === 'staff' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${m.sender === 'staff' ? 'bg-brand-500 text-white' : 'bg-white text-ink shadow-soft'}`}>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className={`mt-1 text-[10px] ${m.sender === 'staff' ? 'text-white/70' : 'text-muted'}`}>{m.sender === 'staff' ? (m.staff_name || 'You') : current.name} · {timeOf(m.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* reply box */}
            <div className="flex items-center gap-2 border-t border-slate-100 p-3">
              <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Type a reply…" className="flex-1 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm outline-none focus:border-brand-400 focus:bg-white" />
              <button onClick={send} disabled={sending || !text.trim()} className="btn-primary disabled:opacity-60">{sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send</button>
            </div>
          </div>
        ) : (
          <div className="hidden flex-col items-center justify-center text-slate-400 md:flex">
            <MessageSquare size={40} className="mb-2 opacity-40" />
            <p className="text-sm">Select a conversation</p>
          </div>
        )}
      </div>
    </>
  )
}
