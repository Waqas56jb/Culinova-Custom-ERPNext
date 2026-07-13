import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, AreaChart, Area, Legend,
} from 'recharts'
import { FolderKanban, Wallet, TrendingUp, AlertTriangle, Download } from 'lucide-react'
import { PageHeader, KpiCard, ChartCard, Badge, statusTone } from '../components/ui.jsx'
import { sar } from '../data/mockData.js'
import { gpOf, gpPctOf, hasCost } from '../data/projectData.js'
import { monthly } from '../data/agg.js'
import { useData } from '../store/DataContext.jsx'

const statusColors = { 'On Track': '#0EA99A', 'At Risk': '#E0A82E', Delayed: '#ef4444', Completed: '#3b82f6' }

// RFC-4180 escaping — a customer named `Al Faisal, Co "KSA"` must not shred the CSV.
const csvCell = (v) => {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const toCsv = (headers, rows) => [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')

export default function ProjectDashboard() {
  const { projects } = useData()
  const active = projects.filter((p) => p.status !== 'Completed').length
  const totalCV = projects.reduce((s, p) => s + p.contractValue, 0)
  // GP is only real once a cost has actually been BOOKED on the project (BOQ / equipment / supplier
  // invoice). Until then committed_cost & actual_cost are a legitimate 0 — subtracting that from the
  // contract would fabricate a confident 100% margin. hasCost() gates on a cost > 0, so an unpriced
  // portfolio renders '—' with an honest hint instead of a made-up number.
  const costProjects = projects.filter(hasCost)
  const costBooked = costProjects.length > 0
  const totalGP = costProjects.reduce((s, p) => s + (gpOf(p) || 0), 0)
  const gpBase = costProjects.reduce((s, p) => s + p.contractValue, 0)
  const avgGP = gpBase > 0 ? Math.round((totalGP / gpBase) * 100) : null
  const delayed = projects.filter((p) => p.status === 'Delayed').length
  // billed / collected are written by the server from REAL invoices (recomputeProject) — 0 until an
  // invoice exists. That 0 is a fact, not a placeholder, so it is shown as SAR 0 with a why-hint.
  const totalBilled = projects.reduce((s, p) => s + p.billed, 0)
  const totalCollected = projects.reduce((s, p) => s + p.collected, 0)
  const totalCommitted = costProjects.reduce((s, p) => s + p.committedCost, 0)
  const avgProgress = projects.length ? Math.round(projects.reduce((s, p) => s + p.progress, 0) / projects.length) : 0

  const short = (p) => String(p.ref || p.number || '').replace('PRJ-', '#') || (p.name || '').slice(0, 10)
  const statusDist = ['On Track', 'At Risk', 'Delayed', 'Completed'].map((s) => ({
    name: s, value: projects.filter((p) => p.status === s).length, color: statusColors[s],
  }))
  const budgetVsActual = projects.map((p) => ({ name: short(p), budget: Math.round(p.contractValue / 1000), actual: hasCost(p) ? Math.round(p.actualCost / 1000) : null }))
  // only projects with a booked cost produce a GP bar; empty ⇒ honest "no cost booked" state
  const profitability = costProjects.map((p) => ({ name: short(p), gp: gpPctOf(p) }))
  // live "projects started" trend (real monthly count) — replaces the empty planned-vs-actual mock series
  const progressTrend = monthly(projects, { count: true }).map((b) => ({ m: b.m, started: b.v }))

  // Export exactly what this page shows, for every project in the portfolio. An unknown GP exports as
  // an EMPTY cell — never as 0 — so the spreadsheet cannot fabricate a margin either.
  const exportCsv = () => {
    if (!projects.length) return
    const headers = ['Project', 'Name', 'Customer', 'Status', 'Progress %', 'Contract Value (SAR)', 'Committed Cost (SAR)', 'Actual Cost (SAR)', 'Billed (SAR)', 'Collected (SAR)', 'Gross Profit (SAR)', 'GP %']
    const rows = projects.map((p) => {
      const known = hasCost(p)
      const gp = gpOf(p)
      const gpPct = gpPctOf(p)
      return [
        p.ref || p.number || p.id, p.name || '', p.customer || '', p.status || '', p.progress ?? 0,
        p.contractValue ?? 0,
        known ? p.committedCost ?? 0 : '',
        known ? p.actualCost ?? 0 : '',
        p.billed ?? 0, p.collected ?? 0,
        gp == null ? '' : gp,
        gpPct == null ? '' : gpPct,
      ]
    })
    // BOM so Excel opens the Arabic/customer names as UTF-8
    const blob = new Blob(['﻿' + toCsv(headers, rows)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `projects-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <PageHeader title="Project Dashboard" subtitle="Live health, cost & profitability · projects are auto-created from confirmed Sales Orders">
        <button className="btn-ghost" onClick={exportCsv} disabled={!projects.length}
          title={projects.length ? `Download all ${projects.length} project(s) as CSV` : 'No projects to export'}>
          <Download size={16} /> Export
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Active Projects" value={active} sub={`${projects.length} total`} icon={FolderKanban} accent="brand" />
        <KpiCard label="Total Contract Value" value={sar(totalCV)} sub="all projects" icon={Wallet} accent="violet" />
        <KpiCard label="Avg Gross Profit" value={avgGP == null ? '—' : `${avgGP}%`}
          sub={avgGP == null ? 'no cost booked yet — margin unknown' : `${sar(totalGP)} on ${costProjects.length} costed project(s)`}
          icon={TrendingUp} accent="emerald" />
        <KpiCard label="Delayed Projects" value={delayed} sub="need attention" icon={AlertTriangle} accent="gold" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Total Billed', value: sar(totalBilled), hint: totalBilled === 0 ? 'no invoices issued yet' : null },
          { label: 'Collected', value: sar(totalCollected), hint: totalCollected === 0 ? 'no payments received yet' : null },
          { label: 'Committed Cost', value: costBooked ? sar(totalCommitted) : '—', hint: costBooked ? null : 'no cost booked yet' },
          { label: 'Avg Progress', value: `${avgProgress}%`, hint: null },
        ].map((s) => (
          <div key={s.label} className="card card-pad animate-fade-up">
            <p className="text-xs text-muted">{s.label}</p>
            <p className="mt-1 text-xl font-bold text-ink">{s.value}</p>
            {s.hint && <p className="mt-0.5 text-[11px] text-muted">{s.hint}</p>}
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title="Budget vs Actual Cost" subtitle={costBooked ? "SAR '000 per project" : "SAR '000 per project · actual cost appears once cost is booked"} className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={budgetVsActual} margin={{ left: -16, right: 6, top: 6 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <Tooltip cursor={{ fill: '#f8fafc' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="budget" name="Contract Value" radius={[6, 6, 0, 0]} barSize={18} fill="#0EA99A" isAnimationActive={false} />
              {costBooked && <Bar dataKey="actual" name="Actual Cost" radius={[6, 6, 0, 0]} barSize={18} fill="#E0A82E" isAnimationActive={false} />}
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
          {profitability.length ? (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={profitability} margin={{ left: -18, right: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="gp" name="GP %" radius={[6, 6, 0, 0]} barSize={22} fill="#6366f1" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="grid h-[230px] place-items-center px-4 text-center">
              <p className="text-sm text-slate-400">
                No cost has been booked on any project yet, so gross profit cannot be computed.
                <span className="mt-1 block text-xs">Add BOQ / equipment lines or post supplier invoices — GP appears as soon as a real cost lands.</span>
              </p>
            </div>
          )}
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
      <ChartCard title="Watchlist — Delayed & At-Risk Projects" subtitle={costBooked ? undefined : "GP shows '—' until a cost is booked on the project"} className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">Project</th><th className="th">Customer</th><th className="th">Progress</th><th className="th">GP %</th><th className="th">Status</th>
            </tr></thead>
            <tbody>
              {projects.filter((p) => p.status === 'Delayed' || p.status === 'At Risk').map((p) => {
                const gp = gpPctOf(p)
                return (
                  <tr key={p.id} className="hover:bg-slate-50/60">
                    <td className="td font-semibold text-brand-600">{p.ref || p.number || p.id}</td>
                    <td className="td text-ink">{p.customer}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${p.progress}%` }} /></div>
                        <span className="text-xs text-muted">{p.progress}%</span>
                      </div>
                    </td>
                    <td className="td font-semibold" title={gp == null ? 'No cost booked on this project yet' : undefined}>{gp == null ? '—' : `${gp}%`}</td>
                    <td className="td"><Badge tone={statusTone(p.status)}>{p.status}</Badge></td>
                  </tr>
                )
              })}
              {projects.filter((p) => p.status === 'Delayed' || p.status === 'At Risk').length === 0 && (
                <tr><td className="td text-slate-400" colSpan={5}>No delayed or at-risk projects.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </>
  )
}
