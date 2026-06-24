import { Menu, Search, ShieldCheck, LogOut } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'
import NotificationBell from './NotificationBell.jsx'

export default function Topbar({ onMenu }) {
  const { user, logout } = useAuth()
  const initials = (user?.name || 'AD').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
  return (
    <header className="sticky top-0 z-20 flex h-[68px] items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur-md lg:px-7">
      <button onClick={onMenu} className="text-slate-500 lg:hidden"><Menu size={22} /></button>
      <div className="relative hidden flex-1 max-w-md sm:block">
        <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input placeholder="Search users, projects, modules…" className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-500/15" />
      </div>
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <span className="hidden items-center gap-1.5 rounded-full bg-gold-50 px-3 py-1.5 text-xs font-semibold text-gold-600 sm:inline-flex"><ShieldCheck size={13} /> Full Admin</span>
        <NotificationBell />
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white py-1.5 pl-1.5 pr-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-navy-800 to-gold-600 text-xs font-bold text-white">{initials}</div>
          <div className="hidden text-left leading-tight sm:block"><p className="text-[13px] font-semibold text-ink">{user?.name}</p><p className="text-[11px] text-muted">{user?.designation || 'Administrator'}</p></div>
        </div>
        <button onClick={logout} title="Log out" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"><LogOut size={18} /></button>
      </div>
    </header>
  )
}
