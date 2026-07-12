import { useState, useEffect } from 'react'
import { Settings2 } from 'lucide-react'
import { PageHeader } from '../components/ui.jsx'
import ResourceTable from '../components/ResourceTable.jsx'
import PartyDetailModal from '../components/PartyDetailModal.jsx'
import { useData } from '../store/DataContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

// Customer / Supplier master page: list + inline category + "Manage" → contacts/addresses/documents.
export default function PartyMaster({ party }) {
  const d = useData()
  const { canSee } = useAuth()
  const panel = party === 'customer' ? 'sales' : 'procurement'
  const canEdit = canSee(panel) || canSee('admin')
  const [manage, setManage] = useState(null)
  const [cats, setCats] = useState([])
  useEffect(() => { d.partyCategories(party).then((c) => setCats((c || []).map((x) => x.name))).catch(() => setCats([])) }, [d, party])

  const isCustomer = party === 'customer'
  const columns = [
    { key: 'name', label: 'Name', className: 'font-semibold text-ink' },
    { key: 'code', label: 'Code', type: 'badge' },
    { key: 'category', label: 'Category', type: 'badge' },
    isCustomer ? { key: 'email', label: 'Email' } : { key: 'rating', label: 'Rating', type: 'number' },
    { key: 'status', label: 'Status', type: 'badge' },
    { key: '_manage', label: '', render: (row) => <button className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-brand-50 hover:text-brand-600" onClick={(e) => { e.stopPropagation(); setManage(row.id) }}><Settings2 size={12} /> Manage</button> },
  ]
  const fields = isCustomer
    ? [{ key: 'name', label: 'Customer Name', required: true }, { key: 'category', label: 'Category', type: 'select', options: cats }, { key: 'territory', label: 'Territory' }, { key: 'contact', label: 'Contact Person' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }, { key: 'credit_limit', label: 'Credit Limit', type: 'number' }, { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive', 'On Hold'] }]
    : [{ key: 'name', label: 'Supplier Name', required: true }, { key: 'category', label: 'Category', type: 'select', options: cats }, { key: 'rating', label: 'Rating (1-5)', type: 'number' }, { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive', 'Blacklisted'] }]

  return (
    <>
      <PageHeader title={isCustomer ? 'Customer Master' : 'Supplier Master'} subtitle={`Master records + contacts, addresses & documents`} />
      <ResourceTable resource={`${party}s`} canEdit={canEdit} title={isCustomer ? 'Customers' : 'Suppliers'} addLabel={isCustomer ? 'Add Customer' : 'Add Supplier'}
        columns={columns} fields={fields} />
      <PartyDetailModal party={party} id={manage} open={!!manage} onClose={() => setManage(null)} canEdit={canEdit} />
    </>
  )
}
