import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import { useData } from '../store/DataContext.jsx'

export default function Attendance() {
  const { employees, setAttendance, leaves, approveLeave } = useData()
  const present = employees.filter((e) => e.today === 'Present').length

  return (
    <>
      <PageHeader title="Attendance & Leave" subtitle="Mark today's attendance & approve leave" />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Present" value={present} tone="text-emerald-600" />
        <Stat label="Absent" value={employees.filter((e) => e.today === 'Absent').length} tone="text-rose-600" />
        <Stat label="On Leave" value={employees.filter((e) => e.today === 'On Leave').length} tone="text-amber-600" />
        <Stat label="Leave Requests" value={leaves.filter((l) => l.status === 'Pending').length} tone="text-blue-600" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="card overflow-hidden xl:col-span-2">
          <div className="border-b border-slate-100 p-4"><h3 className="font-bold text-ink">Today's Attendance</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead><tr className="bg-slate-50/60"><th className="th">Employee</th><th className="th">Department</th><th className="th">Status</th><th className="th">Mark</th></tr></thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/60">
                    <td className="td font-medium text-ink">{e.name}</td>
                    <td className="td text-slate-500">{e.department}</td>
                    <td className="td"><Badge tone={statusTone(e.today)}>{e.today}</Badge></td>
                    <td className="td">
                      <select value={e.today} onChange={(ev) => setAttendance(e.id, ev.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium outline-none focus:border-brand-400 focus:bg-white">
                        {['Present', 'Absent', 'On Leave'].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 p-4"><h3 className="font-bold text-ink">Leave Requests</h3></div>
          <div className="divide-y divide-slate-100">
            {leaves.map((l) => (
              <div key={l.id} className="p-4">
                <div className="flex items-center justify-between"><p className="text-sm font-semibold text-ink">{l.employee}</p><Badge tone={l.status === 'Approved' ? 'green' : 'amber'}>{l.status}</Badge></div>
                <p className="mt-0.5 text-xs text-muted">{l.type} · {l.from} → {l.to}</p>
                {l.status === 'Pending' && <button onClick={() => approveLeave(l.id)} className="btn-primary mt-2 !py-1.5 text-xs">Approve</button>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

function Stat({ label, value, tone }) {
  return <div className="card card-pad animate-fade-up"><p className="text-xs text-muted">{label}</p><p className={`mt-1 text-2xl font-extrabold ${tone}`}>{value}</p></div>
}
