import { useCallback, useEffect, useState } from 'react'
import { Lock, Unlock, Check, X, Loader2, Package } from 'lucide-react'
import { PageHeader, Badge } from '../components/ui.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { api } from '../api.js'

const ageDays = (iso) => {
  if (!iso) return '—'
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  return d <= 0 ? 'today' : `${d}d`
}

export default function Reservations() {
  const { user } = useAuth()
  const canRequest = ['Management', 'System Admin', 'Stock User', 'Stock Manager'].includes(user?.role)
  const canApprove = ['Management', 'System Admin'].includes(user?.role)
    || (user?.role === 'Stock User' && ['Approve', 'Full'].includes(user?.access_level))
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setErr('')
    try {
      const data = await api('/inventory/reservations?status=Active,Release%20Requested')
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      setErr(e.message)
      setRows([])
    }
  }, [])

  useEffect(() => { load() }, [load])

  const run = async (id, fn) => {
    setBusy(id)
    try { await fn(); await load() }
    catch (e) { alert(e.message) }
    finally { setBusy(null) }
  }

  const requestRelease = (r) => {
    const reason = window.prompt('Reason for release request:')
    if (reason == null) return
    if (!reason.trim()) { alert('Reason is required'); return }
    run(r.id, () => api(`/inventory/reservations/${r.id}/request-release`, { method: 'POST', body: { reason: reason.trim() } }))
  }

  const approve = (r) => run(r.id, () => api(`/inventory/reservations/${r.id}/approve-release`, { method: 'POST', body: {} }))
  const deny = (r) => {
    const note = window.prompt('Deny note (optional):') ?? ''
    run(r.id, () => api(`/inventory/reservations/${r.id}/deny-release`, { method: 'POST', body: { note } }))
  }

  return (
    <>
      <PageHeader title="Stock Reservations" subtitle="Active holds on Sales Orders — request release when stock must be freed" />
      {err && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{err}</div>}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="bg-slate-50/80">
                <th className="th">Item</th>
                <th className="th">Warehouse</th>
                <th className="th">Qty</th>
                <th className="th">Short</th>
                <th className="th">SO / Project</th>
                <th className="th">Age</th>
                <th className="th">Status</th>
                <th className="th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="td font-medium text-ink">{r.item_name || '—'}</td>
                  <td className="td text-slate-500">{r.warehouse || '—'}</td>
                  <td className="td tabular-nums font-semibold">{Number(r.qty) || 0}</td>
                  <td className="td tabular-nums text-amber-700">{Number(r.short_qty) > 0 ? r.short_qty : '—'}</td>
                  <td className="td text-xs text-slate-500">
                    {r.sales_order_id ? <span className="font-mono">{String(r.sales_order_id).slice(0, 8)}…</span> : '—'}
                    {r.release_reason && <div className="mt-0.5 text-[10px] text-slate-400">{r.release_reason}</div>}
                  </td>
                  <td className="td text-slate-500">{ageDays(r.created_at)}</td>
                  <td className="td">
                    <Badge tone={r.status === 'Release Requested' ? 'amber' : 'green'}>{r.status}</Badge>
                  </td>
                  <td className="td">
                    <div className="flex flex-wrap gap-1.5">
                      {r.status === 'Active' && canRequest && (
                        <button type="button" className="btn-ghost !px-2 !py-1 text-[11px]" disabled={busy === r.id}
                          onClick={() => requestRelease(r)}>
                          {busy === r.id ? <Loader2 size={12} className="animate-spin" /> : <Unlock size={12} />} Request release
                        </button>
                      )}
                      {r.status === 'Release Requested' && canApprove && (
                        <>
                          <button type="button" className="btn-ghost !px-2 !py-1 text-[11px] text-emerald-700" disabled={busy === r.id}
                            onClick={() => approve(r)}>
                            {busy === r.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Approve
                          </button>
                          <button type="button" className="btn-ghost !px-2 !py-1 text-[11px] text-rose-600" disabled={busy === r.id}
                            onClick={() => deny(r)}>
                            <X size={12} /> Deny
                          </button>
                        </>
                      )}
                      {r.status === 'Release Requested' && !canApprove && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-700"><Lock size={12} /> Awaiting approval</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className="td py-10 text-center text-slate-400" colSpan={8}>
                    <Package size={20} className="mx-auto mb-2 opacity-40" />
                    No active or release-requested reservations.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
