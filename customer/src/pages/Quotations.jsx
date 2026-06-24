import { useState } from 'react'
import { Check, X as XIcon, MessageCircle, Loader2 } from 'lucide-react'
import { PageHeader, Badge, statusTone, sar } from '../components/ui.jsx'
import { useCustomer } from '../store/CustomerContext.jsx'

export default function Quotations() {
  const { quotations, acceptQuote, rejectQuote, requestConcession } = useCustomer()
  const [busy, setBusy] = useState(null)
  const run = async (id, fn) => { setBusy(id); try { await fn() } catch (e) { alert(e.message) } finally { setBusy(null) } }

  const accept = (q) => { if (window.confirm(`Accept ${q.ref}? This confirms your order — CULINOVA will start your project.`)) run(q.id, () => acceptQuote(q.id)) }
  const reject = (q) => { const reason = window.prompt(`Reject ${q.ref} — please tell us why:`); if (reason && reason.trim()) run(q.id, () => rejectQuote(q.id, reason.trim())) }
  const concession = (q) => { const note = window.prompt(`Request a better price on ${q.ref} — your note to the sales team:`); if (note !== null) run(q.id, () => requestConcession(q.id, note.trim())) }

  return (
    <>
      <PageHeader title="Quotations" subtitle="Review quotes from CULINOVA — accept, reject, or request a better price" />

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">Quotation</th><th className="th">Project</th><th className="th">Amount (incl. VAT)</th>
              <th className="th">Date</th><th className="th">Valid Till</th><th className="th">Status</th><th className="th text-right">Action</th>
            </tr></thead>
            <tbody>
              {quotations.map((q) => (
                <tr key={q.id} className="hover:bg-slate-50/60">
                  <td className="td font-semibold text-brand-600">{q.ref}</td>
                  <td className="td font-medium text-ink">{q.project}</td>
                  <td className="td font-semibold">{sar(q.amount)}</td>
                  <td className="td text-slate-500">{q.date}</td>
                  <td className="td text-slate-500">{q.valid}</td>
                  <td className="td"><Badge tone={statusTone(q.status)}>{q.status}</Badge></td>
                  <td className="td text-right">
                    {q.status === 'Open' ? (
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <button onClick={() => accept(q)} disabled={busy === q.id} className="inline-flex items-center gap-1 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-60">{busy === q.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Accept</button>
                        <button onClick={() => concession(q)} disabled={busy === q.id} className="inline-flex items-center gap-1 rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-600 hover:bg-amber-50 disabled:opacity-60"><MessageCircle size={13} /> Concession</button>
                        <button onClick={() => reject(q)} disabled={busy === q.id} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-60"><XIcon size={13} /> Reject</button>
                      </div>
                    ) : <span className="chip bg-slate-100 text-slate-500">{q.status}</span>}
                  </td>
                </tr>
              ))}
              {quotations.length === 0 && <tr><td className="td text-slate-400" colSpan={7}>No quotations yet. Your salesperson will send one here.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">On <b>Accept</b>, your order &amp; project are created automatically — track them under “My Projects”. <b>Concession</b> sends a note to your salesperson via chat.</p>
    </>
  )
}
