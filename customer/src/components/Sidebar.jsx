import { NavLink } from 'react-router-dom'
import { LayoutDashboard, FolderKanban, FileText, Receipt, Wrench, X, Headphones, MessageSquare } from 'lucide-react'

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/projects', label: 'My Projects', icon: FolderKanban },
  { to: '/quotations', label: 'Quotations', icon: FileText },
  { to: '/invoices', label: 'Invoices & Payments', icon: Receipt },
  { to: '/service', label: 'Service Requests', icon: Wrench },
  { to: '/chat', label: 'Chat with Sales', icon: MessageSquare },
]

export default function Sidebar({ open, onClose }) {
  return (
    <>
      <div className={`fixed inset-0 z-30 bg-navy-900/50 backdrop-blur-sm lg:hidden transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`} onClick={onClose} />
      <aside className={`fixed z-40 inset-y-0 left-0 w-[268px] bg-gradient-to-b from-navy-900 via-navy-800 to-navy-900 flex flex-col transition-transform duration-300 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-3 px-5 h-[68px] border-b border-white/5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-gold-500 font-display text-lg font-extrabold text-navy-900 shadow-glow">C</div>
          <div className="leading-tight">
            <p className="font-display text-[15px] font-extrabold text-white tracking-wide">CULINOVA</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-brand-300/70">Customer Portal</p>
          </div>
          <button onClick={onClose} className="ml-auto text-slate-400 lg:hidden"><X size={20} /></button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={onClose} className={({ isActive }) => `nav-link group ${isActive ? 'nav-link-active' : 'hover:bg-white/5 hover:text-white'}`}>
              {({ isActive }) => (<><Icon size={18} className={isActive ? 'text-brand-300' : 'text-slate-400 group-hover:text-brand-300'} /><span className="flex-1">{label}</span></>)}
            </NavLink>
          ))}
        </nav>

        <div className="m-3 rounded-2xl bg-gradient-to-br from-brand-500/15 to-gold-500/10 border border-white/10 p-4">
          <div className="flex items-center gap-2 text-brand-300"><Headphones size={16} /><span className="text-xs font-semibold text-white">Need help?</span></div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300/80">Raise a service request or call your CULINOVA account manager.</p>
        </div>
      </aside>
    </>
  )
}
