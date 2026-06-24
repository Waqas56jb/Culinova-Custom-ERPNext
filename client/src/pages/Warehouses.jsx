import { useState } from 'react'
import { Plus, Building2 } from 'lucide-react'
import { PageHeader, Badge } from '../components/ui.jsx'
import { Modal, Field, Select } from '../components/Modal.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'

const typeTone = { Storage: 'green', Transit: 'blue', Rejected: 'red' }

export default function Warehouses() {
  const { warehouses, stockItems, addWarehouse } = useData()
  const [modal, setModal] = useState(false)
  const [v, setV] = useState({ name: '', location: '', type: 'Storage' })
  const save = () => { if (v.name) addWarehouse(v); setV({ name: '', location: '', type: 'Storage' }); setModal(false) }
  const valueOf = (wh) => stockItems.filter((it) => it.warehouse === wh).reduce((s, it) => s + it.qty * it.rate, 0)
  const countOf = (wh) => stockItems.filter((it) => it.warehouse === wh).length

  return (
    <>
      <PageHeader title="Warehouses" subtitle="Storage locations & their stock value">
        <button className="btn-primary" onClick={() => setModal(true)}><Plus size={16} /> New Warehouse</button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {warehouses.map((wh) => (
          <div key={wh.id} className="card card-pad animate-fade-up">
            <div className="flex items-start justify-between">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-navy-700 to-brand-600 text-white"><Building2 size={20} /></div>
              <Badge tone={typeTone[wh.type] || 'gray'}>{wh.type}</Badge>
            </div>
            <p className="mt-3 text-base font-bold text-ink">{wh.name}</p>
            <p className="text-xs text-muted">{wh.id} · {wh.location}</p>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
              <div><p className="text-xs text-muted">Items</p><p className="font-bold text-ink">{countOf(wh.name)}</p></div>
              <div className="text-right"><p className="text-xs text-muted">Stock Value</p><p className="font-bold text-brand-600">{sar(valueOf(wh.name))}</p></div>
            </div>
          </div>
        ))}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="New Warehouse" subtitle="Add a storage location"
        footer={<><button className="btn-ghost" onClick={() => setModal(false)}>Cancel</button><button className="btn-primary" onClick={save}>Create Warehouse</button></>}>
        <Field label="Warehouse Name" value={v.name} onChange={(e) => setV((s) => ({ ...s, name: e.target.value }))} placeholder="e.g. Jeddah Store" />
        <Field label="Location" value={v.location} onChange={(e) => setV((s) => ({ ...s, location: e.target.value }))} placeholder="e.g. Jeddah" />
        <Select label="Type" value={v.type} onChange={(e) => setV((s) => ({ ...s, type: e.target.value }))} options={['Storage', 'Transit', 'Rejected']} />
      </Modal>
    </>
  )
}
