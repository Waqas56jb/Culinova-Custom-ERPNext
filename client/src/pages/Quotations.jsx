import { Plus, AlertTriangle, Mail } from 'lucide-react'
import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'
import { emailTemplates } from '../data/mailData.js'

const GP_TARGET = 25 // CULINOVA business rule

export default function Quotations() {
  const { quotations, openForm, openCompose } = useData()
  const emailQuote = (q) => {
    const tpl = emailTemplates.quotation(q.customer, q.id, sar(q.amount))
    // open the composer inline (right here) — do NOT jump to the mail panel
    openCompose({ to: q.email || '', toName: q.customer, subject: tpl.subject, body: tpl.body, attachment: `${q.id}.pdf`, quotation: q })
  }
  return (
    <>
      <PageHeader title="Quotations / Estimation" subtitle="Prepare BOQ-based quotes with GP protection">
        <button className="btn-primary" onClick={() => openForm('quotation')}><Plus size={16} /> New Quotation</button>
      </PageHeader>

      {/* GP business-rule banner */}
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 animate-fade-up">
        <AlertTriangle size={18} className="shrink-0" />
        <span>
          <b>GP Protection Rule:</b> quotations below <b>{GP_TARGET}% gross profit</b> are flagged and require manager approval before sending.
        </span>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px]">
            <thead>
              <tr className="bg-slate-50/60">
                <th className="th">Quotation</th><th className="th">Customer</th><th className="th">Customer Email</th><th className="th">Amount (incl. VAT)</th>
                <th className="th">Gross Profit</th><th className="th">Valid Till</th><th className="th">Owner</th><th className="th">Status</th><th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {quotations.map((q) => {
                const low = q.gp < GP_TARGET
                return (
                  <tr key={q.id} className="hover:bg-slate-50/60">
                    <td className="td font-semibold text-brand-600">{q.id}</td>
                    <td className="td font-medium text-ink">{q.customer}</td>
                    <td className="td">
                      <span className="inline-flex items-center gap-1.5 text-slate-500">
                        <Mail size={13} className="text-slate-400" />
                        {q.email || <span className="text-slate-300">—</span>}
                      </span>
                    </td>
                    <td className="td font-semibold">{sar(q.amount)}</td>
                    <td className="td">
                      <span className={`chip ${low ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                        {low && <AlertTriangle size={12} />} {q.gp}%
                      </span>
                    </td>
                    <td className="td text-slate-500">{q.valid}</td>
                    <td className="td text-slate-500">{q.owner}</td>
                    <td className="td"><Badge tone={statusTone(q.status)}>{q.status}</Badge></td>
                    <td className="td">
                      <button onClick={() => emailQuote(q)} title="Email to customer"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50">
                        <Mail size={13} /> Email
                      </button>
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
