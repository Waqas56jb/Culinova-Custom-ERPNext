import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts'
import { Building2, Truck, Wallet, TrendingUp, AlertTriangle } from 'lucide-react'
import { PageHeader, KpiCard, ChartCard, Badge } from '../components/ui.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'

const trackTone = { Received: 'green', 'Partially Received': 'blue', Pending: 'amber', Overdue: 'red' }
const scoreTone = (s) => (s == null ? 'gray' : s >= 85 ? 'green' : s >= 60 ? 'amber' : 'red')
const money = (n) => (n == null || Number.isNaN(Number(n)) ? '—' : sar(n))

export default function SupplierPerformance() {
  const { resList } = useData()
  const [tab, setTab] = useState('performance')
  const [perf, setPerf] = useState([])
  const [tracking, setTracking] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const [p, t] = await Promise.all([
        resList('procurement/supplier-performance').catch(() => []),
        resList('procurement/delivery-tracking').catch(() => []),
      ])
      setPerf(p || []); setTracking(t || [])
    } catch (e) { setErr(e.message || 'Failed to load') } finally { setLoading(false) }
  }, [resList])
  useEffect(() => { load() }, [load])

  const kpis = useMemo(() => {
    const active = perf.filter((s) => s.has_data)
    const totalValue = perf.reduce((s, x) => s + (Number(x.total_value) || 0), 0)
    const totalPos = perf.reduce((s, x) => s + (Number(x.total_pos) || 0), 0)
    const rated = perf.filter((s) => s.on_time_pct != null)
    const avgOnTime = rated.length ? Math.round(rated.reduce((s, x) => s + x.on_time_pct, 0) / rated.length) : null
    const outstanding = perf.reduce((s, x) => s + (Number(x.outstanding_value) || 0), 0)
    const overdue = tracking.filter((t) => t.status === 'Overdue').length
    return { activeSuppliers: active.length, totalValue, totalPos, avgOnTime, outstanding, overdue }
  }, [perf, tracking])

  // bar chart: on-time % by supplier (only those with real delivery data)
  const chartData = useMemo(() =>
    perf.filter((s) => s.on_time_pct != null)
      .sort((a, b) => b.on_time_pct - a.on_time_pct)
      .slice(0, 8)
      .map((s) => ({ name: s.supplier.length > 14 ? s.supplier.slice(0, 13) + '…' : s.supplier, onTime: s.on_time_pct })), [perf])

  return (
    <>
      <PageHeader title="Supplier Performance" subtitle="On-time delivery, lead time and outstanding value — computed from real purchase orders and goods receipts" />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Active Suppliers" value={kpis.activeSuppliers} sub={`${kpis.totalPos} POs placed`} icon={Building2} accent="brand" />
        <KpiCard label="Avg On-Time" value={kpis.avgOnTime == null ? 'No data' : `${kpis.avgOnTime}%`} sub="across rated suppliers" icon={TrendingUp} accent="emerald" />
        <KpiCard label="Total PO Value" value={sar(kpis.totalValue)} sub="all suppliers" icon={Wallet} accent="violet" />
        <KpiCard label="Overdue Deliveries" value={kpis.overdue} sub={money(kpis.outstanding) + ' outstanding'} icon={AlertTriangle} accent="gold" />
      </div>

      <div className="mb-4 flex gap-1.5 border-b border-slate-200">
        {[{ k: 'performance', label: 'Performance', icon: TrendingUp }, { k: 'tracking', label: `Delivery Tracking (${tracking.length})`, icon: Truck }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition ${tab === t.k ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-ink'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {err && <p className="mb-3 text-sm font-semibold text-rose-600">{err}</p>}

      {tab === 'performance' && (
        <div className="space-y-4">
          <ChartCard title="On-Time Delivery by Supplier" subtitle="% of received POs delivered on/before the expected date">
            {chartData.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">No delivery history yet. On-time rates appear once purchase orders are received against an expected date.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ left: -18, right: 6, top: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} interval={0} angle={-12} textAnchor="end" height={50} />
                  <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} unit="%" />
                  <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(v) => [`${v}%`, 'On-time']} />
                  <Bar dataKey="onTime" name="On-time %" radius={[6, 6, 0, 0]} barSize={30} isAnimationActive={false}>
                    {chartData.map((d, i) => <Cell key={i} fill={d.onTime >= 85 ? '#10b981' : d.onTime >= 60 ? '#f59e0b' : '#ef4444'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px]">
                <thead><tr className="bg-slate-50/60">
                  <th className="th">Supplier</th><th className="th">Category</th><th className="th">POs</th><th className="th">Total Value</th>
                  <th className="th">Received</th><th className="th">On-Time</th><th className="th">Avg Lead</th>
                  <th className="th">Outstanding</th><th className="th">Score</th>
                </tr></thead>
                <tbody>
                  {loading && <tr><td className="td text-muted" colSpan={9}>Loading supplier performance…</td></tr>}
                  {!loading && perf.length === 0 && <tr><td className="td text-muted" colSpan={9}>No suppliers on file. Add suppliers and place purchase orders to see performance.</td></tr>}
                  {perf.map((s) => (
                    <tr key={s.supplier} className="hover:bg-slate-50/60">
                      <td className="td font-semibold text-ink">{s.supplier}</td>
                      <td className="td text-muted">{s.category || '—'}</td>
                      <td className="td text-slate-600">{s.total_pos}</td>
                      <td className="td text-slate-600">{s.has_data ? sar(s.total_value) : '—'}</td>
                      <td className="td text-slate-600">{s.has_data ? `${s.received_pos}/${s.total_pos}` : '—'}</td>
                      <td className="td">{s.on_time_pct == null ? <span className="text-xs text-muted">no data</span> : <Badge tone={scoreTone(s.on_time_pct)}>{s.on_time_pct}%</Badge>}</td>
                      <td className="td text-slate-600">{s.avg_lead_time_days == null ? '—' : `${s.avg_lead_time_days} d`}</td>
                      <td className="td text-slate-600">{s.has_data ? money(s.outstanding_value) : '—'}</td>
                      <td className="td">{s.score == null ? <span className="text-xs text-muted">—</span> : <span className={`font-bold ${scoreTone(s.score) === 'green' ? 'text-emerald-600' : scoreTone(s.score) === 'amber' ? 'text-amber-600' : 'text-rose-600'}`}>{s.score}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-muted">Suppliers with no purchase orders show honest zeros. On-time %, lead time and score are derived only from received purchase orders — never invented.</p>
        </div>
      )}

      {tab === 'tracking' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead><tr className="bg-slate-50/60">
                <th className="th">PO</th><th className="th">Supplier</th><th className="th">Item</th><th className="th">Project</th>
                <th className="th">Ordered</th><th className="th">Received</th><th className="th">Outstanding</th>
                <th className="th">Expected</th><th className="th">Status</th>
              </tr></thead>
              <tbody>
                {loading && <tr><td className="td text-muted" colSpan={9}>Loading delivery tracking…</td></tr>}
                {!loading && tracking.length === 0 && <tr><td className="td text-muted" colSpan={9}>No open purchase orders. Allocate an approved requisition to suppliers to create POs.</td></tr>}
                {tracking.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/60">
                    <td className="td font-semibold text-brand-600">{t.number}</td>
                    <td className="td text-slate-600">{t.supplier || '—'}</td>
                    <td className="td font-medium text-ink">{t.item_name || '—'}</td>
                    <td className="td"><span className="text-xs font-semibold text-violet-600">{t.project_name || '—'}</span></td>
                    <td className="td text-slate-600">{t.ordered_qty}</td>
                    <td className="td text-slate-600">{t.received_qty}</td>
                    <td className="td font-semibold text-ink">{t.outstanding_qty}</td>
                    <td className="td text-slate-600">{t.expected_date || '—'}</td>
                    <td className="td"><Badge tone={trackTone[t.status] || 'gray'}>{t.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
