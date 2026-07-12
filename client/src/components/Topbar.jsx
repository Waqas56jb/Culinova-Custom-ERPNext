import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Menu, Search, LogOut, Loader2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'
import { useData } from '../store/DataContext.jsx'
import NotificationBell from './NotificationBell.jsx'

const TYPE_TONE = {
  Item: 'bg-brand-50 text-brand-600', Customer: 'bg-blue-50 text-blue-600', Supplier: 'bg-amber-50 text-amber-600',
  Quotation: 'bg-violet-50 text-violet-600', 'Sales Order': 'bg-emerald-50 text-emerald-600',
  Project: 'bg-indigo-50 text-indigo-600', 'Purchase Order': 'bg-teal-50 text-teal-600', Lead: 'bg-slate-100 text-slate-600',
}

export default function Topbar({ onMenu }) {
  const { user, logout } = useAuth()
  const d = useData()
  const navigate = useNavigate()
  const initials = (user?.name || 'U').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()

  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)

  // debounced global search
  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return }
    setLoading(true)
    const t = setTimeout(async () => {
      try { const r = await d.globalSearch(q); setResults(r.results || []) } catch { setResults([]) } finally { setLoading(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [q, d])

  // close on outside click
  useEffect(() => {
    const onClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const go = (res) => { setOpen(false); setQ(''); setResults(null); navigate(res.route) }

  return (
    <header className="sticky top-0 z-20 flex h-[68px] items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur-md lg:px-7">
      <button onClick={onMenu} className="text-slate-500 lg:hidden"><Menu size={22} /></button>

      <div ref={boxRef} className="relative hidden flex-1 max-w-md sm:block">
        {loading ? <Loader2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-brand-400" />
          : <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />}
        <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
          placeholder="Search items, customers, quotations, projects…"
          className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-500/15" />

        {open && q.trim().length >= 2 && (
          <div className="absolute left-0 right-0 top-full mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
            {loading && !results && <div className="px-3 py-4 text-center text-sm text-muted">Searching…</div>}
            {results && results.length === 0 && <div className="px-3 py-4 text-center text-sm text-muted">No matches for “{q}”.</div>}
            {results && results.map((res) => (
              <button key={res.type + res.id} onMouseDown={() => go(res)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition hover:bg-slate-100">
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${TYPE_TONE[res.type] || 'bg-slate-100 text-slate-600'}`}>{res.type}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{res.label}</span>
                  {res.sub && <span className="block truncate text-[11px] text-muted">{res.sub}</span>}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <NotificationBell />

        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white py-1.5 pl-1.5 pr-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-navy-800 to-brand-600 text-xs font-bold text-white">{initials}</div>
          <div className="hidden text-left leading-tight sm:block">
            <p className="text-[13px] font-semibold text-ink">{user?.name}</p>
            <p className="text-[11px] text-muted">{user?.designation || user?.role}</p>
          </div>
        </div>

        <button onClick={logout} title="Log out" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  )
}
