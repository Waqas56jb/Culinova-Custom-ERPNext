import { useEffect, useState } from 'react'
import { api } from '../api.js'

const FALLBACK = [
  'Price', 'Competitor', 'Budget', 'Brand Preference',
  'Project Cancelled', 'Delayed Response', 'Customer Decision', 'Other',
]

/**
 * Fixed lost-reason modal (Sales Rules §13).
 * onConfirm({ reason, note }) → parent runs API.
 */
export default function LostReasonModal({ open, title = 'Mark as Lost', onClose, onConfirm }) {
  const [reasons, setReasons] = useState(FALLBACK)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setReason('')
    setNote('')
    setErr('')
    api('/sales/lost-reasons').then((r) => {
      if (Array.isArray(r) && r.length) setReasons(r)
    }).catch(() => {})
  }, [open])

  if (!open) return null

  const submit = async () => {
    if (!reason) { setErr('Select a lost reason'); return }
    if (reason === 'Other' && !note.trim()) { setErr('Please provide details for Other'); return }
    setBusy(true)
    setErr('')
    try {
      await onConfirm({ reason, note: note.trim() || null })
      onClose()
    } catch (e) {
      setErr(e.message || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
        <p className="mt-1 text-xs text-slate-500">Choose a fixed reason. History is never deleted.</p>
        <label className="mt-4 block text-xs font-semibold text-slate-600">Lost reason</label>
        <select
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          <option value="">— select —</option>
          {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        {(reason === 'Other' || reason) && (
          <>
            <label className="mt-3 block text-xs font-semibold text-slate-600">
              {reason === 'Other' ? 'Details (required)' : 'Note (optional)'}
            </label>
            <textarea
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Additional context…"
            />
          </>
        )}
        {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn-primary bg-rose-600 hover:bg-rose-700" onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : 'Mark Lost'}
          </button>
        </div>
      </div>
    </div>
  )
}
