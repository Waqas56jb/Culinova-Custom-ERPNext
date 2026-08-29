import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Plus, Search, Send, CheckCircle2, Split, Trash2, Package, ClipboardList, ShoppingCart, X, Loader2 } from 'lucide-react'
import { PageHeader, Badge } from '../components/ui.jsx'
import { Modal, Field, Select, TextArea } from '../components/Modal.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { api } from '../api.js'

// mirrors server rbac/permissions.financialRoles — decides whether est-rate / PO-value UI renders at all.
// The server ALSO redacts, so a non-financial viewer simply gets undefined — we never render NaN.
const FIN_ROLES = ['Management', 'System Admin', 'Accounts User', 'Purchase User', 'Stock User', 'Project Manager']
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']
const pill = { Draft: 'gray', Submitted: 'amber', Approved: 'green', Ordered: 'violet', Cancelled: 'red' }
const money = (n) => (n == null || Number.isNaN(Number(n)) ? '—' : sar(n))

export default function MaterialRequests() {
  const { items, projects, suppliers, settings, resAdd } = useData()
  const { user } = useAuth()
  const canCreate = ['Create', 'Edit', 'Approval', 'Full Admin'].includes(user?.access_level)
  const canEdit = ['Edit', 'Approval', 'Full Admin'].includes(user?.access_level)
  const canApprove = ['Approval', 'Full Admin'].includes(user?.access_level)
  const canDelete = user?.access_level === 'Full Admin'
  const showMoney = FIN_ROLES.includes(user?.role)

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [newOpen, setNewOpen] = useState(false)
  const [detailId, setDetailId] = useState(null)
  const firstLoad = useRef(true)

  // Use api() directly — resList from DataContext is a new function every poll (12s) and
  // would re-trigger this effect, flashing "Loading…" forever (same fix as BOQ page).
  const load = useCallback(async () => {
    if (firstLoad.current) setLoading(true)
    try { setRows(await api('/purchase-requisitions') || []) } catch { setRows([]) }
    finally { setLoading(false); firstLoad.current = false }
  }, [])
  useEffect(() => { load() }, [load])

  const counts = useMemo(() => ({
    total: rows.length,
    submitted: rows.filter((r) => r.status === 'Submitted').length,
    approved: rows.filter((r) => r.status === 'Approved').length,
    ordered: rows.filter((r) => r.status === 'Ordered').length,
  }), [rows])

  const deptOptions = (settings?.departments || []).map((d) => d.name).filter(Boolean)

  return (
    <>
      <PageHeader title="Purchase Requisitions" subtitle="Raise material requests from the Item Master, get them approved, then allocate to suppliers as purchase orders">
        {canCreate && <button className="btn-primary" onClick={() => setNewOpen(true)}><Plus size={16} /> New Requisition</button>}
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total Requisitions" value={counts.total} tone="text-ink" />
        <Stat label="Awaiting Approval" value={counts.submitted} tone="text-amber-600" />
        <Stat label="Approved" value={counts.approved} tone="text-emerald-600" />
        <Stat label="Ordered" value={counts.ordered} tone="text-violet-600" />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">Requisition</th><th className="th">Project</th><th className="th">Department</th>
              <th className="th">Required By</th><th className="th">Priority</th><th className="th">Items</th>
              <th className="th">Status</th><th className="th text-right">Action</th>
            </tr></thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr><td className="td text-muted" colSpan={8}>
                  <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading requisitions…</span>
                </td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td className="td text-muted" colSpan={8}>
                  No requisitions yet.{canCreate ? <> Click <span className="font-semibold text-ink">New Requisition</span> to raise one from the Item Master.</> : ' Ask a buyer to raise one.'}
                </td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="td font-semibold text-brand-600">{r.number}</td>
                  <td className="td"><span className="text-xs font-semibold text-violet-600">{r.project_name || '—'}</span></td>
                  <td className="td text-slate-600">{r.department || '—'}</td>
                  <td className="td text-slate-600">{r.required_by || '—'}</td>
                  <td className="td"><Badge tone={pill[r.priority] || (r.priority === 'Urgent' ? 'red' : 'gray')}>{r.priority || 'Medium'}</Badge></td>
                  <td className="td text-slate-600">{r.item_count ?? (r.items?.length || 0)}{r.po_count ? <span className="ml-1 text-[11px] text-muted">· {r.po_count} PO</span> : null}</td>
                  <td className="td"><Badge tone={pill[r.status] || 'gray'}>{r.status}</Badge></td>
                  <td className="td text-right">
                    <button onClick={() => setDetailId(r.id)} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-500 hover:text-white">
                      <ClipboardList size={13} /> Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {newOpen && (
        <NewPRModal
          items={items} projects={projects} deptOptions={deptOptions} showMoney={showMoney}
          onClose={() => setNewOpen(false)}
          onCreate={async (body) => { const created = await resAdd('purchase-requisitions', body); await load(); setNewOpen(false); setDetailId(created.id) }}
        />
      )}

      {detailId && (
        <PRDetail
          id={detailId}
          suppliers={suppliers} settings={settings} showMoney={showMoney}
          canEdit={canEdit} canApprove={canApprove} canDelete={canDelete}
          onChanged={load}
          onClose={() => setDetailId(null)}
          onDeleted={() => { setDetailId(null); load() }}
        />
      )}
    </>
  )
}

