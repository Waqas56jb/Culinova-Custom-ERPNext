import { useState } from 'react'
import { Plus, AlertTriangle, Mail, Pencil, Check, X, ThumbsUp, ShoppingCart, FileText, Loader2 } from 'lucide-react'
import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { emailTemplates } from '../data/mailData.js'
import QuotationPreview from '../components/QuotationPreview.jsx'

const MGMT = ['Management', 'System Admin']
const APPROVERS = ['Management', 'System Admin', 'Sales Manager']

export default function Quotations() {
  const { quotations, openForm, openCompose, approveQuotation, rejectQuotation, acceptQuotation, lostQuotation } = useData()
  const { user } = useAuth()
  const isMgmt = MGMT.includes(user?.role)
  const canApprove = APPROVERS.includes(user?.role)
  const [busy, setBusy] = useState(null)
  const [preview, setPreview] = useState(null)

  const run = async (id, fn) => { setBusy(id); try { await fn() } catch (e) { alert(e.message) } finally { setBusy(null) } }

  const emailQuote = (q) => {
    const tpl = emailTemplates.quotation(q.customer, q.ref || q.number, sar(q.amount))
    openCompose({ to: q.email || '', toName: q.customer, subject: tpl.subject, body: tpl.body, attachment: `${q.ref || 'quotation'}.pdf`, quotation: q })
  }
  const accept = (q) => { if (window.confirm(`Accept ${q.ref}? This creates a Sales Order + Project automatically.`)) run(q.id, () => acceptQuotation(q.id)) }
  const markLost = (q) => { const reason = window.prompt(`Mark ${q.ref} as Lost — reason is required:`); if (reason && reason.trim()) run(q.id, () => lostQuotation(q.id, reason.trim())) }
  const reject = (q) => { const reason = window.prompt('Reject — reason (optional):') ?? ''; run(q.id, () => rejectQuotation(q.id, reason)) }

  const Act = ({ onClick, tone = 'brand', icon: Icon, children, disabled, loading }) => (
    <button onClick={onClick} disabled={disabled || loading}
      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 ${
        tone === 'rose' ? 'border-rose-200 text-rose-600 hover:bg-rose-50'
          : tone === 'emerald' ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
            : tone === 'slate' ? 'border-slate-200 text-slate-600 hover:bg-slate-50'
              : 'border-slate-200 text-brand-600 hover:bg-brand-50'}`}>
      {loading ? <Loader2 size={13} className="animate-spin" /> : Icon && <Icon size={13} />} {children}
    </button>
  )

  return (
    <>
      <PageHeader title="Quotations / Estimation" subtitle="BOQ-based quotes with discount & GP protection">
        <button className="btn-primary" onClick={() => openForm('quotation')}><Plus size={16} /> New Quotation</button>
      </PageHeader>

      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 animate-fade-up">
        <AlertTriangle size={18} className="shrink-0" />
        <span><b>Business rules:</b> discount &gt;20% (or GP &lt;35%) needs manager approval before sending · discount &gt;25% is blocked · quotations are never deleted, only marked Lost.</span>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px]">
            <thead>
              <tr className="bg-slate-50/60">
                <th className="th">Quotation</th><th className="th">Customer</th><th className="th">Amount (incl. VAT)</th>
                <th className="th">Disc.</th>{isMgmt && <th className="th">GP</th>}
                <th className="th">Valid Till</th><th className="th">Owner</th><th className="th">Status</th><th className="th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {quotations.map((q) => {
                const pending = q.approval === 'Pending'
                const editable = ['Open', 'Draft', 'Pending Approval'].includes(q.status)
                return (
                  <tr key={q.id} className="hover:bg-slate-50/60">
                    <td className="td font-semibold text-brand-600">{q.ref}</td>
                    <td className="td font-medium text-ink">{q.customer}</td>
                    <td className="td font-semibold">{sar(q.amount)}</td>
                    <td className="td text-slate-500">{q.discount ? `${q.discount}%` : '—'}</td>
                    {isMgmt && <td className="td"><span className={`chip ${q.gp < 35 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>{q.gp}%</span></td>}
                    <td className="td text-slate-500">{q.valid_till || '—'}</td>
                    <td className="td text-slate-500">{q.owner}</td>
                    <td className="td"><Badge tone={statusTone(q.status)}>{q.status}</Badge></td>
                    <td className="td">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Act onClick={() => setPreview(q)} tone="slate" icon={FileText}>View</Act>
                        {pending && canApprove && (
                          <>
                            <Act onClick={() => run(q.id, () => approveQuotation(q.id))} tone="emerald" icon={ThumbsUp} loading={busy === q.id}>Approve</Act>
                            <Act onClick={() => reject(q)} tone="rose" icon={X} loading={busy === q.id}>Reject</Act>
                          </>
                        )}
                        {pending && !canApprove && <span className="text-xs font-semibold text-amber-600">Awaiting approval</span>}
                        {!pending && q.status === 'Open' && (
                          <>
                            <Act onClick={() => openForm('quotation', q)} icon={Pencil} disabled={busy === q.id}>Edit</Act>
                            <Act onClick={() => emailQuote(q)} icon={Mail} disabled={busy === q.id}>Email</Act>
                            <Act onClick={() => accept(q)} tone="emerald" icon={ShoppingCart} loading={busy === q.id}>Accept</Act>
                            <Act onClick={() => markLost(q)} tone="rose" icon={X} loading={busy === q.id}>Lost</Act>
                          </>
                        )}
                        {!pending && q.status === 'Draft' && (
                          <>
                            <Act onClick={() => openForm('quotation', q)} icon={Pencil} disabled={busy === q.id}>Edit</Act>
                            <Act onClick={() => markLost(q)} tone="rose" icon={X} loading={busy === q.id}>Lost</Act>
                          </>
                        )}
                        {q.status === 'Ordered' && <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><Check size={13} /> Ordered</span>}
                        {q.status === 'Lost' && <span className="text-xs font-semibold text-slate-400">Lost</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {quotations.length === 0 && <tr><td className="td text-slate-400" colSpan={isMgmt ? 9 : 8}>No quotations yet. Click “New Quotation” to create one.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <QuotationPreview open={!!preview} onClose={() => setPreview(null)} quotation={preview} />
    </>
  )
}
