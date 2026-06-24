import { useState } from 'react'
import { Plus, CheckCircle2, FolderKanban } from 'lucide-react'
import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import { Modal, Field, Select, Row } from '../components/Modal.jsx'
import { useData } from '../store/DataContext.jsx'

export default function SnagList() {
  const { snags, addSnag, resolveSnag } = useData()
  const [modal, setModal] = useState(false)
  const [v, setV] = useState({ project: '', item: '', desc: '', severity: 'Low' })
  const save = () => { if (v.desc) addSnag(v); setV({ project: '', item: '', desc: '', severity: 'Low' }); setModal(false) }

  return (
    <>
      <PageHeader title="Snag List" subtitle="Site defects to fix before handover">
        <button className="btn-primary" onClick={() => setModal(true)}><Plus size={16} /> Add Snag</button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Open Snags" value={snags.filter((s) => s.status === 'Open').length} tone="text-amber-600" />
        <Stat label="High Severity" value={snags.filter((s) => s.severity === 'High' && s.status === 'Open').length} tone="text-rose-600" />
        <Stat label="Resolved" value={snags.filter((s) => s.status === 'Resolved').length} tone="text-emerald-600" />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">Snag</th><th className="th">Project</th><th className="th">Item</th><th className="th">Description</th>
              <th className="th">Severity</th><th className="th">Status</th><th className="th text-right">Action</th>
            </tr></thead>
            <tbody>
              {snags.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/60">
                  <td className="td font-semibold text-brand-600">{s.id}</td>
                  <td className="td"><span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600"><FolderKanban size={12} /> {s.project}</span></td>
                  <td className="td text-slate-600">{s.item}</td>
                  <td className="td text-slate-700">{s.desc}</td>
                  <td className="td"><Badge tone={statusTone(s.severity)}>{s.severity}</Badge></td>
                  <td className="td"><Badge tone={statusTone(s.status)}>{s.status}</Badge></td>
                  <td className="td text-right">
                    {s.status === 'Open' ? (
                      <button onClick={() => resolveSnag(s.id)} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-500 hover:text-white"><CheckCircle2 size={13} /> Resolve</button>
                    ) : <span className="chip bg-emerald-50 text-emerald-600">Resolved</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Add Snag" subtitle="Log a site defect"
        footer={<><button className="btn-ghost" onClick={() => setModal(false)}>Cancel</button><button className="btn-primary" onClick={save}>Add Snag</button></>}>
        <Row>
          <Field label="Project" value={v.project} onChange={(e) => setV((s) => ({ ...s, project: e.target.value }))} placeholder="PRJ-0042" />
          <Field label="Item" value={v.item} onChange={(e) => setV((s) => ({ ...s, item: e.target.value }))} placeholder="Exhaust Hood" />
        </Row>
        <Field label="Description" value={v.desc} onChange={(e) => setV((s) => ({ ...s, desc: e.target.value }))} placeholder="Describe the defect" />
        <Select label="Severity" value={v.severity} onChange={(e) => setV((s) => ({ ...s, severity: e.target.value }))} options={['Low', 'Medium', 'High']} />
      </Modal>
    </>
  )
}

function Stat({ label, value, tone }) {
  return <div className="card card-pad animate-fade-up"><p className="text-xs text-muted">{label}</p><p className={`mt-1 text-2xl font-extrabold ${tone}`}>{value}</p></div>
}
