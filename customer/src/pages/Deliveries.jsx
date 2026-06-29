import { useState } from 'react'
import { Truck, CheckCircle2, XCircle, RotateCcw, MapPin, PenLine } from 'lucide-react'
import { PageHeader, Badge, statusTone, sar } from '../components/ui.jsx'
import { useCustomer } from '../store/CustomerContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

export default function Deliveries() {
  const { deliveries, acceptDelivery, rejectDelivery, returnDelivery } = useCustomer()
  const { user } = useAuth()
  const [busy, setBusy] = useState(null)

  const act = async (fn, id, ...args) => { setBusy(id); try { await fn(id, ...args) } catch (e) { alert(e.message) } finally { setBusy(null) } }
  const onAccept = (d) => act(acceptDelivery, d.id, user?.name)
  const onReject = (d) => { const r = window.prompt('Reason for rejecting this delivery?'); if (r && r.trim()) act(rejectDelivery, d.id, r.trim()) }
  const onReturn = (d) => { const r = window.prompt('Reason for return request?'); act(returnDelivery, d.id, (r || '').trim()) }

  const pending = deliveries.filter((d) => ['Delivered', 'Ready'].includes(d.status))

  return (
    <>
      <PageHeader title="Deliveries" subtitle="Review, accept, reject or request a return for items delivered to you" />

      {pending.length > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <b>{pending.length}</b> delivery{pending.length > 1 ? 's' : ''} awaiting your acceptance.
        </div>
      )}

      <div className="space-y-3">
        {deliveries.length === 0 && (
          <div className="card card-pad text-center text-sm text-slate-400"><Truck size={36} className="mx-auto mb-2 opacity-40" />No deliveries yet.</div>
        )}
        {deliveries.map((d) => {
          const awaiting = ['Delivered', 'Ready'].includes(d.status)
          return (
            <div key={d.id} className="card card-pad">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink">{d.item_name} <span className="font-normal text-muted">× {d.qty}</span></p>
                  <p className="mt-0.5 text-xs text-muted">{d.number} · {sar(d.value || 0)}</p>
                  {(d.area || d.position) && <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500"><MapPin size={12} /> {[d.area, d.position].filter(Boolean).join(' · ')}</p>}
                  {d.signature_name && <p className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-600"><PenLine size={12} /> Signed: {d.signature_name}</p>}
                  {d.rejection_reason && <p className="mt-1 text-xs text-rose-600">Rejected: {d.rejection_reason}</p>}
                  {d.return_reason && <p className="mt-1 text-xs text-amber-600">Return: {d.return_reason}</p>}
                </div>
                <Badge tone={statusTone(d.status)}>{d.status}</Badge>
              </div>
              {awaiting && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  <button disabled={busy === d.id} onClick={() => onAccept(d)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"><CheckCircle2 size={14} /> Accept</button>
                  <button disabled={busy === d.id} onClick={() => onReject(d)} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600 disabled:opacity-60"><XCircle size={14} /> Reject</button>
                </div>
              )}
              {d.status === 'Accepted' && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <button disabled={busy === d.id} onClick={() => onReturn(d)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"><RotateCcw size={14} /> Request Return</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
