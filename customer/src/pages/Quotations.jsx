import { useState } from 'react'
import { Check, X as XIcon, MessageCircle, Loader2, FileText } from 'lucide-react'
import { PageHeader, Badge, statusTone, sar } from '../components/ui.jsx'
import { useCustomer } from '../store/CustomerContext.jsx'
import QuotationDoc from '../components/QuotationDoc.jsx'

const blankProfile = () => ({ cr_number: '', vat_number: '', national_address: '', billing_address: '' })

const LOST_REASONS = [
  'Price', 'Competitor', 'Budget', 'Brand Preference',
  'Project Cancelled', 'Delayed Response', 'Customer Decision', 'Other',
]

/** Sent (and legacy Open) / Under Negotiation — customer can act */
const canActOn = (status) => ['Open', 'Sent', 'Under Negotiation'].includes(status)

export default function Quotations() {
  const { quotations, acceptQuote, rejectQuote, requestConcession, saveCommercialProfile, getCommercialProfile } = useCustomer()
  const [busy, setBusy] = useState(null) // `${quoteId}:${action}` so only the clicked button spins

  const run = async (id, action, fn) => {
    setBusy(`${id}:${action}`)
    try { await fn() } catch (e) { alert(e.message) } finally { setBusy(null) }
  }
  const isBusy = (id, action) => busy === `${id}:${action}`
  const rowBusy = (id) => busy?.startsWith(`${id}:`)

  const accept = async (q) => {
    if (!window.confirm(`Accept ${q.ref}? This confirms your order — CULINOVA will start your project.`)) return
    setBusy(`${q.id}:accept`)
    try {
      await acceptQuote(q.id)
    } catch (e) {
      if (e.code === 'COMMERCIAL_PROFILE_REQUIRED') {
        setProfileErr('')
        setProfile(blankProfile())
        setProfileModal(q)
        try {
          const existing = await getCommercialProfile()
          if (existing?.cr_number) setProfile({
            cr_number: existing.cr_number || '',
            vat_number: existing.vat_number || '',
            national_address: existing.national_address || '',
            billing_address: existing.billing_address || '',
          })
        } catch { /* fresh form */ }
      } else alert(e.message)
    } finally { setBusy(null) }
  }

  const saveProfileAndAccept = async () => {
    if (!profileModal) return
    setProfileErr('')
    setBusy(`${profileModal.id}:accept`)
    try {
      await saveCommercialProfile(profile)
      await acceptQuote(profileModal.id)
      setProfileModal(null)
    } catch (e) {
      setProfileErr(e.message)
    } finally { setBusy(null) }
  }

  const openReject = (q) => {
    setRejectReason('')
    setRejectNote('')
    setRejectErr('')
    setRejectFor(q)
  }

  const confirmReject = async () => {
    if (!rejectFor) return
    if (!rejectReason) { setRejectErr('Select a reason'); return }
    if (rejectReason === 'Other' && !rejectNote.trim()) { setRejectErr('Please provide details for Other'); return }
    setBusy(`${rejectFor.id}:reject`)
    setRejectErr('')
    try {
      await rejectQuote(rejectFor.id, rejectReason, rejectNote.trim() || null)
      setRejectFor(null)
    } catch (e) {
      setRejectErr(e.message || 'Failed')
    } finally { setBusy(null) }
  }

  const concession = (q) => {
    const n = window.prompt(`Request a better price on ${q.ref} — your note to the sales team:`)
    if (n !== null) run(q.id, 'concession', () => requestConcession(q.id, n.trim()))
  }

  const Btn = ({ onClick, tone = 'slate', icon: Icon, children, loading, disabled }) => (
    <button type="button" onClick={onClick} disabled={!!(disabled || loading)}
      className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${
        tone === 'brand' ? 'bg-brand-500 text-white hover:bg-brand-600'
          : tone === 'amber' ? 'border border-amber-200 text-amber-600 hover:bg-amber-50'
            : tone === 'rose' ? 'border border-slate-200 text-slate-500 hover:bg-rose-50 hover:text-rose-600'
              : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
      {loading ? <Loader2 size={13} className="animate-spin" /> : Icon && <Icon size={13} />} {children}
    </button>
  )

  return (
    <>
      <PageHeader title="Quotations" subtitle="Review quotes from CULINOVA — view, accept, reject, or request a better price. History is never deleted." />

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px]">
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
                  <td className="td"><Badge tone={statusTone(q.status)}>{q.status === 'Open' ? 'Sent' : q.status}</Badge></td>
                  <td className="td">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <Btn onClick={() => setDoc(q)} icon={FileText} id={q.id}>View PDF</Btn>
                      {canActOn(q.status) && (
                        <>
                          <Btn onClick={() => accept(q)} tone="brand" icon={Check} id={q.id}>Accept</Btn>
                          <Btn onClick={() => concession(q)} tone="amber" icon={MessageCircle} id={q.id}>Concession</Btn>
                          <Btn onClick={() => openReject(q)} tone="rose" icon={XIcon} id={q.id}>Reject</Btn>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {quotations.length === 0 && <tr><td className="td text-slate-400" colSpan={7}>No quotations yet. Your salesperson will send one here.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">Tap <b>View PDF</b> to see full rates. On <b>Accept</b>, your order &amp; project are created automatically. CR/VAT details are required before order confirmation. Quotations cannot be deleted — use <b>Reject</b> with a reason instead.</p>

      <QuotationDoc open={!!doc} onClose={() => setDoc(null)} quotation={doc} />

      {rejectFor && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-navy-900/60 p-4 backdrop-blur-sm" onClick={() => setRejectFor(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-bold text-ink">Reject {rejectFor.ref}</h3>
            <p className="mt-1 text-sm text-slate-500">Choose a fixed reason. History is never deleted.</p>
            <label className="mt-4 block text-xs font-semibold text-slate-600">Reason</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            >
              <option value="">— select —</option>
              {LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            {rejectReason && (
              <>
                <label className="mt-3 block text-xs font-semibold text-slate-600">
                  {rejectReason === 'Other' ? 'Details (required)' : 'Note (optional)'}
                </label>
                <textarea
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  rows={3}
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="Additional context…"
                />
              </>
            )}
            {rejectErr && <p className="mt-3 text-xs font-semibold text-rose-600">{rejectErr}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setRejectFor(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={confirmReject} disabled={busy === rejectFor.id}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
                {busy === rejectFor.id ? <Loader2 size={14} className="animate-spin" /> : <XIcon size={14} />} Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {profileModal && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-navy-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="font-display text-lg font-bold text-ink">Commercial Registration</h3>
            <p className="mt-1 text-sm text-slate-500">Before confirming order <b>{profileModal.ref}</b>, please provide your CR number, VAT number, and billing address (ZATCA requirement).</p>
            <div className="mt-4 space-y-3">
              {['cr_number', 'vat_number', 'national_address', 'billing_address'].map((f) => (
                <label key={f} className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">
                    {f === 'cr_number' ? 'CR Number *' : f === 'vat_number' ? 'VAT Number *' : f === 'national_address' ? 'National Address *' : 'Billing Address *'}
                  </span>
                  {f.includes('address') ? (
                    <textarea value={profile[f]} onChange={(e) => setProfile((p) => ({ ...p, [f]: e.target.value }))} rows={2}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/15" />
                  ) : (
                    <input value={profile[f]} onChange={(e) => setProfile((p) => ({ ...p, [f]: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/15" />
                  )}
                </label>
              ))}
            </div>
            {profileErr && <p className="mt-3 text-xs font-semibold text-rose-600">{profileErr}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setProfileModal(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={saveProfileAndAccept} disabled={busy === profileModal.id}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
                {busy === profileModal.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save &amp; Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
