import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts'
import {
  Users2, Target, FileText, ClipboardList, Download, Plus, Sparkles, ArrowUpRight,
} from 'lucide-react'
import { PageHeader, KpiCard, ChartCard } from '../components/ui.jsx'
import { useData } from '../store/DataContext.jsx'
import { sar } from '../data/mockData.js'

const SRC_COLORS = ['#0EA99A', '#6366f1', '#E0A82E', '#94a3b8', '#ef4444', '#22c55e']
const STATUS_COLORS = { Open: '#3b82f6', Ordered: '#0EA99A', Lost: '#ef4444', Expired: '#f59e0b', Draft: '#94a3b8', 'Pending Approval': '#a855f7', Approved: '#22c55e' }

function TooltipBox({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-card">
      <p className="mb-1 text-xs font-semibold text-ink">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-xs text-slate-500">
          <span className="inline-block h-2 w-2 rounded-full mr-1.5" style={{ background: p.color || p.fill }} />
          {p.name}: <span className="font-semibold text-ink">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

const groupCount = (arr, key) => Object.entries(arr.reduce((a, x) => { const k = x[key] || 'Other'; a[k] = (a[k] || 0) + 1; return a }, {}))

export default function SalesDashboard() {
  const { openForm, leads, opportunities, quotations, salesOrders, invoices } = useData()

  const openOpps = opportunities.filter((o) => !['Won', 'Lost'].includes(o.stage))
  const wonOpps = opportunities.filter((o) => o.stage === 'Won').length
  const pipelineValue = openOpps.reduce((s, o) => s + (o.value || 0), 0)
  const wonValue = salesOrders.reduce((s, o) => s + (o.amount || 0), 0)
  const oppSub = opportunities.length
    ? `${openOpps.length} open · ${wonOpps} won`
    : 'none yet'

  const kpis = [
    { key: 'leads', label: 'Leads', value: String(leads.length), sub: 'total captured', accent: 'brand', icon: Users2 },
    { key: 'opps', label: 'Opportunities', value: String(opportunities.length), sub: oppSub, accent: 'violet', icon: Target },
    { key: 'quotes', label: 'Quotations', value: String(quotations.length), sub: 'created', accent: 'gold', icon: FileText },
    { key: 'orders', label: 'Sales Orders', value: String(salesOrders.length), sub: `${sar(wonValue)} won`, accent: 'emerald', icon: ClipboardList },
  ]

  const pipelineFunnel = [
    { stage: 'Leads', value: leads.length, fill: '#0EA99A' },
    { stage: 'Opportunities', value: opportunities.length, fill: '#2bb6a6' },
    { stage: 'Quotations', value: quotations.length, fill: '#5fcabd' },
    { stage: 'Orders', value: salesOrders.length, fill: '#E0A82E' },
  ]
  const maxFunnel = Math.max(1, ...pipelineFunnel.map((s) => s.value))

  const quotationStatus = groupCount(quotations, 'status').map(([name, value]) => ({ name, value, color: STATUS_COLORS[name] || '#94a3b8' }))
  const leadSources = groupCount(leads, 'source').map(([name, value], i) => ({ name, value, color: SRC_COLORS[i % SRC_COLORS.length] }))
  // Outstanding is NOT a stored column — derive it from real unpaid invoice balances,
  // grouped per customer. (Invoices live in the finance panel: absent for pure sales roles ⇒
  // honest empty state below, never fabricated zero-height bars.)
  const outstandingByCustomer = invoices.reduce((acc, inv) => {
    const bal = (Number(inv.total) || 0) - (Number(inv.paid) || 0)
    if (bal > 0 && inv.customer) acc[inv.customer] = (acc[inv.customer] || 0) + bal
    return acc
  }, {})
  const topCustomers = Object.entries(outstandingByCustomer)
    .map(([name, bal]) => ({ name, bal, value: Math.round(bal / 1000) }))
    .sort((a, b) => b.bal - a.bal)
    .slice(0, 5)

  const empty = leads.length + opportunities.length + quotations.length + salesOrders.length === 0

  return (
    <>
      <PageHeader title="Sales Dashboard" subtitle="Live overview of your sales pipeline & performance">
        <button className="btn-ghost"><Download size={16} /> Export</button>
        <button className="btn-primary" onClick={() => openForm('lead')}><Plus size={16} /> New Lead</button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => <KpiCard key={k.key} {...k} />)}
      </div>

      {empty && (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-400">
          No sales data yet. Create a lead, opportunity or quotation to see it here.
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title="Sales Pipeline" subtitle="Conversion through stages" className="xl:col-span-1">
          <div className="space-y-3">
            {pipelineFunnel.map((s) => (
              <div key={s.stage}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium text-slate-600">{s.stage}</span>
                  <span className="font-semibold text-ink">{s.value}</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-slate-100">
                  <div className="h-2.5 rounded-full" style={{ width: `${(s.value / maxFunnel) * 100}%`, background: s.fill }} />
                </div>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Quotation Status" subtitle="Breakdown by outcome">
          {quotationStatus.length ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={quotationStatus} dataKey="value" nameKey="name" innerRadius={54} outerRadius={84} paddingAngle={3} stroke="none" isAnimationActive={false}>
                    {quotationStatus.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {quotationStatus.map((d) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                    <span className="text-slate-500">{d.name}</span>
                    <span className="ml-auto font-semibold text-ink">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <p className="py-10 text-center text-sm text-slate-400">No quotations yet</p>}
        </ChartCard>

        <ChartCard title="Lead Sources" subtitle="Where leads come from">
          {leadSources.length ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={leadSources} dataKey="value" nameKey="name" outerRadius={84} stroke="none" isAnimationActive={false}>
                    {leadSources.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {leadSources.map((d) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                    <span className="text-slate-500">{d.name}</span>
                    <span className="ml-auto font-semibold text-ink">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <p className="py-10 text-center text-sm text-slate-400">No leads yet</p>}
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title="Top Customers" subtitle="By outstanding balance (SAR '000)" className="xl:col-span-2">
          {topCustomers.length ? (
            <ResponsiveContainer width="100%" height={232}>
              <BarChart data={topCustomers} layout="vertical" margin={{ left: 36, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis type="category" dataKey="name" width={120} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip cursor={{ fill: '#f8fafc' }} content={<TooltipBox />} />
                <Bar dataKey="value" name="Outstanding" radius={[0, 6, 6, 0]} barSize={16} fill="#0EA99A" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="py-12 text-center text-sm text-slate-400">{invoices.length ? 'No outstanding balances' : 'No invoice data available'}</p>}
        </ChartCard>

        <div className="card card-pad relative overflow-hidden animate-fade-up bg-gradient-to-br from-navy-800 to-navy-900 text-white">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-brand-500/20 blur-2xl" />
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-gold-400" />
            <h3 className="text-[15px] font-bold">Sales Snapshot</h3>
            <span className="chip bg-white/10 text-brand-300 ml-auto">Live</span>
          </div>
          <ul className="mt-4 space-y-3 text-sm text-slate-200/90">
            <li className="rounded-xl bg-white/5 p-3 flex items-center gap-2"><ArrowUpRight size={15} className="text-brand-300" /> Pipeline value: <b className="ml-auto">{sar(pipelineValue)}</b></li>
            <li className="rounded-xl bg-white/5 p-3 flex items-center gap-2"><ArrowUpRight size={15} className="text-brand-300" /> Won (orders): <b className="ml-auto">{sar(wonValue)}</b></li>
            <li className="rounded-xl bg-white/5 p-3 flex items-center gap-2"><ArrowUpRight size={15} className="text-brand-300" /> Conversion: <b className="ml-auto">{leads.length ? Math.round((salesOrders.length / leads.length) * 100) : 0}%</b></li>
          </ul>
        </div>
      </div>
    </>
  )
}
