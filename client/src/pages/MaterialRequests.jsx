import { useNavigate } from 'react-router-dom'
import { FileText, ArrowRight } from 'lucide-react'
import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import { useData } from '../store/DataContext.jsx'

export default function MaterialRequests() {
  const navigate = useNavigate()
  const { projects, rfqs, addRFQ } = useData()

  // items the PM sent to procurement (not yet delivered/installed)
  const rows = projects.flatMap((p) =>
    (p.boq || [])
      .map((b) => ({ ...b, project: p.id, projectName: p.name }))
      .filter((b) => ['Waiting', 'Assigned', 'In Progress'].includes(b.status)),
  )
  const hasRfq = (item, project) => rfqs.some((r) => r.item === item && r.project === project)

  const createRFQ = (b) => { addRFQ({ item: b.item, project: b.project, qty: b.qty }); navigate('/procurement/rfq') }

  return (
    <>
      <PageHeader title="Material Requests" subtitle="Items the Project Manager sent for procurement" />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Items to Procure" value={rows.length} tone="text-ink" />
        <Stat label="Waiting" value={rows.filter((r) => r.status === 'Waiting').length} tone="text-slate-600" />
        <Stat label="In Progress" value={rows.filter((r) => r.status === 'In Progress').length} tone="text-blue-600" />
        <Stat label="RFQs Raised" value={rfqs.length} tone="text-brand-600" />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">Required Item</th><th className="th">Project</th><th className="th">Qty</th>
              <th className="th">Assigned</th><th className="th">Status</th><th className="th text-right">Action</th>
            </tr></thead>
            <tbody>
              {rows.map((b, i) => (
                <tr key={i} className="hover:bg-slate-50/60">
                  <td className="td font-medium text-ink">{b.item}</td>
                  <td className="td"><span className="text-xs font-semibold text-brand-600">{b.project}</span><p className="text-xs text-muted">{b.projectName}</p></td>
                  <td className="td text-slate-600">{b.qty}</td>
                  <td className="td text-slate-500">{b.assignee || '—'}</td>
                  <td className="td"><Badge tone={statusTone(b.status)}>{b.status}</Badge></td>
                  <td className="td text-right">
                    {hasRfq(b.item, b.project) ? (
                      <span className="chip bg-slate-100 text-slate-500">RFQ raised</span>
                    ) : (
                      <button onClick={() => createRFQ(b)} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-500 hover:text-white">
                        <FileText size={13} /> Create RFQ <ArrowRight size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td className="td text-slate-400" colSpan={6}>No pending procurement items.</td></tr>}
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
