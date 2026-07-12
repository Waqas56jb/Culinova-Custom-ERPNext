import { useState } from 'react'
import { Plus, Building2 } from 'lucide-react'
import { PageHeader, Badge } from '../components/ui.jsx'
import { Modal, Field, Select } from '../components/Modal.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'

const typeTone = { Store: 'green', Storage: 'green', Transit: 'blue', Rejected: 'red', Scrap: 'red' }
const BLANK = { code: '', name: '', location: '', type: 'Store' }

export default function Warehouses() {
  const { warehouses, stockItems, addWarehouse } = useData()
  const [modal, setModal] = useState(false)
  const [v, setV] = useState(BLANK)
  const save = () => { if (v.name) addWarehouse(v); setV(BLANK); setModal(false) }
  // stock_balances stores the warehouse *name*, so the join is by name
  const rowsOf = (wh) => stockItems.filter((it) => it.warehouse === wh.name)
  const valueOf = (wh) => rowsOf(wh).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0)
  const countOf = (wh) => rowsOf(wh).length

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
              <Badge tone={typeTone[wh.type] || 'gray'}>{wh.type || 'Store'}</Badge>
            </div>
            <p className="mt-3 text-base font-bold text-ink">{wh.name}</p>
            <p className="text-xs text-muted">{[wh.code, wh.location].filter(Boolean).join(' · ') || '—'}</p>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
              <div><p className="text-xs text-muted">Items</p><p className="font-bold text-ink">{countOf(wh)}</p></div>
              <div className="text-right"><p className="text-xs text-muted">Stock Value</p><p className="font-bold text-brand-600">{sar(valueOf(wh))}</p></div>
            </div>
          </div>
        ))}
        {warehouses.length === 0 && (
          <div className="card card-pad col-span-full text-center text-sm text-muted">
            <Building2 className="mx-auto mb-2 text-slate-300" /> No warehouses yet. Click <b>New Warehouse</b> to add your first storage location.
          </div>
        )}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="New Warehouse" subtitle="Add a storage location"
        footer={<><button className="btn-ghost" onClick={() => setModal(false)}>Cancel</button><button className="btn-primary" onClick={save}>Create Warehouse</button></>}>
        <Field label="Warehouse Code" value={v.code} onChange={(e) => setV((s) => ({ ...s, code: e.target.value.toUpperCase() }))} placeholder="e.g. WH-JED" />
        <Field label="Warehouse Name" value={v.name} onChange={(e) => setV((s) => ({ ...s, name: e.target.value }))} placeholder="e.g. Jeddah Store" />
        <Field label="Location" value={v.location} onChange={(e) => setV((s) => ({ ...s, location: e.target.value }))} placeholder="e.g. Jeddah" />
        <Select label="Type" value={v.type} onChange={(e) => setV((s) => ({ ...s, type: e.target.value }))} options={['Store', 'Transit', 'Rejected', 'Scrap']} />
      </Modal>
    </>
  )
}
