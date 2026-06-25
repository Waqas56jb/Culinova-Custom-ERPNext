import { useEffect, useRef, useState } from 'react'
import { Bell, FileText, Check, X as XIcon, Loader2 } from 'lucide-react'
import { api } from '../api.js'
import QuotationDoc from './QuotationDoc.jsx'

const timeAgo = (iso) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [busy, setBusy] = useState(null)
  const [pdf, setPdf] = useState(null)
  const ref = useRef(null)

  const load = async () => { try { const r = await api('/notifications'); setItems(r.items || []); setUnread(r.unread || 0) } catch { /* not authed */ } }
  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id) }, [])
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  const markAll = async () => { try { await api('/notifications/read-all', { method: 'POST' }); setItems((p) => p.map((n) => ({ ...n, read: true }))); setUnread(0) } catch {} }
  const markOne = async (n) => { if (n.read) return; try { await api(`/notifications/${n.id}/read`, { method: 'POST' }); setItems((p) => p.map((x) => (x.id === n.id ? { ...x, read: true } : x))); setUnread((u) => Math.max(0, u - 1)) } catch {} }
  const viewPdf = async (n) => { try { const q = await api(`/notifications/${n.id}/quotation`); setPdf(q) } catch (e) { alert(e.message) } }
  const act = async (n, decision) => {
    setBusy(n.id)
    try { await api(`/notifications/${n.id}/act`, { method: 'POST', body: { decision } }); await load() }
    catch (e) { alert(e.message) } finally { setBusy(null) }
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:text-ink">
        <Bell size={18} />
        {unread > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-[20px] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white animate-pulse">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:w-[400px]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-ink">Notifications {unread > 0 && <span className="ml-1 rounded-full bg-rose-100 px-1.5 text-[11px] font-bold text-rose-600">{unread}</span>}</p>
            {unread > 0 && <button onClick={markAll} className="text-xs font-semibold text-brand-600 hover:underline">Mark all read</button>}
          </div>
          <div className="max-h-[64vh] overflow-y-auto">
            {items.length === 0 && <div className="px-4 py-12 text-center text-sm text-slate-400">You're all caught up 🎉</div>}
            {items.map((n) => {
              const isApproval = n.type === 'approval'
              const pending = isApproval && n.action_status === 'pending'
              return (
                <div key={n.id} className={`border-b border-slate-50 px-4 py-3 ${n.read ? '' : 'bg-brand-50/40'}`}>
                  <div className={`flex gap-3 ${isApproval ? '' : 'cursor-pointer'}`} onClick={() => !isApproval && markOne(n)}>
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-brand-500'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">{n.title || 'Announcement'}</p>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] text-slate-600">{n.body}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{n.sender ? `${n.sender} · ` : ''}{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                  {pending && (
                    <div className="mt-2.5 flex flex-wrap gap-2 pl-5">
                      <button onClick={() => viewPdf(n)} className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 px-2.5 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50"><FileText size={13} /> View PDF</button>
                      <button onClick={() => act(n, 'approved')} disabled={busy === n.id} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-60">{busy === n.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Approve</button>
                      <button onClick={() => act(n, 'rejected')} disabled={busy === n.id} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-600 disabled:opacity-60"><XIcon size={13} /> Reject</button>
                    </div>
                  )}
                  {isApproval && n.action_status && n.action_status !== 'pending' && (
                    <div className="mt-1.5 pl-5">
                      <span className={`chip ${n.action_status === 'approved' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{n.action_status === 'approved' ? '✓ Approved' : '✕ Rejected'}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
      <QuotationDoc open={!!pdf} onClose={() => setPdf(null)} q={pdf} />
    </div>
  )
}
