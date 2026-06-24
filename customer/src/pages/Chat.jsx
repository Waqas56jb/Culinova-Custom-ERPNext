import { useState, useEffect, useRef } from 'react'
import { Send, Loader2, MessageSquare, FileText, Paperclip, X, Download } from 'lucide-react'
import { useCustomer } from '../store/CustomerContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import QuotationDoc from '../components/QuotationDoc.jsx'

const fileToDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file) })
const isImg = (name = '', type = '') => /^image\//.test(type) || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name)
const timeOf = (s) => (s ? new Date(s).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '')
const dayLabel = (s) => {
  if (!s) return ''
  const d = new Date(s), t = new Date(), same = (a, b) => a.toDateString() === b.toDateString()
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
  const { messages, sendMessage, loadMessages, quotations } = useCustomer()
  const { user } = useAuth()
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [sending, setSending] = useState(false)
  const [doc, setDoc] = useState(null)
  const endRef = useRef(null); const fileRef = useRef(null); const taRef = useRef(null)
  const quoteFor = (body) => { const ref = (String(body).match(/QTN-\d{4}-\d+/) || [])[0]; return ref ? quotations.find((q) => q.ref === ref) : null }

  useEffect(() => { const t = setInterval(loadMessages, 8000); return () => clearInterval(t) }, [loadMessages])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [messages.length])
  useEffect(() => { const ta = taRef.current; if (ta) { ta.style.height = '0px'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px' } }, [text])

  const pickFile = async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; if (f.size > 10 * 1024 * 1024) return alert('File too large (max 10MB)'); setFile({ name: f.name, type: f.type, dataUrl: await fileToDataUrl(f) }) }
  const send = async () => {
    if (!text.trim() && !file) return
    const body = text.trim(), att = file; setText(''); setFile(null); setSending(true)
    try { await sendMessage(body, att) } catch (e) { alert(e.message) } finally { setSending(false) }
  }

  let lastDay = null

  return (
    <div className="flex h-[calc(100vh-128px)] min-h-[460px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/40 shadow-card">
      {/* header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 bg-white px-4 py-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-navy-700 to-brand-600 text-sm font-bold text-white">C</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">CULINOVA Sales Team</p>
          <p className="truncate text-[11px] text-emerald-600">● Online · typically replies within a few hours</p>
        </div>
      </div>

      {/* messages */}
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4 sm:px-6">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-slate-400"><MessageSquare size={44} className="mb-2 opacity-40" /><p className="text-sm">Start the conversation — say hello 👋</p></div>
        )}
        {messages.map((m) => {
          const mine = m.sender === 'customer'
          const day = dayLabel(m.created_at); const showDay = day !== lastDay; lastDay = day
          const quote = m.sender === 'staff' ? quoteFor(m.body) : null
          return (
            <div key={m.id}>
              {showDay && <div className="my-3 flex justify-center"><span className="rounded-full bg-slate-200/70 px-3 py-0.5 text-[10px] font-semibold text-slate-500">{day}</span></div>}
              <div className={`flex ${mine ? 'justify-end' : 'justify-start'} mb-1`}>
                <div className={`max-w-[82%] rounded-2xl px-3.5 py-2 text-sm shadow-soft sm:max-w-[70%] ${mine ? 'rounded-br-md bg-brand-500 text-white' : 'rounded-bl-md bg-white text-ink'}`}>
                  {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                  <Attachment m={m} mine={mine} />
                  {quote && (
                    <button onClick={() => setDoc(quote)} className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"><FileText size={13} /> View Quotation PDF</button>
                  )}
                  <p className={`mt-1 text-right text-[10px] ${mine ? 'text-white/70' : 'text-muted'}`}>{mine ? 'You' : (m.staff_name || 'Sales')} · {timeOf(m.created_at)}</p>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {/* composer */}
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
          placeholder="Type your message…" className="max-h-[140px] min-h-[40px] min-w-0 flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-white" />
        <button onClick={send} disabled={sending || (!text.trim() && !file)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500 text-white transition hover:bg-brand-600 disabled:opacity-50">{sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}</button>
      </div>

      <QuotationDoc open={!!doc} onClose={() => setDoc(null)} quotation={doc} />
    </div>
  )
}
