import { useState } from 'react'
import { Plus, Search, Filter, ArrowRight } from 'lucide-react'
import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'

const filters = ['All', 'Open', 'Replied', 'Opportunity', 'Converted']

export default function Leads() {
  const { leads, openForm, convertLead } = useData()
  const [f, setF] = useState('All')
  const [q, setQ] = useState('')
  const rows = leads.filter(
    (l) =>
      (f === 'All' || l.status === f) &&
      ((l.name || '').toLowerCase().includes(q.toLowerCase()) || (l.company || '').toLowerCase().includes(q.toLowerCase())),
  )
  const total = leads.length
  const openCount = leads.filter((l) => l.status === 'Open').length
  const converted = leads.filter((l) => l.status === 'Converted').length
  const conversion = total ? Math.round((converted / total) * 100) : 0

  return (
    <>
      <PageHeader title="Leads" subtitle="Capture and qualify new enquiries">
        <button className="btn-primary" onClick={() => openForm('lead')}><Plus size={16} /> New Lead</button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total Leads" value={total} tone="text-ink" />
        <Stat label="Open" value={openCount} tone="text-blue-600" />
        <Stat label="Converted" value={converted} tone="text-emerald-600" />
        <Stat label="Conversion" value={`${conversion}%`} tone="text-brand-600" />
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center">
          <div className="flex flex-wrap gap-1.5">
            {filters.map((x) => (
              <button
                key={x}
                onClick={() => setF(x)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  f === x ? 'bg-brand-500 text-white shadow-soft' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {x}
              </button>
            ))}
          </div>
          <div className="relative sm:ml-auto sm:w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search leads…"
              className="w-full rounded-lg border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:bg-white"
            />
          </div>
          <button className="btn-ghost"><Filter size={15} /> Filters</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="bg-slate-50/60">
                <th className="th">Lead ID</th><th className="th">Contact</th><th className="th">Company</th>
                <th className="th">Source</th><th className="th">Est. Value</th><th className="th">Owner</th>
                <th className="th">Status</th><th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className="group hover:bg-slate-50/60">
                  <td className="td font-semibold text-brand-600">{l.id}</td>
                  <td className="td">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-navy-700 to-brand-600 text-[11px] font-bold text-white">
                        {l.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                      </span>
                      <span className="font-medium text-ink">{l.name}</span>
                    </div>
                  </td>
                  <td className="td">{l.company}</td>
                  <td className="td text-slate-500">{l.source}</td>
                  <td className="td font-semibold">{l.value ? sar(l.value) : '—'}</td>
                  <td className="td text-slate-500">{l.owner}</td>
                  <td className="td"><Badge tone={statusTone(l.status)}>{l.status}</Badge></td>
                  <td className="td">
                    <button onClick={() => convertLead(l)} className="flex items-center gap-1 text-xs font-semibold text-brand-600 opacity-0 transition group-hover:opacity-100">
                      Convert <ArrowRight size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function Stat({ label, value, tone }) {
  return (
    <div className="card card-pad animate-fade-up">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${tone}`}>{value}</p>
    </div>
  )
}
