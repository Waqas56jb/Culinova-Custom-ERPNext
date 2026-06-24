import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { api } from '../api.js'

const timeAgo = (iso) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

// Dark-header variant for the technician mobile shell.
export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const ref = useRef(null)

  const load = async () => { try { const r = await api('/notifications'); setItems(r.items || []); setUnread(r.unread || 0) } catch { /* not authed */ } }
  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id) }, [])
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  const markAll = async () => { try { await api('/notifications/read-all', { method: 'POST' }); setItems((p) => p.map((n) => ({ ...n, read: true }))); setUnread(0) } catch {} }
  const markOne = async (n) => { if (n.read) return; try { await api(`/notifications/${n.id}/read`, { method: 'POST' }); setItems((p) => p.map((x) => (x.id === n.id ? { ...x, read: true } : x))); setUnread((u) => Math.max(0, u - 1)) } catch {} }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white/80 hover:bg-white/20">
        <Bell size={18} />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-[20px] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-navy-900">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[290px] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-ink">Notifications {unread > 0 && <span className="ml-1 rounded-full bg-rose-100 px-1.5 text-[11px] font-bold text-rose-600">{unread}</span>}</p>
            {unread > 0 && <button onClick={markAll} className="text-xs font-semibold text-brand-600 hover:underline">Mark all read</button>}
          </div>
          <div className="max-h-[55vh] overflow-y-auto">
            {items.length === 0 && <div className="px-4 py-10 text-center text-sm text-slate-400">You're all caught up 🎉</div>}
            {items.map((n) => (
              <button key={n.id} onClick={() => markOne(n)} className={`flex w-full gap-3 border-b border-slate-50 px-4 py-3 text-left transition hover:bg-slate-50 ${n.read ? '' : 'bg-brand-50/40'}`}>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-brand-500'}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{n.title || 'Announcement'}</p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] text-slate-600">{n.body}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{n.sender ? `${n.sender} · ` : ''}{timeAgo(n.created_at)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
