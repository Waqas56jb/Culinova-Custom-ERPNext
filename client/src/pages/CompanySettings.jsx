import { useState } from 'react'
import { Building2, GitBranch, Users2, Coins, Percent, Hash } from 'lucide-react'
import { PageHeader } from '../components/ui.jsx'
import MasterTable from '../components/MasterTable.jsx'
import { useData } from '../store/DataContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

export default function CompanySettings() {
  const d = useData()
  const { canSee } = useAuth()
  const canEdit = canSee('admin')
  const [tab, setTab] = useState('Company')
  const s = d.settings || {}
  const currencyCodes = (s.currencies || []).map((c) => c.code)

  // entity slug used by the API + DataContext helpers
  const wire = (entity) => ({
    canEdit,
    onAdd: (v) => d.settingsAdd(entity, v),
    onUpdate: (id, v) => d.settingsUpdate(entity, id, v),
    onDelete: (id) => d.settingsDelete(entity, id),
  })

  const TABS = [
    { key: 'Company', icon: Building2 },
    { key: 'Branches', icon: GitBranch },
    { key: 'Departments', icon: Users2 },
    { key: 'Currencies', icon: Coins },
    { key: 'VAT', icon: Percent },
    { key: 'Numbering', icon: Hash },
  ]

  return (
    <>
      <PageHeader title="Company Settings" subtitle="Company profile · branches · departments · currencies · VAT · numbering series" />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map(({ key, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${tab === key ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
            <Icon size={14} /> {key}
          </button>
        ))}
      </div>

      {tab === 'Company' && (
        <MasterTable title="Company Profile" subtitle="Legal entity details used across documents" {...wire('companies')}
          rows={s.companies || []}
          columns={[{ key: 'name', label: 'Name', className: 'font-semibold text-ink' }, { key: 'legal_name', label: 'Legal Name' }, { key: 'vat_number', label: 'VAT No.' }, { key: 'base_currency', label: 'Base Currency', type: 'badge' }, { key: 'country', label: 'Country' }]}
          fields={[
            { key: 'name', label: 'Company Name', required: true }, { key: 'legal_name', label: 'Legal Name' },
            { key: 'vat_number', label: 'VAT / Tax Number' }, { key: 'cr_number', label: 'Commercial Registration' },
            { key: 'base_currency', label: 'Base Currency', type: 'select', options: currencyCodes.length ? currencyCodes : ['SAR'] },
            { key: 'country', label: 'Country' }, { key: 'city', label: 'City' },
            { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' }, { key: 'website', label: 'Website' },
            { key: 'address', label: 'Address', type: 'textarea', full: true },
          ]} addLabel="Add Company" />
      )}

      {tab === 'Branches' && (
        <MasterTable title="Branches" subtitle="Physical locations / offices" {...wire('branches')}
          rows={s.branches || []}
          columns={[{ key: 'name', label: 'Branch', className: 'font-semibold text-ink' }, { key: 'code', label: 'Code', type: 'badge' }, { key: 'city', label: 'City' }, { key: 'manager', label: 'Manager' }, { key: 'is_active', label: 'Active', type: 'bool' }]}
          fields={[
            { key: 'name', label: 'Branch Name', required: true }, { key: 'code', label: 'Code' },
            { key: 'city', label: 'City' }, { key: 'phone', label: 'Phone' }, { key: 'manager', label: 'Manager' },
            { key: 'address', label: 'Address', type: 'textarea', full: true }, { key: 'is_active', label: 'Active', type: 'checkbox' },
          ]} addLabel="Add Branch" />
      )}

      {tab === 'Departments' && (
        <MasterTable title="Departments" subtitle="Organisational units" {...wire('departments')}
          rows={s.departments || []}
          columns={[{ key: 'name', label: 'Department', className: 'font-semibold text-ink' }, { key: 'code', label: 'Code', type: 'badge' }, { key: 'head', label: 'Head' }, { key: 'is_active', label: 'Active', type: 'bool' }]}
          fields={[{ key: 'name', label: 'Department', required: true }, { key: 'code', label: 'Code' }, { key: 'head', label: 'Head / Manager' }, { key: 'is_active', label: 'Active', type: 'checkbox' }]}
          addLabel="Add Department" />
      )}

      {tab === 'Currencies' && (
        <MasterTable title="Currencies" subtitle="Exchange rate = units of this currency per 1 base currency" {...wire('currencies')}
          rows={s.currencies || []}
          columns={[{ key: 'code', label: 'Code', className: 'font-mono font-semibold text-ink' }, { key: 'name', label: 'Name' }, { key: 'symbol', label: 'Symbol' }, { key: 'exchange_rate', label: 'Rate' }, { key: 'is_base', label: 'Base', type: 'bool' }, { key: 'is_active', label: 'Active', type: 'bool' }]}
          fields={[
            { key: 'code', label: 'Code (SAR/USD…)', required: true }, { key: 'name', label: 'Name' }, { key: 'symbol', label: 'Symbol' },
            { key: 'exchange_rate', label: 'Exchange Rate', type: 'number', hint: 'per 1 base currency' },
            { key: 'is_base', label: 'Base currency', type: 'checkbox' }, { key: 'is_active', label: 'Active', type: 'checkbox' },
          ]} addLabel="Add Currency" />
      )}

      {tab === 'VAT' && (
        <MasterTable title="VAT Settings" subtitle="Tax rates (ZATCA e-invoicing compliance stays in the accounting system)" {...wire('vat-settings')}
          rows={s.vatSettings || []}
          columns={[{ key: 'name', label: 'Name', className: 'font-semibold text-ink' }, { key: 'rate', label: 'Rate %', render: (r) => `${r.rate}%` }, { key: 'region', label: 'Region', type: 'badge' }, { key: 'is_default', label: 'Default', type: 'bool' }, { key: 'is_active', label: 'Active', type: 'bool' }]}
          fields={[
            { key: 'name', label: 'Name', required: true }, { key: 'rate', label: 'Rate %', type: 'number', required: true },
            { key: 'region', label: 'Region' }, { key: 'account', label: 'Tax Account' },
            { key: 'is_default', label: 'Default', type: 'checkbox' }, { key: 'is_active', label: 'Active', type: 'checkbox' },
          ]} addLabel="Add VAT Rate" />
      )}

      {tab === 'Numbering' && (
        <MasterTable title="Numbering Series" subtitle="Auto-generated document reference numbers" {...wire('numbering-series')}
          rows={s.numberingSeries || []}
          columns={[{ key: 'doc_type', label: 'Document', className: 'font-semibold text-ink' }, { key: 'prefix', label: 'Prefix', type: 'badge' }, { key: 'next_number', label: 'Next #' }, { key: 'padding', label: 'Padding' }, { key: 'include_year', label: 'Year', type: 'bool' }, { key: 'is_active', label: 'Active', type: 'bool' }]}
          fields={[
            { key: 'doc_type', label: 'Document Type', required: true }, { key: 'prefix', label: 'Prefix', required: true },
            { key: 'next_number', label: 'Next Number', type: 'number' }, { key: 'padding', label: 'Digits (padding)', type: 'number' },
            { key: 'separator', label: 'Separator', placeholder: '-' },
            { key: 'include_year', label: 'Include year', type: 'checkbox' }, { key: 'is_active', label: 'Active', type: 'checkbox' },
          ]} addLabel="Add Series" />
      )}
    </>
  )
}
