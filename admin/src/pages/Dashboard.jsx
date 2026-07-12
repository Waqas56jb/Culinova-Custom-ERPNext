import { useState, useEffect } from 'react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { Wallet, TrendingUp, FolderKanban, Users2, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PageHeader, KpiCard, ChartCard, Badge } from '../components/ui.jsx'
import { sar } from '../data/adminData.js'
import { api } from '../api.js'
import { useAdmin } from '../store/AdminContext.jsx'

const ZERO = { revenue: 0, netProfit: 0, procurementSpend: 0, receivables: 0, stockValue: 0, activeProjects: 0, totalProjects: 0, openTickets: 0, trend: [] }

export default function Dashboard() {
  const navigate = useNavigate()
  const { users } = useAdmin()
  const [c, setC] = useState(ZERO)
  const [mods, setMods] = useState([])

  useEffect(() => {
    api('/admin/company-stats').then((d) => setC({ ...ZERO, ...d })).catch(() => {})
    api('/admin/module-stats').then((m) => setMods(Array.isArray(m) ? m : [])).catch(() => {})
  }, [])

  return (
    <>
      <PageHeader title="Executive Dashboard" subtitle="Company-wide overview — all panels at a glance" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Revenue" value={sar(c.revenue)} sub="from sales orders" icon={Wallet} accent="brand" />
        <KpiCard label="Net (Rev − Procurement)" value={sar(c.netProfit)} sub="gross of costing" icon={TrendingUp} accent="emerald" />
        <KpiCard label="Active Projects" value={c.activeProjects} sub={`${c.totalProjects} total`} icon={FolderKanban} accent="violet" />
        <KpiCard label="Employees" value={users.length} sub="registered users" icon={Users2} accent="gold" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Stock Value', value: sar(c.stockValue) },
          { label: 'Procurement Spend', value: sar(c.procurementSpend) },
          { label: 'Receivables', value: sar(c.receivables) },
          { label: 'Open Tickets', value: c.openTickets },
        ].map((s) => (
          <div key={s.label} className="card card-pad animate-fade-up"><p className="text-xs text-muted">{s.label}</p><p className="mt-1 text-xl font-bold text-ink">{s.value}</p></div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title="Revenue & Net" subtitle="SAR '000 per month (last 6)" className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={c.trend} margin={{ left: -16, right: 6, top: 6 }}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0EA99A" stopOpacity={0.3} /><stop offset="100%" stopColor="#0EA99A" stopOpacity={0} /></linearGradient>
                <linearGradient id="pro" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#E0A82E" stopOpacity={0.25} /><stop offset="100%" stopColor="#E0A82E" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
              <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#0EA99A" strokeWidth={2.5} fill="url(#rev)" isAnimationActive={false} />
              <Area type="monotone" dataKey="profit" name="Net" stroke="#E0A82E" strokeWidth={2} fill="url(#pro)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="All Modules" subtitle="Live snapshot" action={<button onClick={() => navigate('/modules')} className="text-xs font-semibold text-brand-600">View all</button>}>
          <div className="space-y-2">
            {mods.slice(0, 6).map((m) => (
              <div key={m.name} className="flex items-center gap-3 rounded-xl border border-slate-100 p-2.5">
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{m.name}</p><p className="text-xs text-muted">{m.sub}</p></div>
                <span className="text-sm font-bold text-brand-600">{m.metric}</span>
              </div>
            ))}
            {mods.length === 0 && <p className="py-4 text-center text-sm text-muted">Loading…</p>}
          </div>
        </ChartCard>
      </div>

      <ChartCard title="Recent Registered Users" className="mt-4" action={<button onClick={() => navigate('/users')} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600">Manage <ArrowRight size={12} /></button>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead><tr className="bg-slate-50/60"><th className="th">User</th><th className="th">Designation</th><th className="th">Department</th><th className="th">Role</th><th className="th">Access</th></tr></thead>
            <tbody>
              {users.slice(0, 5).map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/60">
                  <td className="td font-medium text-ink">{u.name}</td>
                  <td className="td text-slate-600">{u.designation}</td>
                  <td className="td text-slate-500">{u.dept}</td>
                  <td className="td"><Badge tone="violet">{u.role}</Badge></td>
                  <td className="td"><Badge tone="blue">{u.access}</Badge></td>
                </tr>
              ))}
              {users.length === 0 && <tr><td className="td text-slate-400" colSpan={5}>No users.</td></tr>}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </>
  )
}
