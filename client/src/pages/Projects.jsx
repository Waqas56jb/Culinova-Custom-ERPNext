import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ArrowRight } from 'lucide-react'
import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import { sar } from '../data/mockData.js'
import { gpPctOf } from '../data/projectData.js'
import { useData } from '../store/DataContext.jsx'

const filters = ['All', 'On Track', 'At Risk', 'Delayed', 'Completed']

export default function Projects() {
  const navigate = useNavigate()
  const { projects } = useData()
  const [f, setF] = useState('All')
  const [q, setQ] = useState('')
  const rows = projects.filter((p) => (f === 'All' || p.status === f) && (p.id + p.name + p.customer + p.salesOrder).toLowerCase().includes(q.toLowerCase()))

  return (
    <>
      <PageHeader title="Projects" subtitle="Auto-created from confirmed Sales Orders · click a project to open its tracking board" />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total Projects" value={projects.length} tone="text-ink" />
        <Stat label="On Track" value={projects.filter((p) => p.status === 'On Track').length} tone="text-emerald-600" />
        <Stat label="At Risk / Delayed" value={projects.filter((p) => p.status === 'At Risk' || p.status === 'Delayed').length} tone="text-amber-600" />
        <Stat label="Completed" value={projects.filter((p) => p.status === 'Completed').length} tone="text-blue-600" />
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center">
          <div className="flex flex-wrap gap-1.5">
            {filters.map((x) => (
              <button key={x} onClick={() => setF(x)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${f === x ? 'bg-brand-500 text-white shadow-soft' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{x}</button>
            ))}
          </div>
          <div className="relative sm:ml-auto sm:w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects…"
              className="w-full rounded-lg border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:bg-white" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">Project</th><th className="th">Customer</th><th className="th">Contract Value</th>
              <th className="th">Actual Cost</th><th className="th">GP %</th><th className="th">Progress</th><th className="th">Status</th><th className="th text-right">Track</th>
            </tr></thead>
            <tbody>
              {rows.map((p) => {
                const gp = gpPctOf(p)
                return (
                  <tr key={p.id} onClick={() => navigate(`/projects/${p.id}`)} className="group cursor-pointer hover:bg-slate-50/60">
                    <td className="td">
                      <p className="font-semibold text-brand-600">{p.id}</p>
                      <p className="text-xs text-muted">{p.name}</p>
                    </td>
                    <td className="td text-ink">{p.customer}</td>
                    <td className="td font-semibold">{sar(p.contractValue)}</td>
                    <td className="td text-slate-600">{sar(p.actualCost)}</td>
                    <td className="td"><span className={`chip ${gp < 20 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>{gp}%</span></td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${p.progress}%` }} /></div>
                        <span className="text-xs text-muted">{p.progress}%</span>
                      </div>
                    </td>
                    <td className="td"><Badge tone={statusTone(p.status)}>{p.status}</Badge></td>
                    <td className="td text-right">
                      <span className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 transition group-hover:bg-brand-500 group-hover:text-white">
                        Track <ArrowRight size={13} />
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function Stat({ label, value, tone }) {
  return (
    <div className="card card-pad animate-fade-up">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${tone}`}>{value}</p>
    </div>
  )
}
