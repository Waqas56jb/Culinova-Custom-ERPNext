import { useState, useEffect } from 'react'
import { MapPin, Layers, ArrowLeftRight, SlidersHorizontal, ScrollText } from 'lucide-react'
import { PageHeader } from '../components/ui.jsx'
import ResourceTable from '../components/ResourceTable.jsx'
import { useData } from '../store/DataContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

export default function WarehouseOps() {
  const d = useData()
  const { canSee } = useAuth()
  const canEdit = canSee('warehouse')
  const [tab, setTab] = useState('Locations')
  // self-fetch reference data so dropdowns always populate (independent of global store timing/panel gating)
  const [ref, setRef] = useState({ warehouses: [], items: [] })
  useEffect(() => {
    Promise.all([d.resList('warehouses').catch(() => []), d.resList('items').catch(() => [])])
      .then(([w, it]) => setRef({ warehouses: (w || []).map((x) => x.name).filter(Boolean), items: (it || []).map((x) => x.item_name).filter(Boolean) }))
  }, [d])
  const warehouses = ref.warehouses.length ? ref.warehouses : (d.warehouses || []).map((w) => w.name).filter(Boolean)
  const items = ref.items.length ? ref.items : (d.items || []).map((i) => i.item_name).filter(Boolean)

  const TABS = [
    { key: 'Locations', icon: MapPin }, { key: 'Categories', icon: Layers },
    { key: 'Transfers', icon: ArrowLeftRight }, { key: 'Adjustments', icon: SlidersHorizontal }, { key: 'Ledger', icon: ScrollText },
  ]

  return (
    <>
      <PageHeader title="Warehouse Operations" subtitle="Locations · stock categories · transfers · adjustments · stock ledger" />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map(({ key, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${tab === key ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
            <Icon size={14} /> {key}
          </button>
        ))}
      </div>

      {tab === 'Locations' && (
        <ResourceTable resource="warehouse-locations" canEdit={canEdit} title="Warehouse Locations" subtitle="Zones, racks, bins inside each warehouse" addLabel="Add Location"
          columns={[{ key: 'name', label: 'Location', className: 'font-semibold text-ink' }, { key: 'code', label: 'Code', type: 'badge' }, { key: 'warehouse_name', label: 'Warehouse' }, { key: 'type', label: 'Type', type: 'badge' }, { key: 'is_active', label: 'Active', type: 'bool' }]}
          fields={[{ key: 'name', label: 'Location Name', required: true }, { key: 'code', label: 'Code' }, { key: 'warehouse_name', label: 'Warehouse', type: 'select', options: warehouses }, { key: 'type', label: 'Type', type: 'select', options: ['Zone', 'Rack', 'Bin', 'Shelf'] }, { key: 'is_active', label: 'Active', type: 'checkbox' }]} />
      )}
      {tab === 'Categories' && (
        <ResourceTable resource="stock-categories" canEdit={canEdit} title="Stock Categories" subtitle="Storage classification" addLabel="Add Category"
          columns={[{ key: 'name', label: 'Category', className: 'font-semibold text-ink' }, { key: 'code', label: 'Code', type: 'badge' }, { key: 'is_active', label: 'Active', type: 'bool' }]}
          fields={[{ key: 'name', label: 'Category', required: true }, { key: 'code', label: 'Code' }, { key: 'is_active', label: 'Active', type: 'checkbox' }]} />
      )}
      {tab === 'Transfers' && (
        <ResourceTable resource="stock-transfers" canEdit={canEdit} title="Stock Transfers" subtitle="Move stock between warehouses" addLabel="New Transfer"
          columns={[{ key: 'number', label: 'Ref', className: 'font-mono text-brand-600' }, { key: 'item_name', label: 'Item' }, { key: 'qty', label: 'Qty', type: 'number' }, { key: 'from_warehouse', label: 'From' }, { key: 'to_warehouse', label: 'To' }, { key: 'status', label: 'Status', type: 'badge' }, { key: 'transfer_date', label: 'Date' }]}
          fields={[{ key: 'item_name', label: 'Item', type: 'select', options: items }, { key: 'qty', label: 'Quantity', type: 'number', required: true }, { key: 'from_warehouse', label: 'From Warehouse', type: 'select', options: warehouses }, { key: 'to_warehouse', label: 'To Warehouse', type: 'select', options: warehouses }, { key: 'status', label: 'Status', type: 'select', options: ['Draft', 'In Transit', 'Completed', 'Cancelled'] }, { key: 'notes', label: 'Notes', type: 'textarea', full: true }]} />
      )}
      {tab === 'Adjustments' && (
        <ResourceTable resource="stock-adjustments" canEdit={canEdit} title="Stock Adjustments" subtitle="Manual increases / decreases (damage, count, correction)" addLabel="New Adjustment"
          columns={[{ key: 'number', label: 'Ref', className: 'font-mono text-brand-600' }, { key: 'item_name', label: 'Item' }, { key: 'qty_change', label: 'Qty Δ', type: 'number' }, { key: 'type', label: 'Type', type: 'badge' }, { key: 'warehouse', label: 'Warehouse' }, { key: 'reason', label: 'Reason' }, { key: 'adjustment_date', label: 'Date' }]}
          fields={[{ key: 'item_name', label: 'Item', type: 'select', options: items }, { key: 'qty_change', label: 'Quantity change (+/-)', type: 'number', required: true }, { key: 'type', label: 'Type', type: 'select', options: ['Add', 'Remove'] }, { key: 'warehouse', label: 'Warehouse', type: 'select', options: warehouses }, { key: 'reason', label: 'Reason', type: 'textarea', full: true }]} />
      )}
      {tab === 'Ledger' && (
        <ResourceTable resource="stock-ledger" canEdit={false} title="Stock Ledger" subtitle="Read-only movement history" emptyText="No stock movements recorded yet."
          columns={[{ key: 'created_at', label: 'When', render: (r) => new Date(r.created_at).toLocaleString() }, { key: 'item_name', label: 'Item', className: 'font-medium text-ink' }, { key: 'warehouse', label: 'Warehouse' }, { key: 'qty_in', label: 'In', type: 'number' }, { key: 'qty_out', label: 'Out', type: 'number' }, { key: 'balance', label: 'Balance', type: 'number' }, { key: 'ref_type', label: 'Ref', type: 'badge' }]}
          fields={[]} />
      )}
    </>
  )
}
