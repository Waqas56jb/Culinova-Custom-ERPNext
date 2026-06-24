import { NavLink, Outlet } from 'react-router-dom'
import { Home, ClipboardList, AlertTriangle, CalendarClock, LogOut } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'
import NotificationBell from './NotificationBell.jsx'

const tabs = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/tasks', label: 'Tasks', icon: ClipboardList },
  { to: '/snags', label: 'Snags', icon: AlertTriangle },
  { to: '/visits', label: 'Visits', icon: CalendarClock },
]

export default function Shell() {
  const { user, logout } = useAuth()
  const initials = (user?.name || 'T').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="min-h-screen bg-slate-200/60">
      <div className="mx-auto flex h-screen max-w-[440px] flex-col bg-slate-50 sm:my-4 sm:h-[calc(100vh-2rem)] sm:rounded-[28px] sm:shadow-2xl sm:overflow-hidden">
        {/* app bar */}
        <header className="flex shrink-0 items-center gap-3 bg-gradient-to-r from-navy-900 to-brand-700 px-5 py-4 text-white">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 font-display text-base font-extrabold">C</div>
          <div className="leading-tight">
            <p className="text-[10px] uppercase tracking-[0.2em] text-brand-200/80">Culinova · Technician</p>
            <p className="font-display text-[15px] font-extrabold">{user?.name}</p>
          </div>
          <div className="ml-auto grid h-10 w-10 place-items-center rounded-full bg-white/15 text-sm font-bold">{initials}</div>
          <NotificationBell />
          <button onClick={logout} title="Log out" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white/80 hover:bg-white/20"><LogOut size={18} /></button>
        </header>

        {/* content */}
        <main className="flex-1 overflow-y-auto px-4 py-4"><Outlet /></main>

        {/* bottom nav */}
        <nav className="grid shrink-0 grid-cols-4 border-t border-slate-200 bg-white">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition ${isActive ? 'text-brand-600' : 'text-slate-400'}`}>
              {({ isActive }) => (<><span className={`grid h-9 w-9 place-items-center rounded-xl ${isActive ? 'bg-brand-50' : ''}`}><Icon size={20} /></span>{label}</>)}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
