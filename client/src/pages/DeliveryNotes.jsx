import { useState, useEffect } from 'react'
import { Plus, FolderKanban, Truck } from 'lucide-react'
import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import { Modal, Field, Select, Row } from '../components/Modal.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'

export default function DeliveryNotes() {
  const { deliveryNotes, stockItems, createDeliveryNote, authorizeReturn, resList } = useData()
  // Project & Customer live in panels the Stock User does not own → self-fetch from shared lookups.
  const [projs, setProjs] = useState([])
  const [custs, setCusts] = useState([])
  useEffect(() => {
    resList('lookups/projects').then((r) => setProjs(Array.isArray(r) ? r : [])).catch(() => setProjs([]))
    resList('lookups/customers').then((r) => setCusts(Array.isArray(r) ? r : [])).catch(() => setCusts([]))
  }, [])
  const projMap = Object.fromEntries(projs.map((p) => [p.id, p.label || `${p.ref || ''} ${p.name || ''}`.trim()]))
  const projectOpts = [{ value: '', label: '— Select project —' }, ...projs.map((p) => ({ value: p.id, label: p.label || `${p.ref || ''} ${p.name || ''}`.trim() }))]
  const customerOpts = [{ value: '', label: '— Select customer —' }, ...custs.map((c) => ({ value: c.name, label: c.label || c.name }))]
  const [modal, setModal] = useState(false)
  const [v, setV] = useState({ project: '', customer: '', item: '', qty: 1, area: '', position: '' })
  const itemOpts = stockItems.map((it) => ({ value: it.name, label: `${it.name} (${it.qty} in stock)` }))
  const save = async () => {
    if (!v.item) return
    const si = stockItems.find((x) => x.name === v.item)
    const value = (Number(si?.rate) || 0) * (Number(v.qty) || 1)
    try { await createDeliveryNote({ ...v, value }) } catch (e) { alert(e.message || 'Failed to create delivery note'); return }
    setV({ project: '', customer: '', item: '', qty: 1, area: '', position: '' }); setModal(false)
  }

  return (
    <>
      <PageHeader title="Delivery Notes" subtitle="Issue goods to project sites — stock reduces automatically">
        <button className="btn-primary" onClick={() => setModal(true)}><Plus size={16} /> New Delivery Note</button>
      </PageHeader>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">DN</th><th className="th">Item</th><th className="th">Qty</th><th className="th">Area / Position</th><th className="th">Project</th>
              <th className="th">Customer</th><th className="th">Value</th><th className="th">Status</th><th className="th text-right">Action</th>
            </tr></thead>
            <tbody>
              {deliveryNotes.map((dn) => (
                <tr key={dn.id} className="hover:bg-slate-50/60">
                  <td className="td font-semibold text-brand-600">{dn.ref || dn.number || dn.id}</td>
                  <td className="td font-medium text-ink">{dn.item}</td>
                  <td className="td text-slate-600">{dn.qty}</td>
                  <td className="td text-slate-500">{[dn.area, dn.position].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="td">{dn.project ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600"><FolderKanban size={13} /> {projMap[dn.project] || dn.project}</span> : <span className="text-slate-300">—</span>}</td>
                  <td className="td text-slate-600">{dn.customer || '—'}</td>
                  <td className="td font-semibold">{sar(dn.value)}</td>
                  <td className="td"><Badge tone={statusTone(dn.status)}>{dn.status}</Badge>{dn.rejection_reason && <span className="block text-[10px] text-rose-500">{dn.rejection_reason}</span>}</td>
                  <td className="td text-right">{dn.status === 'Return Requested' ? <button onClick={() => authorizeReturn(dn.id)} className="rounded-lg border border-amber-200 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50">Authorize Return</button> : <span className="text-xs text-slate-300">—</span>}</td>
                </tr>
              ))}
              {deliveryNotes.length === 0 && <tr><td className="td text-slate-400" colSpan={9}>No delivery notes yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="New Delivery Note" subtitle="Issue stock to a project site"
        footer={<><button className="btn-ghost" onClick={() => setModal(false)}>Cancel</button><button className="btn-primary" onClick={save}>Create &amp; Deliver</button></>}>
        <Select label="Item (from stock)" value={v.item} onChange={(e) => setV((s) => ({ ...s, item: e.target.value }))} options={[{ value: '', label: '— Select item —' }, ...itemOpts]} />
        <Row>
          <Select label="Project" value={v.project} onChange={(e) => setV((s) => ({ ...s, project: e.target.value }))} options={projectOpts} />
          <Field label="Qty" type="number" value={v.qty} onChange={(e) => setV((s) => ({ ...s, qty: e.target.value }))} />
        </Row>
        <Select label="Customer" value={v.customer} onChange={(e) => setV((s) => ({ ...s, customer: e.target.value }))} options={customerOpts} />
        <Row>
          <Field label="Area (DEL-001)" value={v.area} onChange={(e) => setV((s) => ({ ...s, area: e.target.value }))} placeholder="e.g. Main Kitchen" />
          <Field label="Position" value={v.position} onChange={(e) => setV((s) => ({ ...s, position: e.target.value }))} placeholder="e.g. Wall A / Line 2" />
        </Row>
        <div className="flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-700"><Truck size={15} /> Customer will Accept / Reject this delivery in their portal.</div>
      </Modal>
    </>
  )
}
