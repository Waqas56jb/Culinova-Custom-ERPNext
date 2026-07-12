import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users2, Target, FileText, ClipboardList, Building2,
  FolderKanban, ShoppingCart, Boxes, Wallet, HardHat, Wrench,
  X, Sparkles, MessageSquare, Truck, Receipt, BarChart3, Coins, Ticket, CalendarClock, UserCheck, Lock, Package, Settings, ShieldCheck, Contact, Tags, ArrowLeftRight,
} from 'lucide-react'
import { useData } from '../store/DataContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

const sections = [
  { title: 'Sales & Estimation', panel: 'sales', items: [
    { to: '/sales/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/sales/leads', label: 'Leads', icon: Users2 },
    { to: '/sales/opportunities', label: 'Opportunities', icon: Target },
    { to: '/sales/quotations', label: 'Quotations / Estimation', icon: FileText },
    { to: '/sales/orders', label: 'Sales Orders', icon: ClipboardList },
    { to: '/sales/customers', label: 'Customers', icon: Contact },
    { to: '/sales/chat', label: 'Chat', icon: MessageSquare },
  ] },
  { title: 'Project Management', panel: 'projects', items: [
    { to: '/projects/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/projects/all', label: 'Projects', icon: FolderKanban },
    { to: '/projects/board', label: 'Task Board', icon: ClipboardList },
  ] },
  { title: 'Procurement', panel: 'procurement', items: [
    { to: '/procurement/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/procurement/requests', label: 'Material Requests', icon: FileText },
    { to: '/procurement/rfq', label: 'RFQs', icon: FileText },
    { to: '/procurement/po', label: 'Purchase Orders', icon: ShoppingCart },
    { to: '/procurement/suppliers', label: 'Suppliers', icon: Building2 },
    { to: '/procurement/supplier-master', label: 'Supplier Master', icon: Contact },
  ] },
  { title: 'Warehouse / Stock', panel: 'warehouse', items: [
    { to: '/stock/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/stock/items', label: 'Stock / Items', icon: Boxes },
    { to: '/stock/receipts', label: 'Goods Receipt', icon: Truck },
    { to: '/stock/delivery', label: 'Delivery Notes', icon: ClipboardList },
    { to: '/stock/warehouses', label: 'Warehouses', icon: Building2 },
    { to: '/stock/operations', label: 'Operations', icon: ArrowLeftRight },
    { to: '/stock/pricing', label: 'Pricing Engine', icon: Tags },
  ] },
  { title: 'Finance & Accounting', panel: 'finance', items: [
    { to: '/finance/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/finance/invoices', label: 'Sales Invoices', icon: Receipt },
    { to: '/finance/payments', label: 'Payments', icon: Coins },
    { to: '/finance/ledger', label: 'Receivables & Payables', icon: Wallet },
    { to: '/finance/reports', label: 'Financial Reports', icon: BarChart3 },
  ] },
  { title: 'Site Execution', panel: 'site', items: [
    { to: '/site/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/site/installations', label: 'Installations', icon: Wrench },
    { to: '/site/snags', label: 'Snag List', icon: ClipboardList },
    { to: '/site/commissioning', label: 'Testing & Commissioning', icon: HardHat },
  ] },
  { title: 'Service & Maintenance', panel: 'service', items: [
    { to: '/service/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/service/tickets', label: 'Service Tickets', icon: Ticket },
    { to: '/service/visits', label: 'Maintenance Visits', icon: CalendarClock },
  ] },
  { title: 'HR & Payroll', panel: 'hr', items: [
    { to: '/hr/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/hr/employees', label: 'Employees', icon: Users2 },
    { to: '/hr/attendance', label: 'Attendance & Leave', icon: UserCheck },
    { to: '/hr/payroll', label: 'Payroll', icon: Wallet },
  ] },
  { title: 'Administration', panel: 'admin', items: [
    { to: '/admin/panel', label: 'Users & Security', icon: ShieldCheck },
    { to: '/admin/settings', label: 'Company Settings', icon: Settings },
    { to: '/admin/documents', label: 'Documents', icon: FileText },
  ] },
]

export default function Sidebar({ open, onClose }) {
  const { chatMessages } = useData()
  const { canSee } = useAuth()
  const unread = chatMessages.filter((m) => m.sender === 'customer' && !m.read).length
  const visible = sections.filter((s) => canSee(s.panel))
  // Item Master is the shared product library — visible to EVERY user (Ali's spec).
  // Access is enforced inside the page/API: Sales & Engineering view selling price +
  // availability + datasheets only; cost/supplier/margin stay hidden; Warehouse/Admin edit.
  const showCatalog = true

  return (
    <>
      <div className={`fixed inset-0 z-30 bg-navy-900/50 backdrop-blur-sm lg:hidden transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`} onClick={onClose} />
      <aside className={`fixed z-40 inset-y-0 left-0 w-[268px] bg-gradient-to-b from-navy-900 via-navy-800 to-navy-900 flex flex-col transition-transform duration-300 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-3 px-5 h-[68px] border-b border-white/5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-gold-500 font-display text-lg font-extrabold text-navy-900 shadow-glow">C</div>
          <div className="leading-tight">
            <p className="font-display text-[15px] font-extrabold text-white tracking-wide">CULINOVA</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-brand-300/70">ERP Suite</p>
          </div>
          <button onClick={onClose} className="ml-auto text-slate-400 lg:hidden"><X size={20} /></button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-1">
          {showCatalog && (
            <div>
              <p className="section-title mb-2">Catalog</p>
              <NavLink to="/stock/item-master" onClick={onClose} className={({ isActive }) => `nav-link group ${isActive ? 'nav-link-active' : 'hover:bg-white/5 hover:text-white'}`}>
                {({ isActive }) => (<><Package size={18} className={isActive ? 'text-brand-300' : 'text-slate-400 group-hover:text-brand-300'} /><span className="flex-1">Item Master</span></>)}
              </NavLink>
            </div>
          )}
          {visible.map((sec) => (
            <div key={sec.title}>
              <p className="section-title mb-2 mt-6 first:mt-0">{sec.title}</p>
              {sec.items.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} onClick={onClose}
                  className={({ isActive }) => `nav-link group ${isActive ? 'nav-link-active' : 'hover:bg-white/5 hover:text-white'}`}>
                  {({ isActive }) => (
                    <>
                      <Icon size={18} className={isActive ? 'text-brand-300' : 'text-slate-400 group-hover:text-brand-300'} />
                      <span className="flex-1">{label}</span>
                      {to === '/sales/chat' && unread > 0 && (
                        <span className="rounded-full bg-brand-500/20 px-2 py-0.5 text-[11px] font-bold text-brand-300">{unread}</span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
          {visible.length === 0 && <p className="px-3 text-xs text-slate-500">No panels assigned to this role.</p>}
        </nav>

        <div className="m-3 rounded-2xl bg-gradient-to-br from-brand-500/15 to-gold-500/10 border border-white/10 p-4">
          <div className="flex items-center gap-2 text-brand-300"><Lock size={15} /><span className="text-xs font-semibold text-white">Role-based access</span></div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300/80">You only see the panels your role is permitted to access. Permissions are managed by the administrator.</p>
        </div>
      </aside>
    </>
  )
}
