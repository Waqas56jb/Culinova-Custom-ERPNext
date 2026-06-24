import { useState, useEffect, useRef } from 'react'
import { Send, Loader2, Mail, MessageSquare } from 'lucide-react'
import { PageHeader } from '../components/ui.jsx'
import { useCustomer } from '../store/CustomerContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

const initials = (n) => (n || '?').split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase()
const timeOf = (s) => (s ? new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')

export default function Chat() {
  const { messages, sendMessage, loadMessages } = useCustomer()
  const { user } = useAuth()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const endRef = useRef(null)

  useEffect(() => { const t = setInterval(loadMessages, 8000); return () => clearInterval(t) }, [loadMessages])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [messages.length])

  const send = async () => {
    if (!text.trim()) return
    const body = text.trim(); setText(''); setSending(true)
    try { await sendMessage(body) } catch (e) { alert(e.message) } finally { setSending(false) }
  }

  return (
    <>
      <PageHeader title="Chat with Sales" subtitle="Message the CULINOVA sales team directly" />

      <div className="card flex h-[calc(100vh-190px)] min-h-[440px] flex-col overflow-hidden">
        {/* your profile (what the salesperson sees) */}
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-navy-700 to-brand-600 text-sm font-bold text-white">{initials(user?.name)}</span>
          <div className="min-w-0">
            <p className="truncate font-bold text-ink">{user?.name}</p>
            <p className="flex items-center gap-1 truncate text-xs text-muted"><Mail size={12} /> {user?.email}</p>
          </div>
          <span className="ml-auto shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600">CULINOVA Sales</span>
        </div>

        {/* messages */}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/50 p-4">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-slate-400">
              <MessageSquare size={40} className="mb-2 opacity-40" />
              <p className="text-sm">Start the conversation — send your first message below.</p>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.sender === 'customer' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-soft ${m.sender === 'customer' ? 'bg-brand-500 text-white' : 'bg-white text-ink'}`}>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`mt-1 text-[10px] ${m.sender === 'customer' ? 'text-white/70' : 'text-muted'}`}>{m.sender === 'customer' ? 'You' : (m.staff_name || 'Sales')} · {timeOf(m.created_at)}</p>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {/* send box */}
        <div className="flex shrink-0 items-center gap-2 border-t border-slate-100 bg-white p-3">
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Type your message…" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-500/15" />
          <button onClick={send} disabled={sending || !text.trim()} className="btn-primary shrink-0 disabled:opacity-60">{sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}<span className="hidden sm:inline">Send</span></button>
        </div>
      </div>
    </>
  )
}
