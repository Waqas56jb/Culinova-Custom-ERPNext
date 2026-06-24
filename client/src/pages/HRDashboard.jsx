import { useNavigate } from 'react-router-dom'
import { Users2, UserCheck, CalendarOff, Wallet } from 'lucide-react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
} from 'recharts'
import { PageHeader, KpiCard, ChartCard, Badge, statusTone } from '../components/ui.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'

const COLORS = ['#0EA99A', '#6366f1', '#E0A82E', '#3b82f6', '#0a8579', '#94a3b8']

export default function HRDashboard() {
  const navigate = useNavigate()
  const { employees, leaves } = useData()
  const present = employees.filter((e) => e.today === 'Present').length
  const onLeave = employees.filter((e) => e.today === 'On Leave').length
  const payroll = employees.reduce((s, e) => s + e.salary, 0)

  const byDept = Object.values(employees.reduce((acc, e) => {
    acc[e.dept] = acc[e.dept] || { name: e.dept, value: 0 }
    acc[e.dept].value += 1
    return acc
  }, {}))

  return (
    <>
      <PageHeader title="HR & Payroll Dashboard" subtitle="People, attendance & payroll" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Employees" value={employees.length} sub="across departments" icon={Users2} accent="brand" />
        <KpiCard label="Present Today" value={present} sub={`${employees.length - present} away`} icon={UserCheck} accent="emerald" />
        <KpiCard label="On Leave" value={onLeave} sub="today" icon={CalendarOff} accent="gold" />
        <KpiCard label="Monthly Payroll" value={sar(payroll)} sub="gross salaries" icon={Wallet} accent="violet" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title="Headcount by Department">
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie data={byDept} dataKey="value" nameKey="name" innerRadius={54} outerRadius={86} paddingAngle={3} stroke="none" isAnimationActive={false}>
                {byDept.map((d, i) => <Cell key={d.name} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-1 grid grid-cols-2 gap-1.5 text-xs">
            {byDept.map((d, i) => (
              <div key={d.name} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} /><span className="text-slate-500">{d.name}</span><span className="ml-auto font-semibold text-ink">{d.value}</span></div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Leave Requests" className="xl:col-span-2" action={<button onClick={() => navigate('/hr/attendance')} className="text-xs font-semibold text-brand-600">Manage</button>}>
          <div className="divide-y divide-slate-100">
            {leaves.map((l) => (
              <div key={l.id} className="flex items-center gap-3 py-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-navy-700 to-brand-600 text-[10px] font-bold text-white">{l.name.split(' ').map((n) => n[0]).join('')}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{l.name}</p><p className="text-xs text-muted">{l.type} · {l.from} → {l.to}</p></div>
                <Badge tone={statusTone(l.status === 'Approved' ? 'Approved' : 'Pending')}>{l.status}</Badge>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>
    </>
  )
}
