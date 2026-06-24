import { PageHeader, Badge } from '../components/ui.jsx'
import { adminProjects, sar } from '../data/adminData.js'

const tone = { 'On Track': 'green', 'At Risk': 'amber', Delayed: 'red', Completed: 'blue' }

export default function Projects() {
  const totalValue = adminProjects.reduce((s, p) => s + p.value, 0)

  return (
    <>
      <PageHeader title="All Projects" subtitle="Full visibility of every project across the company" />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Projects" value={adminProjects.length} tone="text-ink" />
        <Stat label="Total Value" value={sar(totalValue)} tone="text-brand-600" />
        <Stat label="On Track" value={adminProjects.filter((p) => p.status === 'On Track').length} tone="text-emerald-600" />
        <Stat label="At Risk / Delayed" value={adminProjects.filter((p) => p.status === 'At Risk' || p.status === 'Delayed').length} tone="text-amber-600" />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">Project</th><th className="th">Customer</th><th className="th">Manager</th><th className="th">Contract Value</th>
              <th className="th">GP %</th><th className="th">Progress</th><th className="th">Status</th>
            </tr></thead>
            <tbody>
              {adminProjects.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/60">
                  <td className="td font-semibold text-brand-600">{p.id}</td>
                  <td className="td font-medium text-ink">{p.customer}</td>
                  <td className="td text-slate-500">{p.manager}</td>
                  <td className="td font-semibold">{sar(p.value)}</td>
                  <td className="td"><span className={`chip ${p.gp < 20 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>{p.gp}%</span></td>
                  <td className="td">
                    <div className="flex items-center gap-2"><div className="h-1.5 w-24 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${p.progress}%` }} /></div><span className="text-xs text-muted">{p.progress}%</span></div>
                  </td>
                  <td className="td"><Badge tone={tone[p.status]}>{p.status}</Badge></td>
                </tr>
              ))}
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
