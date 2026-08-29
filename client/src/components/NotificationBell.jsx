import { useEffect, useRef, useState } from 'react'
import { Bell, Check, X as XIcon, Loader2 } from 'lucide-react'
import { api } from '../api.js'

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
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(null)
  const [rejectId, setRejectId] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const ref = useRef(null)

  const load = async () => {
    try { const r = await api('/notifications'); setItems(r.items || []); setUnread(r.unread || 0); setErr('') }
    catch (e) { setErr(e?.message || 'Could not refresh notifications') }
  }
  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id) }, [])
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  const markAll = async () => {
    try {
      await api('/notifications/read-all', { method: 'POST' })
      setItems((p) => p.map((n) => ({ ...n, read: true }))); setUnread(0); setErr('')
      load()
    } catch (e) { setErr(e?.message || 'Could not mark as read') }
  }
  const markOne = async (n) => {
    if (n.read) return
    try {
      await api(`/notifications/${n.id}/read`, { method: 'POST' })
      setItems((p) => p.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
      setUnread((u) => Math.max(0, u - 1)); setErr('')
      load()
    } catch (e) { setErr(e?.message || 'Could not mark as read') }
  }

  const actVr = async (n, decision) => {
    setBusy(n.id)
    try {
      const body = { decision }
      if (decision === 'rejected') {
        const reason = rejectReason.trim()
        if (!reason) { alert('Reject reason is required'); setBusy(null); return }
        body.reason = reason
      }
      await api(`/notifications/${n.id}/act`, { method: 'POST', body })
      setRejectId(null)
      setRejectReason('')
      await load()
    } catch (e) { alert(e.message) } finally { setBusy(null) }
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:text-ink">
        <Bell size={18} />
        {unread > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-[20px] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white animate-pulse">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[340px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:w-96">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-ink">Notifications {unread > 0 && <span className="ml-1 rounded-full bg-rose-100 px-1.5 text-[11px] font-bold text-rose-600">{unread}</span>}</p>
            {unread > 0 && <button onClick={markAll} className="text-xs font-semibold text-brand-600 hover:underline">Mark all read</button>}
          </div>
          {err && <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-[12px] text-amber-800">{err}</div>}
          <div className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 && <div className="px-4 py-12 text-center text-sm text-slate-400">You're all caught up 🎉</div>}
            {items.map((n) => {
              const isVr = n.type === 'vr_change' && n.action_status === 'pending'
              const isCredit = n.type === 'credit_override' && n.action_status === 'pending'
              const isApproval = n.type === 'approval' && n.action_status === 'pending'
              const actionable = isVr || isCredit || isApproval
              return (
                <div key={n.id} className={`border-b border-slate-50 px-4 py-3 ${n.read ? '' : 'bg-brand-50/40'}`}>
                  <button type="button" onClick={() => !actionable && markOne(n)} className="flex w-full gap-3 text-left">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-brand-500'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{n.title || 'Announcement'}</p>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] text-slate-600">{n.body}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{n.sender ? `${n.sender} · ` : ''}{timeAgo(n.created_at)}</p>
                    </div>
                  </button>
                  {actionable && (
                    <div className="mt-2.5 flex flex-wrap gap-2 pl-5">
                      <button type="button" onClick={() => actVr(n, 'approved')} disabled={busy === n.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-60">
                        {busy === n.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Approve
                      </button>
                      {isVr && rejectId === n.id ? (
                        <span className="flex items-center gap-1">
                          <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason" className="w-24 rounded border px-1.5 py-1 text-xs" />
                          <button type="button" onClick={() => actVr(n, 'rejected')} className="rounded bg-rose-500 px-2 py-1 text-xs font-semibold text-white">OK</button>
                          <button type="button" onClick={() => setRejectId(null)} className="text-xs text-slate-400">×</button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => {
                          if (isVr) { setRejectId(n.id); setRejectReason('') }
                          else actVr(n, 'rejected')
                        }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-600">
                          <XIcon size={13} /> Reject
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
