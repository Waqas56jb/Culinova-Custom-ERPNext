import { useState } from 'react'
import { Plus, FolderKanban, Truck } from 'lucide-react'
import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import { Modal, Field, Select, Row } from '../components/Modal.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'

export default function DeliveryNotes() {
  const { deliveryNotes, stockItems, createDeliveryNote } = useData()
  const [modal, setModal] = useState(false)
  const [v, setV] = useState({ project: '', customer: '', item: '', qty: 1 })
  const itemOpts = stockItems.map((it) => ({ value: it.name, label: `${it.name} (${it.qty} in stock)` }))
  const save = () => { if (v.item) createDeliveryNote(v); setV({ project: '', customer: '', item: '', qty: 1 }); setModal(false) }

  return (
    <>
      <PageHeader title="Delivery Notes" subtitle="Issue goods to project sites — stock reduces automatically">
        <button className="btn-primary" onClick={() => setModal(true)}><Plus size={16} /> New Delivery Note</button>
      </PageHeader>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">DN</th><th className="th">Item</th><th className="th">Qty</th><th className="th">Project</th>
              <th className="th">Customer</th><th className="th">Value</th><th className="th">Date</th><th className="th">Status</th>
            </tr></thead>
            <tbody>
              {deliveryNotes.map((dn) => (
                <tr key={dn.id} className="hover:bg-slate-50/60">
                  <td className="td font-semibold text-brand-600">{dn.id}</td>
                  <td className="td font-medium text-ink">{dn.item}</td>
                  <td className="td text-slate-600">{dn.qty}</td>
                  <td className="td"><span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600"><FolderKanban size={13} /> {dn.project}</span></td>
                  <td className="td text-slate-600">{dn.customer}</td>
                  <td className="td font-semibold">{sar(dn.value)}</td>
                  <td className="td text-slate-500">{dn.date}</td>
                  <td className="td"><Badge tone={statusTone(dn.status)}>{dn.status}</Badge></td>
                </tr>
              ))}
              {deliveryNotes.length === 0 && <tr><td className="td text-slate-400" colSpan={8}>No delivery notes yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="New Delivery Note" subtitle="Issue stock to a project site"
        footer={<><button className="btn-ghost" onClick={() => setModal(false)}>Cancel</button><button className="btn-primary" onClick={save}>Create &amp; Deliver</button></>}>
        <Select label="Item (from stock)" value={v.item} onChange={(e) => setV((s) => ({ ...s, item: e.target.value }))} options={[{ value: '', label: '— Select item —' }, ...itemOpts]} />
        <Row>
          <Field label="Project" value={v.project} onChange={(e) => setV((s) => ({ ...s, project: e.target.value }))} placeholder="PRJ-0042" />
          <Field label="Qty" type="number" value={v.qty} onChange={(e) => setV((s) => ({ ...s, qty: e.target.value }))} />
        </Row>
        <Field label="Customer" value={v.customer} onChange={(e) => setV((s) => ({ ...s, customer: e.target.value }))} placeholder="Riyadh Grand Hotel" />
        <div className="flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-700"><Truck size={15} /> On creation, stock for this item reduces automatically.</div>
      </Modal>
    </>
  )
}
