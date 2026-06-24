import { useState, useEffect } from 'react'
import { X, Minus, Paperclip, Trash2, Send, FileText, Eye, Pencil, Loader2 } from 'lucide-react'
import { useData } from '../store/DataContext.jsx'
import QuotationPreview from './QuotationPreview.jsx'

export default function ComposeModal() {
  const { compose, closeCompose, sendEmail, saveDraft, openForm } = useData()
  const [v, setV] = useState({ to: '', subject: '', body: '', attachment: '', quotation: null })
  const [min, setMin] = useState(false)
  const [preview, setPreview] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (compose.open) {
      const p = compose.prefill || {}
      setV({ to: p.to || '', toName: p.toName || '', subject: p.subject || '', body: p.body || '', attachment: p.attachment || '', quotation: p.quotation || null })
      setMin(false)
    }
  }, [compose.open, compose.prefill])

  if (!compose.open) return null
  const on = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }))

  const send = async () => { setSending(true); await new Promise((r) => setTimeout(r, 600)); sendEmail(v); setSending(false); closeCompose() }
  const draft = () => { saveDraft(v); closeCompose() }
  const editQuote = () => { if (v.quotation) openForm('quotation', v.quotation) }

  return (
    <div className="fixed bottom-0 right-2 z-[70] w-full max-w-[540px] sm:right-6">
      <div className="overflow-hidden rounded-t-2xl border border-slate-300 bg-white shadow-2xl animate-fade-up">
        {/* header */}
        <div className="flex items-center justify-between bg-navy-900 px-4 py-2.5 text-white">
          <span className="text-sm font-semibold">New Message</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setMin((m) => !m)} className="rounded p-1 hover:bg-white/10"><Minus size={16} /></button>
            <button onClick={closeCompose} className="rounded p-1 hover:bg-white/10"><X size={16} /></button>
          </div>
        </div>

        {!min && (
          <>
            <div className="px-4">
              <div className="flex items-center gap-2 border-b border-slate-100 py-2.5">
                <span className="w-14 text-xs text-muted">To</span>
                <input value={v.to} onChange={on('to')} placeholder={v.toName ? `${v.toName} <email>` : 'recipient@email.com'}
                  className="flex-1 text-sm outline-none placeholder:text-slate-400" />
              </div>
              <div className="flex items-center gap-2 border-b border-slate-100 py-2.5">
                <span className="w-14 text-xs text-muted">Subject</span>
                <input value={v.subject} onChange={on('subject')} placeholder="Subject"
                  className="flex-1 text-sm font-medium outline-none placeholder:text-slate-400" />
              </div>
              <textarea value={v.body} onChange={on('body')} rows={11} placeholder="Write your message…"
                className="w-full resize-none py-3 text-sm leading-relaxed outline-none placeholder:text-slate-400" />
              {v.attachment && (
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                  <FileText size={15} className="text-brand-600" />
                  <span className="font-medium text-ink">{v.attachment}</span>
                  <span className="text-muted">· PDF</span>
                  <div className="ml-auto flex items-center gap-0.5">
                    <button onClick={() => setPreview(true)} title="Preview" className="rounded p-1.5 text-slate-400 hover:bg-white hover:text-brand-600"><Eye size={15} /></button>
                    <button onClick={editQuote} title="Edit quotation" className="rounded p-1.5 text-slate-400 hover:bg-white hover:text-blue-600"><Pencil size={15} /></button>
                    <button onClick={() => setV((s) => ({ ...s, attachment: '' }))} title="Remove from email" className="rounded p-1.5 text-slate-400 hover:bg-white hover:text-ink"><X size={15} /></button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3">
              <button onClick={send} disabled={sending} className="btn-primary !px-5 disabled:opacity-70">{sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} {sending ? 'Sending…' : 'Send'}</button>
              <button onClick={draft} className="btn-ghost">Save Draft</button>
              <button className="ml-1 rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Attach"><Paperclip size={17} /></button>
              <button onClick={closeCompose} className="ml-auto rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-500" title="Discard"><Trash2 size={17} /></button>
            </div>
          </>
        )}
      </div>

      <QuotationPreview open={preview} onClose={() => setPreview(false)} quotation={v.quotation} />
    </div>
  )
}
