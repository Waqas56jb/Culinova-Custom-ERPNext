import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts'
import { FileText, ShoppingCart, Truck, Users2, Download } from 'lucide-react'
import { PageHeader, KpiCard, ChartCard, Badge, statusTone } from '../components/ui.jsx'
import { sar } from '../data/mockData.js'
import { spendTrend } from '../data/procurementData.js'
import { useData } from '../store/DataContext.jsx'

const poColors = { Pending: '#E0A82E', Received: '#0EA99A', Billed: '#6366f1' }

export default function ProcurementDashboard() {
  const { rfqs, purchaseOrders, suppliers } = useData()
  const openRfqs = rfqs.filter((r) => r.status !== 'Ordered').length
  const pendingPos = purchaseOrders.filter((p) => p.status === 'Pending').length
  const spend = purchaseOrders.reduce((s, p) => s + p.amount, 0)

  const poStatus = ['Pending', 'Received', 'Billed'].map((s) => ({ name: s, value: purchaseOrders.filter((p) => p.status === s).length, color: poColors[s] }))
  const topSuppliers = [...suppliers].sort((a, b) => b.totalPOs - a.totalPOs).slice(0, 5).map((s) => ({ name: s.name.split(' ')[0], pos: s.totalPOs }))

  return (
    <>
      <PageHeader title="Procurement Dashboard" subtitle="RFQs, purchase orders, suppliers & spend">
        <button className="btn-ghost"><Download size={16} /> Export</button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Open RFQs" value={openRfqs} sub="awaiting award" icon={FileText} accent="brand" />
        <KpiCard label="Pending POs" value={pendingPos} sub="to receive" icon={ShoppingCart} accent="gold" />
        <KpiCard label="Total Spend" value={sar(spend)} sub="this period" icon={Truck} accent="violet" />
        <KpiCard label="Active Suppliers" value={suppliers.length} sub="vendors" icon={Users2} accent="emerald" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title="Procurement Spend" subtitle="SAR '000 per month" className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={270}>
            <AreaChart data={spendTrend} margin={{ left: -16, right: 6, top: 6 }}>
              <defs><linearGradient id="sp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0EA99A" stopOpacity={0.3} /><stop offset="100%" stopColor="#0EA99A" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
              <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <Tooltip />
              <Area type="monotone" dataKey="spend" name="Spend" stroke="#0EA99A" strokeWidth={2.5} fill="url(#sp)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="PO Status" subtitle="Purchase order pipeline">
          <ResponsiveContainer width="100%" height={210}>
            <PieChart>
              <Pie data={poStatus} dataKey="value" nameKey="name" innerRadius={56} outerRadius={86} paddingAngle={3} stroke="none" isAnimationActive={false}>
                {poStatus.map((d) => <Cell key={d.name} fill={d.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {poStatus.map((d) => (
              <div key={d.name} className="text-center text-xs">
                <span className="mx-auto mb-1 block h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                <span className="text-slate-500">{d.name}</span><br /><span className="font-semibold text-ink">{d.value}</span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title="Top Suppliers" subtitle="By purchase orders" className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={topSuppliers} margin={{ left: -18, right: 6 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="pos" name="POs" radius={[6, 6, 0, 0]} barSize={26} fill="#0EA99A" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Recent Purchase Orders">
          <div className="divide-y divide-slate-100">
            {purchaseOrders.slice(0, 5).map((po) => (
              <div key={po.id} className="flex items-center gap-3 py-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600"><ShoppingCart size={16} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{po.id} · {sar(po.amount)}</p>
                  <p className="truncate text-xs text-muted">{po.item} · {po.project}</p>
                </div>
                <Badge tone={statusTone(po.status)}>{po.status}</Badge>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>
    </>
  )
}
