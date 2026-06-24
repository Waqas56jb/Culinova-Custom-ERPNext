import { useState } from 'react'
import { Search } from 'lucide-react'
import { PageHeader, Badge } from '../components/ui.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'

const statusOf = (it) => (it.qty === 0 ? { t: 'Out of Stock', tone: 'red' } : it.qty <= it.reorder ? { t: 'Low Stock', tone: 'amber' } : { t: 'In Stock', tone: 'green' })

export default function StockItems() {
  const { stockItems } = useData()
  const [q, setQ] = useState('')
  const [g, setG] = useState('All')
  const groups = ['All', ...new Set(stockItems.map((it) => it.group))]
  const rows = stockItems.filter((it) => (g === 'All' || it.group === g) && (it.name + it.code).toLowerCase().includes(q.toLowerCase()))
  const totalValue = rows.reduce((s, it) => s + it.qty * it.rate, 0)

  return (
    <>
      <PageHeader title="Stock / Items" subtitle="Live inventory balance & valuation" />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Items" value={rows.length} tone="text-ink" />
        <Stat label="Stock Value" value={sar(totalValue)} tone="text-brand-600" />
        <Stat label="Low Stock" value={stockItems.filter((it) => it.qty > 0 && it.qty <= it.reorder).length} tone="text-amber-600" />
        <Stat label="Out of Stock" value={stockItems.filter((it) => it.qty === 0).length} tone="text-rose-600" />
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center">
          <div className="flex flex-wrap gap-1.5">
            {groups.map((x) => (
              <button key={x} onClick={() => setG(x)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${g === x ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{x}</button>
            ))}
          </div>
          <div className="relative sm:ml-auto sm:w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items…" className="w-full rounded-lg border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:bg-white" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">Code</th><th className="th">Item</th><th className="th">Group</th><th className="th">Warehouse</th>
              <th className="th">On Hand</th><th className="th">Rate</th><th className="th">Value</th><th className="th">Status</th>
            </tr></thead>
            <tbody>
              {rows.map((it) => {
                const st = statusOf(it)
                return (
                  <tr key={it.code} className="hover:bg-slate-50/60">
                    <td className="td font-semibold text-brand-600">{it.code}</td>
                    <td className="td font-medium text-ink">{it.name}</td>
                    <td className="td text-slate-500">{it.group}</td>
                    <td className="td text-slate-500">{it.warehouse}</td>
                    <td className="td font-semibold">{it.qty} {it.uom}</td>
                    <td className="td text-slate-600">{sar(it.rate)}</td>
                    <td className="td font-semibold">{sar(it.qty * it.rate)}</td>
                    <td className="td"><Badge tone={st.tone}>{st.t}</Badge></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function Stat({ label, value, tone }) {
  return <div className="card card-pad animate-fade-up"><p className="text-xs text-muted">{label}</p><p className={`mt-1 text-2xl font-extrabold ${tone}`}>{value}</p></div>
}
