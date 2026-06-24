import { useNavigate } from 'react-router-dom'
import { Activity, Wallet, Wrench, ShieldCheck, ArrowRight } from 'lucide-react'
import { PageHeader, KpiCard, ChartCard, Badge, statusTone, sar } from '../components/ui.jsx'
import { useCustomer } from '../store/CustomerContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { projects, invoices, tickets, quotations } = useCustomer()
  const p = projects[0]
  const warranty = p && p.status === 'Completed' ? { status: 'Active', end: p.end } : { status: '—', end: '—' }
  const outstanding = invoices.reduce((s, i) => s + (i.total - i.paid), 0)
  const openReq = tickets.filter((t) => t.status !== 'Resolved').length

  return (
    <>
      {/* welcome banner */}
      <div className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-r from-navy-900 to-brand-700 p-6 text-white shadow-card animate-fade-up">
        <h1 className="font-display text-2xl font-extrabold">Welcome, {user?.name}</h1>
        <p className="mt-1 text-sm text-brand-200/90">Track your projects, quotations, invoices and service requests — all in one place.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Project Progress" value={`${p?.progress || 0}%`} sub={p?.name} icon={Activity} accent="brand" />
        <KpiCard label="Outstanding Balance" value={sar(outstanding)} sub="amount due" icon={Wallet} accent="gold" />
        <KpiCard label="Open Requests" value={openReq} sub="service tickets" icon={Wrench} accent="violet" />
        <KpiCard label="Warranty" value={warranty.status} delta={undefined} sub={`till ${warranty.end}`} icon={ShieldCheck} accent="emerald" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title="My Project" subtitle={p?.id} className="xl:col-span-2" action={<button onClick={() => navigate('/projects')} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600">Details <ArrowRight size={12} /></button>}>
          <div className="mb-3 flex items-center justify-between">
            <div><p className="text-base font-bold text-ink">{p?.name}</p><p className="text-xs text-muted">{p?.start} → {p?.end}</p></div>
            <Badge tone={statusTone(p?.status)}>{p?.status}</Badge>
          </div>
          <div className="mb-1 flex justify-between text-xs"><span className="font-semibold text-ink">{p?.progress}% complete</span></div>
          <div className="h-2.5 w-full rounded-full bg-slate-100"><div className="h-2.5 rounded-full bg-brand-500" style={{ width: `${p?.progress}%` }} /></div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {p?.items.map((it) => (
              <div key={it.item} className="rounded-xl border border-slate-100 p-2.5">
                <p className="truncate text-xs font-medium text-ink">{it.item}</p>
                <div className="mt-1"><Badge tone={statusTone(it.status)}>{it.status}</Badge></div>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Quotations & Invoices">
          <div className="space-y-2">
            {quotations.slice(0, 2).map((q) => (
              <div key={q.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-2.5">
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{q.id}</p><p className="text-xs text-muted">{sar(q.amount)}</p></div>
                <Badge tone={statusTone(q.status)}>{q.status}</Badge>
              </div>
            ))}
            {invoices.map((i) => (
              <div key={i.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-2.5">
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{i.id}</p><p className="text-xs text-muted">Balance {sar(i.total - i.paid)}</p></div>
                <Badge tone={statusTone(i.status)}>{i.status}</Badge>
              </div>
            ))}
          </div>
          <button onClick={() => navigate('/invoices')} className="btn-ghost mt-3 w-full">View Invoices</button>
        </ChartCard>
      </div>
    </>
  )
}
