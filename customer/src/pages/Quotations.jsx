import { Check, X as XIcon } from 'lucide-react'
import { PageHeader, Badge, statusTone, sar } from '../components/ui.jsx'
import { useCustomer } from '../store/CustomerContext.jsx'

export default function Quotations() {
  const { quotations, acceptQuote, declineQuote } = useCustomer()

  return (
    <>
      <PageHeader title="Quotations" subtitle="Review and accept quotes from CULINOVA" />

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">Quotation</th><th className="th">Project</th><th className="th">Amount (incl. VAT)</th>
              <th className="th">Date</th><th className="th">Valid Till</th><th className="th">Status</th><th className="th text-right">Action</th>
            </tr></thead>
            <tbody>
              {quotations.map((q) => (
                <tr key={q.id} className="hover:bg-slate-50/60">
                  <td className="td font-semibold text-brand-600">{q.id}</td>
                  <td className="td font-medium text-ink">{q.project}</td>
                  <td className="td font-semibold">{sar(q.amount)}</td>
                  <td className="td text-slate-500">{q.date}</td>
                  <td className="td text-slate-500">{q.valid}</td>
                  <td className="td"><Badge tone={statusTone(q.status)}>{q.status}</Badge></td>
                  <td className="td text-right">
                    {q.status === 'Open' ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => acceptQuote(q.id)} className="inline-flex items-center gap-1 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"><Check size={13} /> Accept</button>
                        <button onClick={() => declineQuote(q.id)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-rose-50 hover:text-rose-600"><XIcon size={13} /> Decline</button>
                      </div>
                    ) : <span className="chip bg-slate-100 text-slate-500">{q.status}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">On <b>Accept</b>, CULINOVA automatically creates your order &amp; project — you can track progress under "My Projects".</p>
    </>
  )
}
