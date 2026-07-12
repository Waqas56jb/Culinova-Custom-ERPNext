import { useState, useEffect } from 'react'
import { LayoutGrid, Check, Settings2, Package, FileText, ClipboardList, FolderKanban, Users2, Building2, ShoppingCart, Boxes, Target } from 'lucide-react'
import { PageHeader, Badge } from '../components/ui.jsx'
import { Modal } from '../components/Modal.jsx'
import { useData } from '../store/DataContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

// Configurable widgets framework: the user picks which KPI widgets to show; the choice is
// persisted to their user preferences (server-side). Widget values come from live store data.
// each widget declares the panel its data comes from — widgets for panels the user cannot access
// are hidden (otherwise a warehouse user would see "0 Quotations", which is misleading, not real).
const CATALOG = [
  { key: 'items', label: 'Items', panel: null, icon: Package, accent: 'from-brand-500 to-brand-600', get: (d) => (d.items || []).length },
  { key: 'warehouses', label: 'Warehouses', panel: 'warehouse', icon: Boxes, accent: 'from-rose-500 to-rose-600', get: (d) => (d.warehouses || []).length },
  { key: 'stock', label: 'Stock Balances', panel: 'warehouse', icon: Boxes, accent: 'from-emerald-500 to-teal-600', get: (d) => (d.stockItems || []).length },
  { key: 'quotations', label: 'Quotations', panel: 'sales', icon: FileText, accent: 'from-violet-500 to-indigo-600', get: (d) => (d.quotations || []).length },
  { key: 'orders', label: 'Sales Orders', panel: 'sales', icon: ClipboardList, accent: 'from-emerald-500 to-teal-600', get: (d) => (d.salesOrders || []).length },
  { key: 'customers', label: 'Customers', panel: 'sales', icon: Users2, accent: 'from-gold-500 to-gold-600', get: (d) => (d.customers || []).length },
  { key: 'leads', label: 'Leads', panel: 'sales', icon: Target, accent: 'from-indigo-500 to-violet-600', get: (d) => (d.leads || []).length },
  { key: 'opportunities', label: 'Opportunities', panel: 'sales', icon: Target, accent: 'from-teal-500 to-emerald-600', get: (d) => (d.opportunities || []).length },
  { key: 'projects', label: 'Projects', panel: 'projects', icon: FolderKanban, accent: 'from-blue-500 to-blue-600', get: (d) => (d.projects || []).length },
  { key: 'suppliers', label: 'Suppliers', panel: 'procurement', icon: Building2, accent: 'from-amber-500 to-gold-600', get: (d) => (d.suppliers || []).length },
  { key: 'pos', label: 'Purchase Orders', panel: 'procurement', icon: ShoppingCart, accent: 'from-cyan-500 to-teal-600', get: (d) => (d.purchaseOrders || []).length },
]

export default function MyDashboard() {
  const d = useData()
  const { canSee } = useAuth()
  // only widgets whose panel this role can actually access (their data is loaded)
  const allowed = CATALOG.filter((w) => !w.panel || canSee(w.panel))
  const DEFAULT = allowed.slice(0, 6).map((w) => w.key)
  const [visible, setVisible] = useState(DEFAULT)
  const [customize, setCustomize] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // load saved widget selection
  useEffect(() => {
    d.getPrefs().then((p) => { const w = p?.dashboard_widgets; if (Array.isArray(w) && w.length) setVisible(w); setLoaded(true) }).catch(() => setLoaded(true))
  }, [d])

  const toggle = (key) => setVisible((v) => (v.includes(key) ? v.filter((k) => k !== key) : [...v, key]))
  const save = async () => { try { await d.savePref('dashboard_widgets', visible) } catch { /* ignore */ } setCustomize(false) }

  // saved prefs may contain widgets from a panel the role lost access to — intersect with allowed
  const widgets = allowed.filter((w) => visible.includes(w.key))

  return (
    <>
      <PageHeader title="My Dashboard" subtitle="Your personalised widgets — saved to your profile">
        <button className="btn-ghost" onClick={() => setCustomize(true)}><Settings2 size={16} /> Customize</button>
      </PageHeader>

      {!loaded ? <div className="py-16 text-center text-sm text-muted">Loading…</div> : widgets.length === 0 ? (
        <div className="card card-pad text-center text-sm text-muted"><LayoutGrid className="mx-auto mb-2 text-slate-300" /> No widgets selected. Click <b>Customize</b> to add some.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {widgets.map((w) => {
            const Icon = w.icon
            return (
              <div key={w.key} className="card card-pad relative overflow-hidden animate-fade-up">
                <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${w.accent} opacity-[0.08]`} />
                <div className={`grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br ${w.accent} text-white shadow-soft`}><Icon size={20} /></div>
                <p className="mt-4 text-3xl font-extrabold tracking-tight text-ink">{w.get(d)}</p>
                <p className="mt-0.5 text-sm font-medium text-slate-500">{w.label}</p>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={customize} onClose={() => setCustomize(false)} title="Customize Widgets" subtitle="Pick the widgets you want on your dashboard"
        footer={<><button className="btn-ghost" onClick={() => setCustomize(false)}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></>}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {allowed.map((w) => {
            const on = visible.includes(w.key)
            return (
              <button key={w.key} onClick={() => toggle(w.key)} className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition ${on ? 'border-brand-400 bg-brand-50/50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <span className="flex items-center gap-2"><w.icon size={16} className="text-slate-400" /> {w.label}</span>
                {on ? <Check size={16} className="text-brand-600" /> : <Badge tone="gray">off</Badge>}
              </button>
            )
          })}
        </div>
      </Modal>
    </>
  )
}
