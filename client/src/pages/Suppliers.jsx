import { useState, useEffect } from 'react'
import { Plus, Star } from 'lucide-react'
import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import { Modal, Field, Select, Row } from '../components/Modal.jsx'
import { useData } from '../store/DataContext.jsx'

export default function Suppliers() {
  const d = useData()
  const { suppliers, addSupplier, purchaseOrders } = d
  const [cats, setCats] = useState([])
  useEffect(() => { d.partyCategories('supplier').then((c) => setCats((c || []).map((x) => x.name))).catch(() => setCats([])) }, [d])
  const poCount = {}
  ;(purchaseOrders || []).forEach((p) => { if (p.supplier) poCount[p.supplier] = (poCount[p.supplier] || 0) + 1 })
  const [modal, setModal] = useState(false)
  const [v, setV] = useState({ name: '', category: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const closeModal = () => { setModal(false); setErr('') }
  // The store/server generates the supplier code — we pass name + category through and let it assign one.
  // Await the create so a rejection surfaces inline and the modal stays open (never close as if it worked).
  const save = async () => {
    if (!v.name.trim()) { setErr('Supplier name is required.'); return }
    setSaving(true); setErr('')
    try {
      await addSupplier(v)
      setV({ name: '', category: '' })
      closeModal()
    } catch (e) {
      setErr(e?.message || 'Could not create supplier. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="Suppliers" subtitle="Vendor master · performance & ratings">
        <button className="btn-primary" onClick={() => { setErr(''); setModal(true) }}><Plus size={16} /> New Supplier</button>
      </PageHeader>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">Supplier</th><th className="th">Category</th><th className="th">Rating</th>
              <th className="th">On-Time %</th><th className="th">Total POs</th><th className="th">Status</th>
            </tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/60">
                  <td className="td">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-navy-700 to-brand-600 text-[11px] font-bold text-white">{s.name.slice(0, 2).toUpperCase()}</span>
                      <div><p className="font-semibold text-ink">{s.name}</p><p className="text-xs text-muted">{s.code || '—'}</p></div>
                    </div>
                  </td>
                  <td className="td text-slate-600">{s.category}</td>
                  <td className="td"><span className="inline-flex items-center gap-1 font-semibold text-ink"><Star size={13} className="fill-gold-400 text-gold-400" /> {s.rating}</span></td>
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${s.onTime}%` }} /></div>
                      <span className="text-xs text-muted">{s.onTime}%</span>
                    </div>
                  </td>
                  <td className="td text-slate-600">{poCount[s.name] || 0}</td>
                  <td className="td"><Badge tone={statusTone(s.status)}>{s.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modal} onClose={closeModal} title="New Supplier" subtitle="Add a vendor to the master"
        footer={<><button className="btn-ghost" onClick={closeModal}>Cancel</button><button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Create Supplier'}</button></>}>
        <Field label="Supplier Name" value={v.name} onChange={(e) => setV((s) => ({ ...s, name: e.target.value }))} placeholder="e.g. Gulf Kitchen Equip. Co." />
        <Select label="Category" value={v.category} onChange={(e) => setV((s) => ({ ...s, category: e.target.value }))} options={cats.length ? cats : ['Equipment', 'Fabrication', 'Local', 'Import']} />
        {err && <p className="text-sm font-medium text-red-600">{err}</p>}
      </Modal>
    </>
  )
}
