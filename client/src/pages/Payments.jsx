import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { PageHeader } from '../components/ui.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'

export default function Payments() {
  const { payments } = useData()
  const received = payments.filter((p) => p.type === 'Received').reduce((s, p) => s + p.amount, 0)
  const paid = payments.filter((p) => p.type === 'Paid').reduce((s, p) => s + p.amount, 0)

  return (
    <>
      <PageHeader title="Payments" subtitle="All money received & paid" />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Received (in)" value={sar(received)} tone="text-emerald-600" />
        <Stat label="Paid (out)" value={sar(paid)} tone="text-rose-600" />
        <Stat label="Net Cash" value={sar(received - paid)} tone="text-brand-600" />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">Payment</th><th className="th">Type</th><th className="th">Party</th><th className="th">Reference</th>
              <th className="th">Amount</th><th className="th">Mode</th><th className="th">Date</th>
            </tr></thead>
            <tbody>
              {payments.map((p) => {
                const inflow = p.type === 'Received'
                return (
                  <tr key={p.id} className="hover:bg-slate-50/60">
                    <td className="td font-semibold text-brand-600">{p.number}</td>
                    <td className="td">
                      <span className={`chip ${inflow ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                        {inflow ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />} {p.type}
                      </span>
                    </td>
                    <td className="td font-medium text-ink">{p.party}</td>
                    <td className="td text-slate-500">{p.reference || '—'}</td>
                    <td className={`td font-semibold ${inflow ? 'text-emerald-600' : 'text-rose-600'}`}>{inflow ? '+' : '−'}{sar(p.amount)}</td>
                    <td className="td text-slate-500">{p.mode}</td>
                    <td className="td text-slate-500">{p.date}</td>
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
