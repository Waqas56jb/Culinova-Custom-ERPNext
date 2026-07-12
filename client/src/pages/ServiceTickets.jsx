import { useState } from 'react'
import { Plus, CheckCircle2, FolderKanban } from 'lucide-react'
import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import { Modal, Field, Select, Row } from '../components/Modal.jsx'
import { useData } from '../store/DataContext.jsx'

export default function ServiceTickets() {
  const { tickets, addTicket, resolveTicket } = useData()
  const [modal, setModal] = useState(false)
  const [v, setV] = useState({ customer: '', project: '', subject: '', priority: 'Medium' })
  const save = () => { if (v.subject) addTicket(v); setV({ customer: '', project: '', subject: '', priority: 'Medium' }); setModal(false) }

  return (
    <>
      <PageHeader title="Service Tickets" subtitle="Customer complaints with SLA tracking">
        <button className="btn-primary" onClick={() => setModal(true)}><Plus size={16} /> New Ticket</button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total" value={tickets.length} tone="text-ink" />
        <Stat label="Open" value={tickets.filter((t) => t.status === 'Open').length} tone="text-blue-600" />
        <Stat label="In Progress" value={tickets.filter((t) => t.status === 'In Progress').length} tone="text-amber-600" />
        <Stat label="Resolved" value={tickets.filter((t) => t.status === 'Resolved').length} tone="text-emerald-600" />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">Ticket</th><th className="th">Customer</th><th className="th">Project</th><th className="th">Subject</th>
              <th className="th">Priority</th><th className="th">SLA</th><th className="th">Status</th><th className="th text-right">Action</th>
            </tr></thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/60">
                  <td className="td font-semibold text-brand-600">{t.id}</td>
                  <td className="td font-medium text-ink">{t.customer}</td>
                  <td className="td"><span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600"><FolderKanban size={12} /> {t.project_id}</span></td>
                  <td className="td text-slate-700">{t.subject}</td>
                  <td className="td"><Badge tone={statusTone(t.priority)}>{t.priority}</Badge></td>
                  <td className="td"><Badge tone={statusTone(t.sla)}>{t.sla}</Badge></td>
                  <td className="td"><Badge tone={statusTone(t.status)}>{t.status}</Badge></td>
                  <td className="td text-right">
                    {t.status !== 'Resolved' ? (
                      <button onClick={() => resolveTicket(t.id)} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-500 hover:text-white"><CheckCircle2 size={13} /> Resolve</button>
                    ) : <span className="chip bg-emerald-50 text-emerald-600">Resolved</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="New Service Ticket" subtitle="Log a customer complaint"
        footer={<><button className="btn-ghost" onClick={() => setModal(false)}>Cancel</button><button className="btn-primary" onClick={save}>Create Ticket</button></>}>
        <Row>
          <Field label="Customer" value={v.customer} onChange={(e) => setV((s) => ({ ...s, customer: e.target.value }))} placeholder="Customer name" />
          <Field label="Project" value={v.project} onChange={(e) => setV((s) => ({ ...s, project: e.target.value }))} placeholder="PRJ-0040" />
        </Row>
        <Field label="Subject" value={v.subject} onChange={(e) => setV((s) => ({ ...s, subject: e.target.value }))} placeholder="Describe the issue" />
        <Select label="Priority" value={v.priority} onChange={(e) => setV((s) => ({ ...s, priority: e.target.value }))} options={['Low', 'Medium', 'High']} />
      </Modal>
    </>
  )
}

function Stat({ label, value, tone }) {
  return <div className="card card-pad animate-fade-up"><p className="text-xs text-muted">{label}</p><p className={`mt-1 text-2xl font-extrabold ${tone}`}>{value}</p></div>
}
