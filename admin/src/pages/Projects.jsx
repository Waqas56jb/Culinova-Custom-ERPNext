import { useState, useEffect } from 'react'
import { PageHeader, Badge } from '../components/ui.jsx'
import { sar } from '../data/adminData.js'
import { api } from '../api.js'
import { useAdmin } from '../store/AdminContext.jsx'

const tone = { 'On Track': 'green', 'At Risk': 'amber', Delayed: 'red', Completed: 'blue', Working: 'green', 'In Progress': 'green' }

export default function Projects() {
  const { users } = useAdmin()
  const [projects, setProjects] = useState([])
  useEffect(() => { api('/projects').then((p) => setProjects(Array.isArray(p) ? p : [])).catch(() => setProjects([])) }, [])
  const nameOf = (id) => users.find((u) => u.id === id)?.name || '—'
  const gpOf = (p) => { const v = Number(p.contract_value) || 0, cost = Number(p.actual_cost) || 0; return v > 0 ? Math.round(((v - cost) / v) * 100) : 0 }

  const totalValue = projects.reduce((s, p) => s + (Number(p.contract_value) || 0), 0)

  return (
    <>
      <PageHeader title="All Projects" subtitle="Full visibility of every project across the company" />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Projects" value={projects.length} tone="text-ink" />
        <Stat label="Total Value" value={sar(totalValue)} tone="text-brand-600" />
        <Stat label="On Track" value={projects.filter((p) => p.status === 'On Track').length} tone="text-emerald-600" />
        <Stat label="At Risk / Delayed" value={projects.filter((p) => ['At Risk', 'Delayed'].includes(p.status)).length} tone="text-amber-600" />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">Project</th><th className="th">Customer</th><th className="th">Manager</th><th className="th">Contract Value</th>
              <th className="th">GP %</th><th className="th">Progress</th><th className="th">Status</th>
            </tr></thead>
            <tbody>
              {projects.map((p) => {
                const gp = gpOf(p)
                return (
                  <tr key={p.id} className="hover:bg-slate-50/60">
                    <td className="td font-semibold text-brand-600">{p.number}<span className="block text-[11px] font-normal text-muted">{p.name}</span></td>
                    <td className="td font-medium text-ink">{p.customer}</td>
                    <td className="td text-slate-500">{nameOf(p.manager_id)}</td>
                    <td className="td font-semibold">{sar(p.contract_value)}</td>
                    <td className="td"><span className={`chip ${gp < 20 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>{gp}%</span></td>
                    <td className="td">
                      <div className="flex items-center gap-2"><div className="h-1.5 w-24 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${p.progress || 0}%` }} /></div><span className="text-xs text-muted">{p.progress || 0}%</span></div>
                    </td>
                    <td className="td"><Badge tone={tone[p.status] || 'gray'}>{p.status}</Badge></td>
                  </tr>
                )
              })}
              {projects.length === 0 && <tr><td className="td text-slate-400" colSpan={7}>No projects yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function Stat({ label, value, tone }) {
  return <div className="card card-pad animate-fade-up"><p className="text-xs text-muted">{label}</p><p className={`mt-1 text-2xl font-extrabold ${tone}`}>{value}</p></div>
}
