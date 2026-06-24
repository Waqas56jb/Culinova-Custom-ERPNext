import { TrendingUp, TrendingDown } from 'lucide-react'

const accentMap = {
  brand: 'from-brand-500 to-brand-600',
  violet: 'from-violet-500 to-indigo-600',
  gold: 'from-gold-500 to-gold-600',
  emerald: 'from-emerald-500 to-teal-600',
  rose: 'from-rose-500 to-rose-600',
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between animate-fade-up">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-ink tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}

export function KpiCard({ label, value, delta, sub, icon: Icon, accent = 'brand' }) {
  const up = (delta ?? 0) >= 0
  return (
    <div className="card card-pad relative overflow-hidden animate-fade-up">
      <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${accentMap[accent]} opacity-[0.08]`} />
      <div className="flex items-start justify-between">
        <div className={`grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br ${accentMap[accent]} text-white shadow-soft`}>{Icon && <Icon size={20} />}</div>
        {delta !== undefined && <span className={`chip ${up ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{up ? '+' : ''}{delta}%</span>}
      </div>
      <p className="mt-4 text-3xl font-extrabold tracking-tight text-ink">{value}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-500">{label}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  )
}

export function ChartCard({ title, subtitle, action, children, className = '' }) {
  return (
    <div className={`card card-pad animate-fade-up ${className}`}>
      <div className="mb-4 flex items-center justify-between">
        <div><h3 className="text-[15px] font-bold text-ink">{title}</h3>{subtitle && <p className="text-xs text-muted">{subtitle}</p>}</div>
        {action}
      </div>
      {children}
    </div>
  )
}

const tones = {
  green: 'bg-emerald-50 text-emerald-700', blue: 'bg-blue-50 text-blue-700', amber: 'bg-amber-50 text-amber-700',
  red: 'bg-rose-50 text-rose-700', gray: 'bg-slate-100 text-slate-600', violet: 'bg-violet-50 text-violet-700',
}
export function Badge({ tone = 'gray', children }) { return <span className={`chip ${tones[tone]}`}>{children}</span> }

export function statusTone(s) {
  const map = {
    'On Track': 'green', 'At Risk': 'amber', Delayed: 'red', Completed: 'blue',
    Installed: 'green', Delivered: 'amber', 'In Progress': 'blue', Waiting: 'gray', Assigned: 'violet',
    Open: 'blue', Accepted: 'green', Declined: 'red', Expired: 'gray',
    Paid: 'green', 'Partly Paid': 'amber', Unpaid: 'gray', Overdue: 'red',
    Active: 'green', Resolved: 'green', High: 'red', Medium: 'amber', Low: 'gray',
  }
  return map[s] || 'gray'
}

export const sar = (n) => 'SAR ' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
