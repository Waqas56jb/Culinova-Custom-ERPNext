import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Legend,
} from 'recharts'
import { Boxes, Layers, Building2, AlertTriangle } from 'lucide-react'
import { PageHeader, KpiCard, ChartCard, Badge } from '../components/ui.jsx'
import { sar } from '../data/mockData.js'
import { stockMovement } from '../data/stockData.js'
import { useData } from '../store/DataContext.jsx'

export default function StockDashboard() {
  const { stockItems, warehouses } = useData()
  const totalValue = stockItems.reduce((s, it) => s + it.qty * it.rate, 0)
  const low = stockItems.filter((it) => it.qty > 0 && it.qty <= it.reorder)
  const out = stockItems.filter((it) => it.qty === 0)

  const byGroup = Object.values(stockItems.reduce((acc, it) => {
    acc[it.group] = acc[it.group] || { name: it.group, value: 0 }
    acc[it.group].value += Math.round((it.qty * it.rate) / 1000)
    return acc
  }, {}))

  return (
    <>
      <PageHeader title="Stock Dashboard" subtitle="Inventory value, movement & reorder alerts" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Stock Value" value={sar(totalValue)} sub={`${stockItems.length} items`} icon={Boxes} accent="brand" />
        <KpiCard label="Stock Items" value={stockItems.length} sub="active SKUs" icon={Layers} accent="violet" />
        <KpiCard label="Warehouses" value={warehouses.length} sub="locations" icon={Building2} accent="emerald" />
        <KpiCard label="Low / Out of Stock" value={low.length + out.length} sub="need reorder" icon={AlertTriangle} accent="gold" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title="Stock Movement" subtitle="Units in vs out per month" className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={270}>
            <AreaChart data={stockMovement} margin={{ left: -18, right: 6, top: 6 }}>
              <defs>
                <linearGradient id="in" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0EA99A" stopOpacity={0.3} /><stop offset="100%" stopColor="#0EA99A" stopOpacity={0} /></linearGradient>
                <linearGradient id="out" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#E0A82E" stopOpacity={0.25} /><stop offset="100%" stopColor="#E0A82E" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
              <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="inq" name="In" stroke="#0EA99A" strokeWidth={2.5} fill="url(#in)" isAnimationActive={false} />
              <Area type="monotone" dataKey="out" name="Out" stroke="#E0A82E" strokeWidth={2} fill="url(#out)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Stock Value by Group" subtitle="SAR '000">
          <ResponsiveContainer width="100%" height={270}>
            <BarChart data={byGroup} layout="vertical" margin={{ left: 30, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" horizontal={false} />
              <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis type="category" dataKey="name" width={86} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
              <Tooltip cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="value" name="Value" radius={[0, 6, 6, 0]} barSize={16} fill="#0EA99A" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Reorder Watchlist — Low & Out of Stock" className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">Item</th><th className="th">Warehouse</th><th className="th">On Hand</th><th className="th">Reorder Level</th><th className="th">Status</th>
            </tr></thead>
            <tbody>
              {[...out, ...low].map((it) => (
                <tr key={it.code} className="hover:bg-slate-50/60">
                  <td className="td font-medium text-ink">{it.name}</td>
                  <td className="td text-slate-500">{it.warehouse}</td>
                  <td className="td font-semibold">{it.qty} {it.uom}</td>
                  <td className="td text-slate-500">{it.reorder}</td>
                  <td className="td"><Badge tone={it.qty === 0 ? 'red' : 'amber'}>{it.qty === 0 ? 'Out of Stock' : 'Low Stock'}</Badge></td>
                </tr>
              ))}
              {out.length + low.length === 0 && <tr><td className="td text-slate-400" colSpan={5}>All items above reorder level ✓</td></tr>}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </>
  )
}
