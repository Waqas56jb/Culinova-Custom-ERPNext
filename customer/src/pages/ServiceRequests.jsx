import { useState } from 'react'
import { Plus, Wrench, ShieldCheck } from 'lucide-react'
import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import { Modal, Field, Select, TextArea } from '../components/Modal.jsx'
import { useCustomer } from '../store/CustomerContext.jsx'

export default function ServiceRequests() {
  const { tickets, raiseTicket } = useCustomer()
  const [modal, setModal] = useState(false)
  const [v, setV] = useState({ subject: '', priority: 'Medium', desc: '' })
  const save = () => { if (v.subject) raiseTicket(v); setV({ subject: '', priority: 'Medium', desc: '' }); setModal(false) }

  return (
    <>
      <PageHeader title="Service Requests" subtitle="Raise a request — track its status & SLA">
        <button className="btn-primary" onClick={() => setModal(true)}><Plus size={16} /> New Request</button>
      </PageHeader>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">Ticket</th><th className="th">Subject</th><th className="th">Priority</th><th className="th">Date</th><th className="th">Status</th>
            </tr></thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/60">
                  <td className="td font-semibold text-brand-600">{t.id}</td>
                  <td className="td font-medium text-ink">{t.subject}</td>
                  <td className="td"><Badge tone={statusTone(t.priority)}>{t.priority}</Badge></td>
                  <td className="td text-slate-500">{t.date}</td>
                  <td className="td"><Badge tone={statusTone(t.status)}>{t.status}</Badge></td>
                </tr>
              ))}
              {tickets.length === 0 && <tr><td className="td text-slate-400" colSpan={5}>No service requests yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="New Service Request" subtitle="Our service team will respond per SLA"
        footer={<><button className="btn-ghost" onClick={() => setModal(false)}>Cancel</button><button className="btn-primary" onClick={save}><Wrench size={15} /> Submit Request</button></>}>
        <Field label="Subject" value={v.subject} onChange={(e) => setV((s) => ({ ...s, subject: e.target.value }))} placeholder="e.g. Chiller not cooling" />
        <Select label="Priority" value={v.priority} onChange={(e) => setV((s) => ({ ...s, priority: e.target.value }))} options={['Low', 'Medium', 'High']} />
        <TextArea label="Description" value={v.desc} onChange={(e) => setV((s) => ({ ...s, desc: e.target.value }))} placeholder="Describe the issue…" />
      </Modal>
    </>
  )
}
