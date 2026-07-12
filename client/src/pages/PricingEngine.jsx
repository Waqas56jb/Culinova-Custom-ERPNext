import { useState, useEffect } from 'react'
import { ListChecks, Percent, Info } from 'lucide-react'
import { PageHeader } from '../components/ui.jsx'
import ResourceTable from '../components/ResourceTable.jsx'
import { useData } from '../store/DataContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

export default function PricingEngine() {
  const d = useData()
  const { canSee } = useAuth()
  const canEdit = canSee('warehouse') || canSee('admin')
  const [tab, setTab] = useState('Price Lists')
  const currencyCodes = (d.settings?.currencies || []).map((c) => c.code)
  // roles come from the real RBAC config (not hardcoded); categories from party categories master
  const [roles, setRoles] = useState([])
  const [custCats, setCustCats] = useState([])
  useEffect(() => {
    d.adminRbac().then((r) => setRoles(Object.keys(r.rolePanels || {}))).catch(() => setRoles([]))
    d.partyCategories('customer').then((c) => setCustCats((c || []).map((x) => x.name))).catch(() => setCustCats([]))
  }, [d])

  return (
    <>
      <PageHeader title="Pricing Engine" subtitle="Price lists · discount rules · multi-currency" />

      <div className="mb-3 flex items-start gap-2 rounded-xl border border-brand-100 bg-brand-50/50 px-4 py-2.5 text-xs text-brand-700">
        <Info size={15} className="mt-0.5 shrink-0" />
        <span>This is the pricing <b>structure</b>. The full Landing Cost + Cost Engine (supplier / freight / customs → landed cost → markup → selling price → GP) will be wired here in the next phase.</span>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {[{ key: 'Price Lists', icon: ListChecks }, { key: 'Discount Rules', icon: Percent }].map(({ key, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${tab === key ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
            <Icon size={14} /> {key}
          </button>
        ))}
      </div>

      {tab === 'Price Lists' && (
        <ResourceTable resource="price-lists" canEdit={canEdit} title="Price Lists" subtitle="Selling / buying price lists per currency" addLabel="Add Price List"
          columns={[{ key: 'name', label: 'Name', className: 'font-semibold text-ink' }, { key: 'type', label: 'Type', type: 'badge' }, { key: 'currency', label: 'Currency', type: 'badge' }, { key: 'is_default', label: 'Default', type: 'bool' }, { key: 'is_active', label: 'Active', type: 'bool' }]}
          fields={[{ key: 'name', label: 'Name', required: true }, { key: 'type', label: 'Type', type: 'select', options: ['Selling', 'Buying'] }, { key: 'currency', label: 'Currency', type: 'select', options: currencyCodes.length ? currencyCodes : ['SAR'] }, { key: 'is_default', label: 'Default', type: 'checkbox' }, { key: 'is_active', label: 'Active', type: 'checkbox' }]} />
      )}
      {tab === 'Discount Rules' && (
        <ResourceTable resource="discount-rules" canEdit={canEdit} title="Discount Rules" subtitle="Per-role / category discount limits (drives quotation approval)" addLabel="Add Rule"
          columns={[{ key: 'name', label: 'Rule', className: 'font-semibold text-ink' }, { key: 'applies_to', label: 'Applies To', type: 'badge' }, { key: 'target', label: 'Target' }, { key: 'discount_pct', label: 'Discount %', render: (r) => `${r.discount_pct}%` }, { key: 'max_discount', label: 'Max %', render: (r) => `${r.max_discount}%` }, { key: 'is_active', label: 'Active', type: 'bool' }]}
          fields={[{ key: 'name', label: 'Rule Name', required: true }, { key: 'applies_to', label: 'Applies To', type: 'select', options: ['Role', 'Customer Category', 'Item Group', 'All'] }, { key: 'target', label: 'Target (role / category)', type: 'select', options: [...roles, ...custCats] }, { key: 'discount_pct', label: 'Allowed Discount %', type: 'number' }, { key: 'max_discount', label: 'Max Discount %', type: 'number' }, { key: 'is_active', label: 'Active', type: 'checkbox' }]} />
      )}
    </>
  )
}
