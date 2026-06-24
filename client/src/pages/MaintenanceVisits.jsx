import { CheckCircle2, ShieldCheck, FolderKanban } from 'lucide-react'
import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import { useData } from '../store/DataContext.jsx'

export default function MaintenanceVisits() {
  const { visits, contracts, completeVisit } = useData()

  return (
    <>
      <PageHeader title="Maintenance Visits & Contracts" subtitle="Preventive & corrective service visits under warranty" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* contracts */}
        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 p-4"><h3 className="font-bold text-ink">Active Contracts (AMC)</h3></div>
          <div className="divide-y divide-slate-100">
            {contracts.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><ShieldCheck size={16} /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{c.customer}</p><p className="text-xs text-muted">{c.id} · till {c.end}</p></div>
                <Badge tone={statusTone(c.status)}>{c.status}</Badge>
              </div>
            ))}
          </div>
        </div>

        {/* visits */}
        <div className="card overflow-hidden lg:col-span-2">
          <div className="border-b border-slate-100 p-4"><h3 className="font-bold text-ink">Scheduled & Completed Visits</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead><tr className="bg-slate-50/60">
                <th className="th">Visit</th><th className="th">Customer</th><th className="th">Type</th><th className="th">Date</th>
                <th className="th">Technician</th><th className="th">Status</th><th className="th text-right">Action</th>
              </tr></thead>
              <tbody>
                {visits.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50/60">
                    <td className="td font-semibold text-brand-600">{v.id}</td>
                    <td className="td font-medium text-ink">{v.customer}</td>
                    <td className="td text-slate-600">{v.type}</td>
                    <td className="td text-slate-500">{v.date}</td>
                    <td className="td text-slate-500">{v.technician}</td>
                    <td className="td"><Badge tone={statusTone(v.status)}>{v.status}</Badge></td>
                    <td className="td text-right">
                      {v.status === 'Scheduled' ? (
                        <button onClick={() => completeVisit(v.id)} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-500 hover:text-white"><CheckCircle2 size={13} /> Complete</button>
                      ) : <span className="chip bg-emerald-50 text-emerald-600">Done</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
