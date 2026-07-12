import { useState } from 'react'
import { Search } from 'lucide-react'
import { PageHeader, Badge } from '../components/ui.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'

const statusOf = (it) => (it.available <= 0 ? { t: 'Out of Stock', tone: 'red' } : it.available <= it.reorder ? { t: 'Low Stock', tone: 'amber' } : { t: 'In Stock', tone: 'green' })

export default function StockItems() {
  const { stockItems, items } = useData()
  const [q, setQ] = useState('')
  const [g, setG] = useState('All')
  const groups = ['All', ...new Set(stockItems.map((it) => it.group))]
  const rows = stockItems.filter((it) => (g === 'All' || it.group === g) && (it.name + it.code).toLowerCase().includes(q.toLowerCase()))
  // Valuation basis = COST (accounting-correct), matching StockDashboard — NOT the selling rate.
  // Cost lives on the Item Master; join by item name (same join StockDashboard uses). Cost is
  // redacted (undefined) for non-financial roles → we show '—' rather than ever falling back to a
  // selling-price number, so the two pages report ONE consistent stock value.
  const itemByName = {}
  for (const i of items || []) { const k = (i.item_name || '').toLowerCase(); if (!(k in itemByName)) itemByName[k] = i }
  const costVisible = (items || []).some((i) => i.cost != null)
  const valueOf = (it) => {
    if (!costVisible) return null
    const im = itemByName[(it.name || '').toLowerCase()]
    return it.physical * (Number(im?.cost) || Number(im?.standard_rate) || 0)
  }
  const totalValue = costVisible ? rows.reduce((s, it) => s + (valueOf(it) || 0), 0) : null

  return (
    <>
      <PageHeader title="Stock / Items" subtitle="Live inventory balance & valuation" />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Stock Value" value={totalValue == null ? '—' : sar(totalValue)} tone="text-brand-600" />
        <Stat label="Reserved (units)" value={stockItems.reduce((s, it) => s + (it.reserved || 0), 0)} tone="text-violet-600" />
        <Stat label="Available (units)" value={stockItems.reduce((s, it) => s + (it.available || 0), 0)} tone="text-emerald-600" />
        <Stat label="Low / Out" value={stockItems.filter((it) => it.available <= it.reorder).length} tone="text-amber-600" />
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
          <table className="w-full min-w-[1080px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">Code</th><th className="th">Item</th><th className="th">Warehouse</th>
              <th className="th">Physical</th><th className="th">Reserved</th><th className="th">Available</th><th className="th">Incoming</th>
              <th className="th">Aging</th><th className="th">Value</th><th className="th">Status</th>
            </tr></thead>
            <tbody>
              {rows.map((it) => {
                const st = statusOf(it)
                const val = valueOf(it)
                return (
                  <tr key={it.code} className="hover:bg-slate-50/60">
                    <td className="td font-semibold text-brand-600">{it.code}</td>
                    <td className="td font-medium text-ink">{it.name}<span className="block text-[11px] text-muted">{it.group}</span></td>
                    <td className="td text-slate-500">{it.warehouse}</td>
                    <td className="td font-semibold">{it.physical} {it.uom}</td>
                    <td className="td font-semibold text-violet-600">{it.reserved}</td>
                    <td className="td font-bold text-emerald-600">{it.available}</td>
                    <td className="td text-blue-600">{it.incoming}</td>
                    <td className="td text-slate-500">{it.aging}d</td>
                    <td className="td font-semibold">{val == null ? '—' : sar(val)}</td>
                    <td className="td"><Badge tone={st.tone}>{st.t}</Badge></td>
                  </tr>
                )
              })}
              {rows.length === 0 && <tr><td className="td text-slate-400" colSpan={10}>No stock balances yet. Add items + stock to see live availability.</td></tr>}
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
