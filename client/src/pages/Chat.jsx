import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send, FileText, UserPlus, Mail, Phone, MessageSquare, Loader2, ArrowLeft, Paperclip, X, Download, Search, FolderKanban, Package, Plus } from 'lucide-react'
import { useData } from '../store/DataContext.jsx'
import QuotationPreview from '../components/QuotationPreview.jsx'

const initials = (n) => (n || '?').split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase()
const fileToDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file) })
const isImg = (name = '', type = '') => /^image\//.test(type) || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name)
const timeOf = (s) => (s ? new Date(s).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '')
const dayLabel = (s) => {
  if (!s) return ''
  const d = new Date(s), t = new Date()
  const same = (a, b) => a.toDateString() === b.toDateString()
  if (same(d, t)) return 'Today'
  const y = new Date(t); y.setDate(t.getDate() - 1)
  if (same(d, y)) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function Attachment({ m, mine }) {
  if (!m.attachment_path) return null
  const url = m.attachment_url
  if (isImg(m.attachment_name) && url) return <a href={url} target="_blank" rel="noreferrer" className="mt-1.5 block"><img src={url} alt={m.attachment_name} className="max-h-56 max-w-full rounded-xl object-cover" /></a>
  return (
    <a href={url || '#'} target="_blank" rel="noreferrer" className={`mt-1.5 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${mine ? 'border-white/25 bg-white/10' : 'border-slate-200 bg-white'}`}>
      <FileText size={18} className={mine ? 'text-white' : 'text-brand-600'} />
      <span className="min-w-0 flex-1 truncate font-medium">{m.attachment_name}</span>
      <Download size={15} className="shrink-0 opacity-70" />
    </a>
  )
}

export default function Chat() {
  const navigate = useNavigate()
  const { chatMessages, sendChatReply, markChatRead, openForm, salesOrders, quotations, customerDir, opportunities, getOpportunityQuotationPrefill } = useData()
  const [active, setActive] = useState(null)
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [sending, setSending] = useState(false)
  const [quoting, setQuoting] = useState(false)
  const [q, setQ] = useState('')
  const [preview, setPreview] = useState(null)
  const endRef = useRef(null); const fileRef = useRef(null); const taRef = useRef(null)

  const threads = useMemo(() => {
    const map = {}
    for (const m of chatMessages) {
      const k = m.customer_email
      if (!map[k]) map[k] = { email: k, name: m.customer_name, messages: [], unread: 0 }
      map[k].messages.push(m); map[k].name = m.customer_name
      if (m.sender === 'customer' && !m.read) map[k].unread++
    }
    return Object.values(map)
      .filter((t) => (t.name + t.email).toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => (b.messages.at(-1)?.created_at || '').localeCompare(a.messages.at(-1)?.created_at || ''))
  }, [chatMessages, q])

  const current = threads.find((t) => t.email === active) || (active ? { email: active, name: active, messages: [] } : null)
  const custOrders = current ? salesOrders.filter((o) => o.customer === current.name) : []
  const lockedProjects = [...new Set(custOrders.map((o) => o.projectNo).filter(Boolean))]
  const latestQuote = current ? quotations.find((qq) => qq.customer === current.name) : null
  const custPhone = current ? (customerDir.find((c) => (c.email || '').toLowerCase() === (current.email || '').toLowerCase())?.phone) : null
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [current?.messages.length, active])
  useEffect(() => { const ta = taRef.current; if (ta) { ta.style.height = '0px'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px' } }, [text])

  const openThread = (t) => { setActive(t.email); setFile(null); setText(''); if (t.unread) markChatRead(t.email) }
  const pickFile = async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; if (f.size > 10 * 1024 * 1024) return alert('File too large (max 10MB)'); setFile({ name: f.name, type: f.type, dataUrl: await fileToDataUrl(f) }) }
  /** Block 4 / S3B3: Chat → Quote opens quotation builder (not legacy modal). Needs an open Opportunity. */
  const startQuoteFromChat = async () => {
    if (!current || quoting) return
    setQuoting(true)
    try {
      const open = (opportunities || []).find((o) =>
        (o.customer || '').toLowerCase() === (current.name || '').toLowerCase()
        && o.stage !== 'Lost' && o.stage !== 'Won')
      if (!open?.id) {
        alert('No open Opportunity for this customer. Create / open one on Opportunities, then use Quotation — or create Opportunity first.')
        navigate('/sales/opportunities')
        return
      }
      const prefill = await getOpportunityQuotationPrefill(open.id)
      navigate('/sales/quotations', {
        state: {
          quotePrefill: {
            ...prefill,
            customer: current.name,
            customer_email: current.email || prefill.customer_email || '',
          },
        },
      })
    } catch (e) {
      alert(e.message)
    } finally {
      setQuoting(false)
    }
  }
  const send = async () => {
    if ((!text.trim() && !file) || !current) return
    const body = text.trim(), att = file; setText(''); setFile(null); setSending(true)
    try { await sendChatReply(current.email, current.name, body, att) } catch (e) { alert(e.message) } finally { setSending(false) }
  }

  let lastDay = null

  return (
    <>
    <div className="flex h-[calc(100vh-128px)] min-h-[460px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      {/* thread list */}
      <div className={`${active ? 'hidden md:flex' : 'flex'} w-full flex-col border-r border-slate-100 md:w-[320px] md:shrink-0`}>
        <div className="shrink-0 border-b border-slate-100 p-3">
          <h2 className="mb-2 px-1 font-display text-lg font-extrabold text-ink">Customer Chat</h2>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers…" className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:bg-white" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {threads.length === 0 && <p className="p-6 text-center text-sm text-slate-400">No conversations yet.</p>}
          {threads.map((t) => {
            const last = t.messages.at(-1)
            return (
              <button key={t.email} onClick={() => openThread(t)} className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50 ${active === t.email ? 'bg-brand-50/70' : ''}`}>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-navy-700 to-brand-600 text-xs font-bold text-white">{initials(t.name)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold text-ink">{t.name}</p><span className="shrink-0 text-[10px] text-muted">{timeOf(last?.created_at)}</span></div>
                  <p className="truncate text-xs text-muted">{last?.attachment_path && !last?.body ? '📎 Attachment' : last?.body}</p>
                </div>
                {t.unread > 0 && <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-brand-500 px-1.5 text-[11px] font-bold text-white">{t.unread}</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* conversation */}
      <div className={`${active ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col bg-slate-50/40`}>
        {current ? (
          <>
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 bg-white px-3 py-2.5 sm:gap-3 sm:px-4">
              <button onClick={() => setActive(null)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 md:hidden"><ArrowLeft size={18} /></button>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-navy-700 to-brand-600 text-xs font-bold text-white">{initials(current.name)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-bold text-ink">{current.name}</p>
                  {custOrders.length > 0 && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600"><Package size={10} /> {custOrders.length} order{custOrders.length > 1 ? 's' : ''}</span>}
                </div>
                <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted">
                  <span className="inline-flex items-center gap-1"><Mail size={11} /> {current.email}</span>
                  {custPhone && <a href={`tel:${custPhone}`} className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline"><Phone size={11} /> {custPhone}</a>}
                  {lockedProjects.length > 0 && <span className="inline-flex items-center gap-1 font-semibold text-violet-600"><FolderKanban size={11} /> {lockedProjects.join(', ')}</span>}
                </p>
              </div>
              {/* right side of profile: locked quotation PDF + actions */}
              {latestQuote && <button onClick={() => setPreview(latestQuote)} title="View quotation PDF" className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50"><FileText size={14} /> PDF</button>}
              <button onClick={startQuoteFromChat} disabled={quoting} className="hidden items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 sm:inline-flex disabled:opacity-50"><Plus size={14} /> {quoting ? 'Opening…' : 'Quote'}</button>
              <button onClick={() => openForm('lead', { company: current.name, email: current.email, name: current.name })} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"><UserPlus size={14} /><span className="hidden sm:inline">Lead</span></button>
            </div>

            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4 sm:px-6">
              {current.messages.map((m) => {
                const mine = m.sender === 'staff'
                const day = dayLabel(m.created_at); const showDay = day !== lastDay; lastDay = day
                return (
                  <div key={m.id}>
                    {showDay && <div className="my-3 flex justify-center"><span className="rounded-full bg-slate-200/70 px-3 py-0.5 text-[10px] font-semibold text-slate-500">{day}</span></div>}
                    <div className={`flex ${mine ? 'justify-end' : 'justify-start'} mb-1`}>
                      <div className={`max-w-[82%] rounded-2xl px-3.5 py-2 text-sm shadow-soft sm:max-w-[70%] ${mine ? 'rounded-br-md bg-brand-500 text-white' : 'rounded-bl-md bg-white text-ink'}`}>
                        {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                        <Attachment m={m} mine={mine} />
                        <p className={`mt-1 text-right text-[10px] ${mine ? 'text-white/70' : 'text-muted'}`}>{timeOf(m.created_at)}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
              {current.messages.length === 0 && <div className="flex h-full flex-col items-center justify-center text-slate-400"><MessageSquare size={40} className="mb-2 opacity-40" /><p className="text-sm">No messages yet</p></div>}
              <div ref={endRef} />
            </div>

            {file && (
              <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-soft sm:mx-6">
                <FileText size={16} className="text-brand-600" /><span className="min-w-0 flex-1 truncate font-medium text-ink">{file.name}</span>
                <button onClick={() => setFile(null)} className="text-slate-400 hover:text-rose-500"><X size={15} /></button>
              </div>
            )}
            <div className="flex shrink-0 items-end gap-2 border-t border-slate-100 bg-white p-2.5 sm:p-3">
              <input ref={fileRef} type="file" hidden onChange={pickFile} />
              <button onClick={() => fileRef.current?.click()} title="Attach a document" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"><Paperclip size={19} /></button>
              <textarea ref={taRef} rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder="Type a message…" className="max-h-[140px] min-h-[40px] min-w-0 flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-white" />
              <button onClick={send} disabled={sending || (!text.trim() && !file)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500 text-white transition hover:bg-brand-600 disabled:opacity-50">{sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}</button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-slate-400"><MessageSquare size={44} className="mb-2 opacity-40" /><p className="text-sm">Select a conversation</p></div>
        )}
      </div>
    </div>
    <QuotationPreview open={!!preview} onClose={() => setPreview(null)} quotation={preview} />
    </>
  )
}
