import { Menu, Bell, LogOut } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'

export default function Topbar({ onMenu }) {
  const { user, logout } = useAuth()
  const initials = (user?.name || 'C').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
  return (
    <header className="sticky top-0 z-20 flex h-[68px] items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur-md lg:px-7">
      <button onClick={onMenu} className="text-slate-500 lg:hidden"><Menu size={22} /></button>
      <p className="hidden text-sm text-muted sm:block">Welcome back, <span className="font-semibold text-ink">{user?.name}</span> 👋</p>
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <button className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-ink"><Bell size={18} /><span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-gold-500 ring-2 ring-white" /></button>
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white py-1.5 pl-1.5 pr-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-navy-800 to-brand-600 text-xs font-bold text-white">{initials}</div>
          <div className="hidden text-left leading-tight sm:block"><p className="text-[13px] font-semibold text-ink">{user?.name}</p><p className="text-[11px] text-muted">Customer</p></div>
        </div>
        <button onClick={logout} title="Log out" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"><LogOut size={18} /></button>
      </div>
    </header>
  )
}
