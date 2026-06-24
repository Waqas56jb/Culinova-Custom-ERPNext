import { Coins, ShieldCheck } from 'lucide-react'
import { PageHeader, Badge, statusTone, sar } from '../components/ui.jsx'
import { useCustomer } from '../store/CustomerContext.jsx'

export default function Invoices() {
  const { invoices, payInvoice } = useCustomer()
  const outstanding = invoices.reduce((s, i) => s + (i.total - i.paid), 0)

  return (
    <>
      <PageHeader title="Invoices & Payments" subtitle="Your ZATCA invoices and payment status" />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Total Invoiced" value={sar(invoices.reduce((s, i) => s + i.total, 0))} tone="text-ink" />
        <Stat label="Paid" value={sar(invoices.reduce((s, i) => s + i.paid, 0))} tone="text-emerald-600" />
        <Stat label="Outstanding" value={sar(outstanding)} tone="text-rose-600" />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">Invoice</th><th className="th">Project</th><th className="th">Total</th><th className="th">Paid</th>
              <th className="th">Balance</th><th className="th">Due</th><th className="th">Status</th><th className="th text-right">Action</th>
            </tr></thead>
            <tbody>
              {invoices.map((i) => {
                const bal = i.total - i.paid
                return (
                  <tr key={i.id} className="hover:bg-slate-50/60">
                    <td className="td">
                      <span className="font-semibold text-brand-600">{i.id}</span>
                      <span className="ml-2 inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600"><ShieldCheck size={11} /> ZATCA</span>
                    </td>
                    <td className="td font-medium text-ink">{i.project}</td>
                    <td className="td font-semibold">{sar(i.total)}</td>
                    <td className="td text-slate-600">{sar(i.paid)}</td>
                    <td className="td">{bal > 0 ? <span className="font-semibold text-rose-600">{sar(bal)}</span> : '—'}</td>
                    <td className="td text-slate-500">{i.due}</td>
                    <td className="td"><Badge tone={statusTone(i.status)}>{i.status}</Badge></td>
                    <td className="td text-right">
                      {bal > 0 ? (
                        <button onClick={() => payInvoice(i.id)} className="inline-flex items-center gap-1 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"><Coins size={13} /> Pay Now</button>
                      ) : <span className="chip bg-emerald-50 text-emerald-600">Paid</span>}
                    </td>
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
