import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, AreaChart, Area, Legend,
} from 'recharts'
import { FolderKanban, Wallet, TrendingUp, AlertTriangle, Download } from 'lucide-react'
import { PageHeader, KpiCard, ChartCard, Badge, statusTone } from '../components/ui.jsx'
import { sar } from '../data/mockData.js'
import { gpOf, gpPctOf } from '../data/projectData.js'
import { monthly } from '../data/agg.js'
import { useData } from '../store/DataContext.jsx'

const statusColors = { 'On Track': '#0EA99A', 'At Risk': '#E0A82E', Delayed: '#ef4444', Completed: '#3b82f6' }

export default function ProjectDashboard() {
  const { projects } = useData()
  const active = projects.filter((p) => p.status !== 'Completed').length
  const totalCV = projects.reduce((s, p) => s + p.contractValue, 0)
  const totalGP = projects.reduce((s, p) => s + gpOf(p), 0)
  const avgGP = totalCV > 0 ? Math.round((totalGP / totalCV) * 100) : 0
  const delayed = projects.filter((p) => p.status === 'Delayed').length
  const totalBilled = projects.reduce((s, p) => s + p.billed, 0)
  const totalCollected = projects.reduce((s, p) => s + p.collected, 0)
  const totalCommitted = projects.reduce((s, p) => s + p.committedCost, 0)
  const avgProgress = projects.length ? Math.round(projects.reduce((s, p) => s + p.progress, 0) / projects.length) : 0

  const short = (p) => String(p.ref || p.number || '').replace('PRJ-', '#') || (p.name || '').slice(0, 10)
  const statusDist = ['On Track', 'At Risk', 'Delayed', 'Completed'].map((s) => ({
    name: s, value: projects.filter((p) => p.status === s).length, color: statusColors[s],
  }))
  const budgetVsActual = projects.map((p) => ({ name: short(p), budget: Math.round(p.contractValue / 1000), actual: Math.round(p.actualCost / 1000) }))
  const profitability = projects.map((p) => ({ name: short(p), gp: gpPctOf(p) }))
  // live "projects started" trend (real monthly count) — replaces the empty planned-vs-actual mock series
  const progressTrend = monthly(projects, { count: true }).map((b) => ({ m: b.m, started: b.v }))

  return (
    <>
      <PageHeader title="Project Dashboard" subtitle="Live health, cost & profitability · projects are auto-created from confirmed Sales Orders">
        <button className="btn-ghost"><Download size={16} /> Export</button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Active Projects" value={active} sub={`${projects.length} total`} icon={FolderKanban} accent="brand" />
        <KpiCard label="Total Contract Value" value={sar(totalCV)} sub="all projects" icon={Wallet} accent="violet" />
        <KpiCard label="Avg Gross Profit" value={`${avgGP}%`} sub={sar(totalGP)} icon={TrendingUp} accent="emerald" />
        <KpiCard label="Delayed Projects" value={delayed} sub="need attention" icon={AlertTriangle} accent="gold" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Total Billed', value: sar(totalBilled) },
          { label: 'Collected', value: sar(totalCollected) },
          { label: 'Committed Cost', value: sar(totalCommitted) },
          { label: 'Avg Progress', value: `${avgProgress}%` },
        ].map((s) => (
          <div key={s.label} className="card card-pad animate-fade-up">
            <p className="text-xs text-muted">{s.label}</p>
            <p className="mt-1 text-xl font-bold text-ink">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title="Budget vs Actual Cost" subtitle="SAR '000 per project" className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={budgetVsActual} margin={{ left: -16, right: 6, top: 6 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <Tooltip cursor={{ fill: '#f8fafc' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="budget" name="Contract Value" radius={[6, 6, 0, 0]} barSize={18} fill="#0EA99A" isAnimationActive={false} />
              <Bar dataKey="actual" name="Actual Cost" radius={[6, 6, 0, 0]} barSize={18} fill="#E0A82E" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Project Status" subtitle="Distribution">
          <ResponsiveContainer width="100%" height={210}>
            <PieChart>
              <Pie data={statusDist} dataKey="value" nameKey="name" innerRadius={56} outerRadius={86} paddingAngle={3} stroke="none" isAnimationActive={false}>
                {statusDist.map((d) => <Cell key={d.name} fill={d.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {statusDist.map((d) => (
              <div key={d.name} className="flex items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                <span className="text-slate-500">{d.name}</span>
                <span className="ml-auto font-semibold text-ink">{d.value}</span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title="Profitability by Project" subtitle="Gross Profit %">
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={profitability} margin={{ left: -18, right: 6 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="gp" name="GP %" radius={[6, 6, 0, 0]} barSize={22} fill="#6366f1" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Projects Started" subtitle="New projects per month" className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={progressTrend} margin={{ left: -18, right: 6, top: 6 }}>
              <defs>
                <linearGradient id="pA" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0EA99A" stopOpacity={0.3} /><stop offset="100%" stopColor="#0EA99A" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
              <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="started" name="Projects Started" stroke="#0EA99A" strokeWidth={2.5} fill="url(#pA)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* delayed / at-risk watchlist */}
      <ChartCard title="Watchlist — Delayed & At-Risk Projects" className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">Project</th><th className="th">Customer</th><th className="th">Progress</th><th className="th">GP %</th><th className="th">Status</th>
            </tr></thead>
            <tbody>
              {projects.filter((p) => p.status === 'Delayed' || p.status === 'At Risk').map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/60">
                  <td className="td font-semibold text-brand-600">{p.id}</td>
                  <td className="td text-ink">{p.customer}</td>
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${p.progress}%` }} /></div>
                      <span className="text-xs text-muted">{p.progress}%</span>
                    </div>
                  </td>
                  <td className="td font-semibold">{gpPctOf(p)}%</td>
                  <td className="td"><Badge tone={statusTone(p.status)}>{p.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </>
  )
}