function Stat({ label, value, tone }) {
  return (
    <div className="card card-pad animate-fade-up">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${tone}`}>{value}</p>
    </div>
  )
}

// ── NEW REQUISITION ─────────────────────────────────────────────────────────────
function NewPRModal({ items, projects, deptOptions, showMoney, onClose, onCreate }) {
  const [q, setQ] = useState('')
  const [lines, setLines] = useState([]) // { id, item_name, uom, qty, est_rate, notes }
  const [project, setProject] = useState('')
  const [department, setDepartment] = useState('')
  const [requiredBy, setRequiredBy] = useState('')
  const [priority, setPriority] = useState('Medium')
  const [notes, setNotes] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [buyShortfall, setBuyShortfall] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [suggestions, setSuggestions] = useState([])

  const chosenIds = new Set(lines.map((l) => l.id))
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (items || [])
      .filter((it) => !it.disabled)
      .filter((it) => !chosenIds.has(it.id))
      .filter((it) => !s || (it.item_name || it.name || '').toLowerCase().includes(s) || (it.item_code || it.code || '').toLowerCase().includes(s))
      .slice(0, 50)
  }, [items, q, lines])

  const addLine = (it) => setLines((p) => [...p, { id: it.id, item_name: it.item_name || it.name, uom: it.uom || it.stock_uom || 'Nos', qty: 1, est_rate: '', notes: '' }])
  const setLine = (id, k, v) => setLines((p) => p.map((l) => (l.id === id ? { ...l, [k]: v } : l)))
  const removeLine = (id) => setLines((p) => p.filter((l) => l.id !== id))

  const submit = async () => {
    setErr('')
    setSuggestions([])
    if (!lines.length) { setErr('Add at least one item from the Item Master.'); return }
    setBusy(true)
    try {
      const body = {
        project_id: project || null,
        department: department || null,
        required_by: requiredBy || null,
        priority,
        notes: notes || null,
        buy_shortfall_only: buyShortfall || undefined,
        override: overrideReason.trim() ? { reason: overrideReason.trim() } : undefined,
        items: lines.map((l) => ({ item_id: l.id, item_name: l.item_name, uom: l.uom, qty: Number(l.qty) || 1, est_rate: l.est_rate === '' ? null : Number(l.est_rate), notes: l.notes || null })),
      }
      await onCreate(body)
    } catch (e) {
      const msg = e.message || 'Failed to create requisition'
      setErr(msg)
      const sug = e.payload?.suggestions || []
      if (Array.isArray(sug) && sug.length) setSuggestions(sug)
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} size="xl" title="New Purchase Requisition" subtitle="Pick items from the Item Master and set the quantities you need"
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? 'Creating…' : `Create (${lines.length} item${lines.length === 1 ? '' : 's'})`}</button>
      </>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select label="Project (optional)" value={project} onChange={(e) => setProject(e.target.value)}
          options={[{ value: '', label: '— None —' }, ...(projects || []).map((p) => ({ value: p.id, label: p.name }))]} />
        {deptOptions?.length
          ? <Select label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} options={[{ value: '', label: '— Select —' }, ...deptOptions.map((d) => ({ value: d, label: d }))]} />
          : <Field label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Kitchen" />}
        <Field label="Required by" type="date" value={requiredBy} onChange={(e) => setRequiredBy(e.target.value)} />
        <Select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)} options={PRIORITIES} />
      </div>

      {/* chosen lines */}
      {lines.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="bg-slate-50/60">
              <th className="th">Item</th><th className="th w-20">Qty</th><th className="th w-24">UoM</th>
              {showMoney && <th className="th w-28">Est. rate</th>}<th className="th w-10"></th>
            </tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="td font-medium text-ink">{l.item_name}</td>
                  <td className="td"><input type="number" min={1} value={l.qty} onChange={(e) => setLine(l.id, 'qty', e.target.value)} aria-label="Quantity" className="w-16 rounded-lg border border-slate-200 px-2 py-1" /></td>
                  <td className="td"><input value={l.uom} onChange={(e) => setLine(l.id, 'uom', e.target.value)} aria-label="Unit of measure" className="w-20 rounded-lg border border-slate-200 px-2 py-1" /></td>
                  {showMoney && <td className="td"><input type="number" min={0} value={l.est_rate} onChange={(e) => setLine(l.id, 'est_rate', e.target.value)} placeholder="0" aria-label="Estimated rate" className="w-24 rounded-lg border border-slate-200 px-2 py-1" /></td>}
                  <td className="td"><button onClick={() => removeLine(l.id)} className="text-slate-400 hover:text-rose-600" aria-label="Remove"><X size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* item picker */}
      <div>
        <span className="mb-1.5 block text-xs font-semibold text-slate-600">Add items</span>
        <label className="relative block">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the Item Master by name or code…"
            className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-500/15" />
        </label>
        <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-slate-200">
          {filtered.length === 0 && <p className="p-4 text-xs text-muted">{(items || []).length === 0 ? 'No items in the Item Master yet.' : 'No matching items.'}</p>}
          {filtered.map((it) => (
            <button key={it.id} type="button" onClick={() => addLine(it)} className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-brand-50/50">
              <Plus size={14} className="text-brand-500" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{it.item_name || it.name}</span>
                <span className="block truncate text-[11px] text-muted">{it.item_code || it.code}</span>
              </span>
              {it.eos_entry_id && <span className="chip bg-violet-50 text-violet-700"><Package size={11} /> EOS</span>}
            </button>
          ))}
        </div>
      </div>

      <TextArea label="Notes (optional)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <TextArea
        label="Stock override reason (Management — only if buying an in-stock item)"
        rows={2}
        value={overrideReason}
        onChange={(e) => setOverrideReason(e.target.value)}
        placeholder="Required when purchasing items that are already available in stock"
      />
      <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2">
        <input type="checkbox" checked={buyShortfall} onChange={(e) => setBuyShortfall(e.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-600" />
        <span className="text-xs font-semibold text-amber-900">Buy shortfall only — reduce qty to what is not already in stock</span>
      </label>
      {err && <p className="text-xs font-semibold text-rose-600">{err}</p>}
      {suggestions.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          {suggestions.map((s, i) => (
            <li key={i}>
              <b>{s.item_name}</b> — {s.message || `Buy shortfall only (${s.buy_shortfall_only})`}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

// ── DETAIL (header · items · actions · linked POs · allocation) ──────────────────
function PRDetail({ id, suppliers, settings, showMoney, canEdit, canApprove, canDelete, onChanged, onClose, onDeleted }) {
  const [pr, setPr] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [allocOpen, setAllocOpen] = useState(false)

  const load = useCallback(async () => {
    try { setPr(await api(`/purchase-requisitions/${id}`)) } catch (e) { setErr(e.message) }
  }, [id])
  useEffect(() => { load() }, [load])

  const refresh = async () => { await load(); onChanged?.() }

  const act = async (verb) => {
    setErr(''); setBusy(verb)
    try { await api(`/purchase-requisitions/${id}/${verb}`, { method: 'POST', body: {} }); await refresh() }
    catch (e) { setErr(e.message || `Failed to ${verb}`) } finally { setBusy('') }
  }
  const remove = async () => {
    if (!window.confirm('Delete this requisition?')) return
    setErr(''); setBusy('delete')
    try { await api(`/purchase-requisitions/${id}`, { method: 'DELETE' }); onDeleted?.() }
    catch (e) { setErr(e.message || 'Failed to delete'); setBusy('') }
  }

  if (!pr) return <Modal open onClose={onClose} title="Loading…"><p className="text-sm text-muted">{err || 'Loading requisition…'}</p></Modal>

  const totalEst = (pr.items || []).reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.est_rate) || 0), 0)
  const canSubmit = pr.status === 'Draft'
  const canApproveNow = canApprove && ['Draft', 'Submitted'].includes(pr.status)
  const canAllocate = pr.status === 'Approved'

  return (
    <Modal open onClose={onClose} size="xl"
      title={`${pr.number} · ${pr.status}`}
      subtitle={[pr.project_name, pr.department, pr.requester_name && `by ${pr.requester_name}`].filter(Boolean).join(' · ') || 'Requisition detail'}
      footer={<>
        {canDelete && pr.status !== 'Ordered' && <button className="btn-ghost !text-rose-600" disabled={!!busy} onClick={remove}><Trash2 size={14} /> Delete</button>}
        {canSubmit && <button className="btn-ghost" disabled={!!busy} onClick={() => act('submit')}><Send size={14} /> {busy === 'submit' ? 'Submitting…' : 'Submit'}</button>}
        {canApproveNow && <button className="btn-ghost !text-emerald-600" disabled={!!busy} onClick={() => act('approve')}><CheckCircle2 size={14} /> {busy === 'approve' ? 'Approving…' : 'Approve'}</button>}
        {canAllocate && canEdit && <button className="btn-primary" onClick={() => setAllocOpen(true)}><Split size={14} /> Allocate to suppliers</button>}
        <button className="btn-ghost" onClick={onClose}>Close</button>
      </>}>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Meta label="Required by" value={pr.required_by || '—'} />
        <Meta label="Priority" value={pr.priority || 'Medium'} />
        <Meta label="Items" value={(pr.items || []).length} />
        {showMoney && <Meta label="Est. value" value={money(totalEst)} />}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[520px] text-sm">
          <thead><tr className="bg-slate-50/60">
            <th className="th">Item</th><th className="th">Qty</th><th className="th">UoM</th>
            {showMoney && <th className="th">Est. rate</th>}{showMoney && <th className="th">Est. amount</th>}
          </tr></thead>
          <tbody>
            {(pr.items || []).length === 0 && <tr><td className="td text-muted" colSpan={showMoney ? 5 : 3}>No line items.</td></tr>}
            {(pr.items || []).map((li) => (
              <tr key={li.id} className="border-t border-slate-100">
                <td className="td font-medium text-ink">{li.item_name}</td>
                <td className="td text-slate-600">{li.qty}</td>
                <td className="td text-muted">{li.uom || '—'}</td>
                {showMoney && <td className="td text-slate-600">{money(li.est_rate)}</td>}
                {showMoney && <td className="td text-slate-600">{li.est_rate != null ? money((Number(li.qty) || 0) * (Number(li.est_rate) || 0)) : '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pr.notes && <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600"><span className="font-semibold text-slate-500">Notes: </span>{pr.notes}</p>}

      {/* linked POs */}
      {(pr.purchase_orders || []).length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-slate-600">Purchase Orders created from this requisition</p>
          <div className="space-y-1.5">
            {pr.purchase_orders.map((po) => (
              <div key={po.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                <ShoppingCart size={15} className="text-brand-500" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{po.number} · {po.supplier}</span>
                  <span className="block truncate text-[11px] text-muted">{po.item_name} × {po.qty}{showMoney && po.amount != null ? ` · ${money(po.amount)}` : ''}</span>
                </span>
                <Badge tone={pill[po.status] || 'amber'}>{po.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {err && <p className="text-xs font-semibold text-rose-600">{err}</p>}

      {allocOpen && (
        <AllocateModal prId={id} suppliers={suppliers} currencies={settings?.currencies} showMoney={showMoney}
          onClose={() => setAllocOpen(false)}
          onDone={async () => { setAllocOpen(false); await refresh() }} />
      )}
    </Modal>
  )
}

function Meta({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 px-3 py-2">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-ink">{value}</p>
    </div>
  )
}

// ── SUPPLIER ALLOCATION ──────────────────────────────────────────────────────────
function AllocateModal({ prId, suppliers, currencies, showMoney, onClose, onDone }) {
  const [suggest, setSuggest] = useState(null)
  const [alloc, setAlloc] = useState({}) // pr_item_id → { supplier, rate, currency }
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const curOpts = currencies?.length ? currencies.map((c) => c.code) : ['SAR', 'USD', 'EUR', 'AED']

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const data = await api(`/purchase-requisitions/${prId}/suggest-suppliers`)
        if (alive) setSuggest(data)
      } catch (e) { if (alive) setErr(e.message) }
    })()
    return () => { alive = false }
  }, [prId])

  const supNames = (suppliers || []).map((s) => s.name).filter(Boolean)
  const set = (pid, k, v) => setAlloc((p) => ({ ...p, [pid]: { ...(p[pid] || { currency: 'SAR' }), [k]: v } }))

  // when a supplier is chosen, prefill the last rate from real history if we have it
  const pickSupplier = (line, supplier) => {
    const hist = (line.suppliers || []).find((s) => s.supplier === supplier)
    setAlloc((p) => ({ ...p, [line.pr_item_id]: { supplier, currency: p[line.pr_item_id]?.currency || 'SAR', rate: hist?.last_rate != null ? String(hist.last_rate) : (p[line.pr_item_id]?.rate ?? (line.est_rate != null ? String(line.est_rate) : '')) } }))
  }

  const submit = async () => {
    setErr('')
    const allocations = (suggest?.items || [])
      .map((line) => { const a = alloc[line.pr_item_id]; return a?.supplier ? { pr_item_id: line.pr_item_id, item_name: line.item_name, supplier: a.supplier, rate: a.rate === '' || a.rate == null ? null : Number(a.rate), currency: a.currency || 'SAR' } : null })
      .filter(Boolean)
    if (!allocations.length) { setErr('Assign a supplier to at least one item.'); return }
    if (allocations.some((a) => a.rate == null || Number.isNaN(a.rate))) { setErr('Enter a rate for every allocated item.'); return }
    setBusy(true)
    try { await api(`/purchase-requisitions/${prId}/to-po`, { method: 'POST', body: { allocations } }); await onDone() }
    catch (e) { setErr(e.message || 'Failed to create purchase orders'); setBusy(false) }
  }

  return (
    <Modal open onClose={onClose} size="xl" title="Allocate to suppliers" subtitle="Assign each item to a supplier — creates one purchase order per supplier"
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? 'Creating POs…' : 'Create Purchase Orders'}</button>
      </>}>
      {!suggest && <p className="text-sm text-muted">{err || 'Loading supplier suggestions…'}</p>}
      {suggest && (suggest.items || []).length === 0 && <p className="text-sm text-muted">This requisition has no items to allocate.</p>}
      {suggest && (suggest.items || []).map((line) => {
        const a = alloc[line.pr_item_id] || {}
        const suggested = line.suppliers || []
        // suggested suppliers first, then the rest of the master (no duplicates)
        const rest = supNames.filter((n) => !suggested.some((s) => s.supplier === n))
        return (
          <div key={line.pr_item_id} className="rounded-xl border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">{line.item_name} <span className="text-muted">× {line.qty} {line.uom || ''}</span></p>
              {suggested.length > 0 && <span className="chip bg-violet-50 text-violet-700">{suggested.length} past supplier{suggested.length === 1 ? '' : 's'}</span>}
            </div>
            {suggested.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {suggested.map((s) => (
                  <button key={s.supplier} type="button" onClick={() => pickSupplier(line, s.supplier)}
                    className={`chip ${a.supplier === s.supplier ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-brand-50'}`}>
                    {s.supplier}{showMoney && s.last_rate != null ? ` · ${sar(s.last_rate)}` : ''}{s.on_time_pct != null ? ` · ${s.on_time_pct}% OT` : ''}
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Select label="Supplier" value={a.supplier || ''} onChange={(e) => pickSupplier(line, e.target.value)}
                options={[{ value: '', label: '— Select supplier —' }, ...suggested.map((s) => ({ value: s.supplier, label: s.supplier })), ...rest.map((n) => ({ value: n, label: n }))]} />
              <Field label="Rate" type="number" min={0} value={a.rate ?? ''} onChange={(e) => set(line.pr_item_id, 'rate', e.target.value)} placeholder="0" />
              <Select label="Currency" value={a.currency || 'SAR'} onChange={(e) => set(line.pr_item_id, 'currency', e.target.value)} options={curOpts} />
            </div>
          </div>
        )
      })}
      {suggest && supNames.length === 0 && <p className="text-xs text-muted">No suppliers on file. Add suppliers in the Suppliers page first.</p>}
      {err && <p className="text-xs font-semibold text-rose-600">{err}</p>}
    </Modal>
  )
}
