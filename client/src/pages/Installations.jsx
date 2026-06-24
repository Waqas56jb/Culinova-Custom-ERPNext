import { Wrench, FolderKanban, CheckCircle2 } from 'lucide-react'
import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import { useData } from '../store/DataContext.jsx'

export default function Installations() {
  const { projects, updateBoqItem } = useData()
  // delivered items waiting to be installed on site
  const rows = projects.flatMap((p) =>
    (p.boq || []).map((b, idx) => ({ ...b, pid: p.id, pname: p.name, idx }))
      .filter((b) => b.status === 'Delivered' || b.status === 'Installed'),
  )
  const pending = rows.filter((r) => r.status === 'Delivered')

  return (
    <>
      <PageHeader title="Installations" subtitle="Fit delivered equipment on site — marking Installed updates the project live" />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="To Install" value={pending.length} tone="text-amber-600" />
        <Stat label="Installed" value={rows.filter((r) => r.status === 'Installed').length} tone="text-emerald-600" />
        <Stat label="Active Sites" value={new Set(rows.map((r) => r.pid)).size} tone="text-ink" />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">Item</th><th className="th">Project</th><th className="th">Qty</th><th className="th">Assigned</th><th className="th">Status</th><th className="th text-right">Action</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.pid + r.idx} className="hover:bg-slate-50/60">
                  <td className="td font-medium text-ink">{r.item}</td>
                  <td className="td"><span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600"><FolderKanban size={13} /> {r.pid}</span></td>
                  <td className="td text-slate-600">{r.qty}</td>
                  <td className="td text-slate-500">{r.assignee || '—'}</td>
                  <td className="td"><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
                  <td className="td text-right">
                    {r.status === 'Delivered' ? (
                      <button onClick={() => updateBoqItem(r.pid, r.idx, { status: 'Installed' })} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-500 hover:text-white"><Wrench size={13} /> Mark Installed</button>
                    ) : <span className="chip bg-emerald-50 text-emerald-600"><CheckCircle2 size={12} /> Done</span>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td className="td text-slate-400" colSpan={6}>No delivered items awaiting installation.</td></tr>}
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
