import { Wallet, CheckCircle2 } from 'lucide-react'
import { PageHeader, Badge } from '../components/ui.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'

export default function Payroll() {
  const { employees, payrollStatus, runPayroll } = useData()
  const gross = employees.reduce((s, e) => s + e.salary, 0)
  const gosi = Math.round(gross * 0.1) // 10% social insurance (illustrative)
  const net = gross - gosi
  const paid = payrollStatus === 'Paid'

  return (
    <>
      <PageHeader title="Payroll" subtitle="Monthly salary run">
        {!paid ? (
          <button className="btn-primary" onClick={runPayroll}><Wallet size={16} /> Run Payroll</button>
        ) : <span className="chip bg-emerald-50 text-emerald-600"><CheckCircle2 size={13} /> Payroll Paid</span>}
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Employees" value={employees.length} tone="text-ink" />
        <Stat label="Gross Salary" value={sar(gross)} tone="text-brand-600" />
        <Stat label="GOSI (10%)" value={sar(gosi)} tone="text-amber-600" />
        <Stat label="Net Payable" value={sar(net)} tone="text-emerald-600" />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">Employee</th><th className="th">Department</th><th className="th">Gross</th><th className="th">GOSI</th><th className="th">Net Pay</th><th className="th">Status</th>
            </tr></thead>
            <tbody>
              {employees.map((e) => {
                const g = Math.round(e.salary * 0.1)
                return (
                  <tr key={e.id} className="hover:bg-slate-50/60">
                    <td className="td font-medium text-ink">{e.name}</td>
                    <td className="td text-slate-500">{e.dept}</td>
                    <td className="td font-semibold">{sar(e.salary)}</td>
                    <td className="td text-slate-500">{sar(g)}</td>
                    <td className="td font-semibold">{sar(e.salary - g)}</td>
                    <td className="td"><Badge tone={paid ? 'green' : 'gray'}>{paid ? 'Paid' : 'Pending'}</Badge></td>
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
