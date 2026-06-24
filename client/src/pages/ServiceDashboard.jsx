import { useNavigate } from 'react-router-dom'
import { ShieldCheck, Ticket, CalendarClock, AlertTriangle } from 'lucide-react'
import { PageHeader, KpiCard, ChartCard, Badge, statusTone } from '../components/ui.jsx'
import { useData } from '../store/DataContext.jsx'

export default function ServiceDashboard() {
  const navigate = useNavigate()
  const { tickets, visits, contracts } = useData()
  const open = tickets.filter((t) => t.status !== 'Resolved')
  const scheduled = visits.filter((v) => v.status === 'Scheduled')
  const breaches = tickets.filter((t) => t.sla === 'Resolution Due')

  return (
    <>
      <PageHeader title="Service & Maintenance Dashboard" subtitle="Warranty, service tickets & maintenance visits" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Active Contracts" value={contracts.length} sub="AMC warranties" icon={ShieldCheck} accent="brand" />
        <KpiCard label="Open Tickets" value={open.length} sub="to resolve" icon={Ticket} accent="gold" />
        <KpiCard label="Scheduled Visits" value={scheduled.length} sub="upcoming" icon={CalendarClock} accent="violet" />
        <KpiCard label="SLA Breaches" value={breaches.length} sub="overdue" icon={AlertTriangle} accent="emerald" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Open Service Tickets" action={<button onClick={() => navigate('/service/tickets')} className="text-xs font-semibold text-brand-600">View all</button>}>
          <div className="divide-y divide-slate-100">
            {open.map((t) => (
              <div key={t.id} className="flex items-center gap-3 py-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-50 text-amber-600"><Ticket size={16} /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{t.subject}</p><p className="text-xs text-muted">{t.customer} · {t.id}</p></div>
                <Badge tone={statusTone(t.priority)}>{t.priority}</Badge>
                <Badge tone={statusTone(t.sla)}>{t.sla}</Badge>
              </div>
            ))}
            {open.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No open tickets</p>}
          </div>
        </ChartCard>

        <ChartCard title="Upcoming Visits" action={<button onClick={() => navigate('/service/visits')} className="text-xs font-semibold text-brand-600">View all</button>}>
          <div className="divide-y divide-slate-100">
            {scheduled.map((v) => (
              <div key={v.id} className="flex items-center gap-3 py-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-violet-50 text-violet-600"><CalendarClock size={16} /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{v.type} visit · {v.customer}</p><p className="text-xs text-muted">{v.date} · {v.technician}</p></div>
                <Badge tone={statusTone(v.status)}>{v.status}</Badge>
              </div>
            ))}
            {scheduled.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No upcoming visits</p>}
          </div>
        </ChartCard>
      </div>
    </>
  )
}
