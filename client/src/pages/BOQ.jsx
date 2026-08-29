import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus, FileSpreadsheet, ChevronDown, ChevronRight, Trash2, Download, Printer,
  ArrowLeft, Package, Layers, Loader2, Search, Send, Boxes, PlusCircle,
} from 'lucide-react'
import { PageHeader, KpiCard, Badge, statusTone } from '../components/ui.jsx'
import { Modal, Field, Select, TextArea } from '../components/Modal.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { api, getToken } from '../api.js'
import { erpApiBase } from '@deploy'
import { specPreview } from '@shared/specs.js'
import { StockAvailabilityChips } from '../components/StockAvailabilityChips.jsx'

// Roles allowed to see cost / margin / supplier price (mirrors server rbac/permissions.financialRoles).
// The server ALSO redacts, so a non-financial viewer simply gets undefined — we never render it.
const FIN_ROLES = ['Management', 'System Admin', 'Accounts User', 'Purchase User', 'Stock User', 'Project Manager']
const API_BASE = erpApiBase()
const STATUSES = ['Draft', 'Finalized', 'Approved', 'Sent', 'Ordered']
const pct = (n) => `${Number(n) || 0}%`

export default function BOQ() {
  const { resAdd, resUpdate, resDelete, lookupQuotations, items, projects, settings } = useData()
  const { user } = useAuth()
  const fin = FIN_ROLES.includes(user?.role)
  const canDelete = user?.access_level === 'Full Admin'

  const [boqs, setBoqs] = useState([])
  const [selId, setSelId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [collapsed, setCollapsed] = useState({})
  const [qtyDraft, setQtyDraft] = useState({})
  const [busy, setBusy] = useState(false)
  const [modal, setModal] = useState(null) // 'new' | 'add' | 'quote'
  const [err, setErr] = useState('')
  // "Generate BOQ from Quotation" is a PROJECT-side feature, but the store's `quotations` source is gated
  // on the sales panel → a Project Manager (403 on /sales/quotations) always saw an empty picker and the
  // headline feature was dead for its primary user. The POST endpoint already authorises a PM; only the
  // picker's SOURCE was wrong. /lookups/quotations is readable by every internal role and carries id /
  // number / customer / status — deliberately NO money.
  const [quotes, setQuotes] = useState([])
  const [quotesErr, setQuotesErr] = useState('')
  const [quotesLoading, setQuotesLoading] = useState(true)
  const [availMap, setAvailMap] = useState({})

  const currencies = (settings?.currencies || []).map((c) => c.code).filter(Boolean)

  // Use api() directly — resList/resGet are recreated every DataContext render (12s poll),
  // which retriggered these effects and flashed "Loading…" forever on the list.
  const loadList = useCallback(async () => {
    setLoadingList(true)
    try { setBoqs(await api('/boqs') || []) } catch { setBoqs([]) } finally { setLoadingList(false) }
  }, [])

  const loadDetail = useCallback(async (id) => {
    if (!id) { setDetail(null); return }
    setLoadingDetail(true)
    try { setDetail(await api(`/boqs/${id}`)) } catch (e) { setErr(e.message) } finally { setLoadingDetail(false) }
  }, [])

  useEffect(() => { if (!selId) loadList() }, [selId, loadList])
  useEffect(() => { loadDetail(selId) }, [selId, loadDetail])

  useEffect(() => {
    const lines = []
    for (const g of detail?.groups || []) for (const l of g.items || []) if (l.item_id) lines.push(l)
    for (const l of detail?.items || []) if (l.item_id) lines.push(l)
    const ids = [...new Set(lines.map((l) => l.item_id).filter(Boolean))]
    if (!ids.length) { setAvailMap({}); return }
    let alive = true
    api(`/inventory/availability-bulk?ids=${ids.join(',')}`)
      .then((m) => { if (alive) setAvailMap(m && typeof m === 'object' ? m : {}) })
      .catch(() => { if (alive) setAvailMap({}) })
    return () => { alive = false }
  }, [detail])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const list = await lookupQuotations()
        if (alive) { setQuotes(Array.isArray(list) ? list : []); setQuotesErr('') }
      } catch (e) {
        if (alive) { setQuotes([]); setQuotesErr(e.message || 'Could not load quotations.') }
      } finally {
        if (alive) setQuotesLoading(false)
      }
    })()
    return () => { alive = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = async () => { await Promise.all([loadList(), loadDetail(selId)]) }
  const run = async (fn) => { setBusy(true); setErr(''); try { await fn(); await refresh() } catch (e) { setErr(e.message); alert(e.message) } finally { setBusy(false) } }

  // ── list view ────────────────────────────────────────────────────────────
  if (!selId) {
    return (
      <>
        <PageHeader title="BOQ Management" subtitle="Bill of Quantities — build from the Item Master or a quotation, group by equipment, export to Excel / PDF">
          <button className="btn-primary" onClick={() => setModal('new')}><Plus size={16} /> New BOQ</button>
        </PageHeader>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className="bg-slate-50/60">
                  <th className="th">BOQ</th><th className="th">Name</th><th className="th">Customer</th>
                  <th className="th">Total (Sell)</th>{fin && <th className="th">GP%</th>}
                  <th className="th">Status</th><th className="th">Actions</th>
                </tr>
              </thead>
              <tbody>
                {boqs.map((b) => (
                  <tr key={b.id} className="cursor-pointer hover:bg-slate-50/60" onClick={() => setSelId(b.id)}>
                    <td className="td font-semibold text-brand-600">{b.number}</td>
                    <td className="td font-medium text-ink">{b.name || '—'}</td>
                    <td className="td text-slate-500">{b.customer || '—'}</td>
                    <td className="td font-semibold">{sar(b.total_sell)}</td>
                    {fin && <td className="td"><span className={`chip ${Number(b.gp_percent) < 20 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>{pct(b.gp_percent)}</span></td>}
                    <td className="td"><Badge tone={statusTone(b.status)}>{b.status || 'Draft'}</Badge></td>
                    <td className="td" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setSelId(b.id)}>Open</button>
                        <button className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50" title="Export CSV" onClick={() => exportBoq(b, 'csv')}><Download size={14} /></button>
                        <button className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50" title="Print / PDF" onClick={() => exportBoq(b, 'html')}><Printer size={14} /></button>
                        {canDelete && <button className="rounded-lg border border-rose-200 p-1.5 text-rose-500 hover:bg-rose-50" title="Delete" onClick={() => { if (confirm(`Delete ${b.number}?`)) run(() => resDelete('boqs', b.id)) }}><Trash2 size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {!loadingList && boqs.length === 0 && (
                  <tr><td className="td text-slate-400" colSpan={fin ? 7 : 6}>No BOQs yet. Click “New BOQ” to create one, then add equipment from the Item Master.</td></tr>
                )}
                {loadingList && boqs.length === 0 && (
                  <tr><td className="td text-slate-400" colSpan={fin ? 7 : 6}><Loader2 size={15} className="inline animate-spin" /> Loading…</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {modal === 'new' && <NewBoqModal onClose={() => setModal(null)} onCreate={onCreateBoq} projects={projects} currencies={currencies} />}
      </>
    )
  }

  // ── builder view ─────────────────────────────────────────────────────────
  const groups = detail?.groups || []
  const summary = detail?.summary || {}

  return (
    <>
      <PageHeader title={detail?.number || 'BOQ'} subtitle={detail?.name || 'Bill of Quantities builder'}>
        <button className="btn-ghost" onClick={() => { setSelId(null); setDetail(null) }}><ArrowLeft size={16} /> All BOQs</button>
        <button className="btn-ghost" onClick={() => exportBoq(detail, 'csv')}><Download size={16} /> Export CSV</button>
        <button className="btn-ghost" onClick={() => exportBoq(detail, 'html')}><Printer size={16} /> Print / PDF</button>
        <button className="btn-primary" onClick={() => setModal('add')}><Plus size={16} /> Add Item</button>
      </PageHeader>

      {err && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{err}</div>}

      {/* meta + actions bar */}
      <div className="card card-pad mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="text-sm"><span className="text-muted">Customer:</span> <span className="font-semibold text-ink">{detail?.customer || '—'}</span></div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Project</span>
          <select className="max-w-[220px] rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-1.5 text-sm" value={detail?.project_id || ''} onChange={(e) => run(() => resUpdate('boqs', selId, { project_id: e.target.value || null }))}>
            <option value="">— No project —</option>
            {(projects || []).map((p) => <option key={p.id} value={p.id}>{`${p.ref || p.number || ''} ${p.name || ''}`.trim()}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Status</span>
          <select className="rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-1.5 text-sm" value={detail?.status || 'Draft'} onChange={(e) => run(() => resUpdate('boqs', selId, { status: e.target.value }))}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          <button className="btn-ghost" disabled={busy} onClick={() => setModal('quote')}><FileSpreadsheet size={15} /> Generate from Quotation</button>
          <button className="btn-ghost" disabled={busy} onClick={() => run(async () => {
            if (!detail?.project_id) throw new Error('Link this BOQ to a project first (edit the BOQ).')
            const r = await api(`/boqs/${selId}/to-project-equipment`, { method: 'POST' }); alert(`Pushed ${r.pushed} item(s) to the project equipment list.`)
          })}><Boxes size={15} /> Push to Project Equipment</button>
        </div>
      </div>

      {/* cost summary */}
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Total (Sell)" value={sar(summary.total_sell)} icon={FileSpreadsheet} accent="brand" sub={`${summary.line_count || 0} lines · ${summary.group_count || 0} groups`} />
        {fin && <KpiCard label="Total Cost" value={sar(summary.total_cost)} icon={Package} accent="gold" />}
        {fin && <KpiCard label="Gross Profit" value={sar(summary.gross_profit)} icon={Layers} accent="emerald" sub={pct(summary.gp_percent)} />}
        <KpiCard label="Groups" value={summary.group_count || 0} icon={Layers} accent="violet" />
      </div>

      {/* groups */}
      {loadingDetail && !detail ? (
        <div className="card card-pad text-sm text-muted"><Loader2 size={15} className="inline animate-spin" /> Loading BOQ…</div>
      ) : groups.length === 0 ? (
        <div className="card card-pad text-center text-sm text-muted">
          <PlusCircle size={22} className="mx-auto mb-2 text-slate-300" />
          No items yet. Click <b>“Add Item”</b> to build this BOQ from the Item Master, or <b>“Generate from Quotation”</b> to import a quote’s lines.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const isOpen = !collapsed[g.group_name]
            return (
              <div key={g.group_name} className="card overflow-hidden">
                <button className="flex w-full items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3 text-left"
                  onClick={() => setCollapsed((c) => ({ ...c, [g.group_name]: isOpen }))}>
                  {isOpen ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                  <span className="font-bold text-ink">{g.group_name}</span>
                  <Badge tone="blue">{g.line_count} {g.line_count === 1 ? 'item' : 'items'}</Badge>
                  <span className="ml-auto flex flex-wrap items-center gap-4 text-sm">
                    <span className="font-semibold text-ink">{sar(g.sell_total)}</span>
                    {fin && <span className="text-muted">cost {sar(g.total_cost)}</span>}
                    {fin && <span className={`chip ${g.gp_percent < 20 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>GP {pct(g.gp_percent)}</span>}
                  </span>
                </button>
                {isOpen && (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px]">
                      <thead>
                        <tr className="bg-white">
                          <th className="th">Code</th><th className="th">Item</th><th className="th">UOM</th><th className="th w-28">Qty</th>
                          <th className="th">Sell Rate</th><th className="th">Sell Amt</th>
                          {fin && <th className="th">Cost Rate</th>}{fin && <th className="th">Cost Amt</th>}
                          <th className="th"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.items.map((l) => (
                          <tr key={l.id} className="hover:bg-slate-50/60">
                            <td className="td text-xs text-slate-500">{l.item_code || '—'}</td>
                            <td className="td">
                              <div className="font-medium text-ink">{l.item_name}</div>
                              {(l.description || l.specifications) && (
                                <div className="text-xs text-muted line-clamp-1">
                                  {l.description || specPreview(l.specifications, 80)}
                                </div>
                              )}
                              <StockAvailabilityChips
                                compact
                                available={availMap[l.item_id]?.in_stock}
                                reserved={availMap[l.item_id]?.reserved}
                                incoming={availMap[l.item_id]?.in_transit}
                                from_stock={l.from_stock}
                                to_purchase={l.to_purchase}
                              />
                            </td>
                            <td className="td text-slate-500">{l.uom || 'Nos'}</td>
                            <td className="td">
                              <input type="number" min="0" step="any"
                                className="w-20 rounded-lg border border-slate-200 bg-slate-50/60 px-2 py-1 text-sm outline-none focus:border-brand-400 focus:bg-white"
                                value={qtyDraft[l.id] ?? l.qty}
                                onChange={(e) => setQtyDraft((d) => ({ ...d, [l.id]: e.target.value }))}
                                onBlur={(e) => commitQty(l, e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
                            </td>
                            <td className="td text-slate-500">{sar(l.sell_rate)}</td>
                            <td className="td font-semibold">{sar(l.sell_amount)}</td>
                            {fin && <td className="td text-slate-500">{sar(l.cost_rate)}</td>}
                            {fin && <td className="td text-slate-500">{sar(l.cost_amount)}</td>}
                            <td className="td">
                              <button className="rounded-lg border border-rose-200 p-1.5 text-rose-500 hover:bg-rose-50" title="Remove line"
                                onClick={() => run(() => api(`/boqs/${selId}/items/${l.id}`, { method: 'DELETE' }))}><Trash2 size={14} /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {modal === 'add' && <AddItemModal onClose={() => setModal(null)} items={items} fin={fin} onAdd={onAddItem} />}
      {modal === 'quote' && (
        <FromQuoteModal onClose={() => setModal(null)} quotations={quotes} loading={quotesLoading}
          loadErr={quotesErr} busy={busy} onGen={onGenFromQuote} />
      )}
    </>
  )

  // ── actions ────────────────────────────────────────────────────────────────
  async function onCreateBoq(body) {
    setBusy(true)
    try {
      const b = await resAdd('boqs', body)
      await loadList(); setModal(null); setSelId(b.id)
    } catch (e) { alert(e.message) } finally { setBusy(false) }
  }
  async function onAddItem(body) { await run(() => api(`/boqs/${selId}/items`, { method: 'POST', body })); setModal(null) }
  async function onGenFromQuote(qid) { await run(() => api(`/boqs/${selId}/from-quotation/${qid}`, { method: 'POST' })); setModal(null) }
  async function commitQty(line, val) {
    const q = Number(val)
    setQtyDraft((d) => { const n = { ...d }; delete n[line.id]; return n })
    if (!Number.isFinite(q) || q <= 0 || q === Number(line.qty)) return
    await run(() => api(`/boqs/${selId}/items/${line.id}`, { method: 'PATCH', body: { qty: q } }))
  }
  async function exportBoq(b, format) {
    if (!b?.id) return
    try {
      const res = await fetch(`${API_BASE}/boqs/${b.id}/export?format=${format}`, { headers: { Authorization: `Bearer ${getToken()}` } })
      if (!res.ok) { alert('Export failed.'); return }
      if (format === 'csv') {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = `${b.number || 'BOQ'}.csv`
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
      } else {
        const html = await res.text()
        const w = window.open('', '_blank')
        if (!w) { alert('Allow pop-ups to print the BOQ.'); return }
        w.document.write(html); w.document.close()
      }
    } catch (e) { alert(e.message) }
  }
}

// ── modals ───────────────────────────────────────────────────────────────────
function NewBoqModal({ onClose, onCreate, projects, currencies }) {
  const [f, setF] = useState({ name: '', customer: '', project_id: '', currency: currencies[0] || 'SAR', notes: '' })
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const projOpts = [{ value: '', label: '— No project —' }, ...(projects || []).map((p) => ({ value: p.id, label: `${p.ref || p.number || ''} · ${p.name || ''}`.trim() }))]
  const curOpts = (currencies.length ? currencies : ['SAR']).map((c) => ({ value: c, label: c }))
  const valid = f.name || f.customer || f.project_id
  return (
    <Modal open title="New BOQ" subtitle="Create a Bill of Quantities" onClose={onClose}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!valid} onClick={() => onCreate({ name: f.name || null, customer: f.customer || null, project_id: f.project_id || null, currency: f.currency || null, notes: f.notes || null })}>Create BOQ</button>
      </>}>
      <Field label="BOQ Name" value={f.name} onChange={set('name')} placeholder="e.g. Main Kitchen — Ground Floor" />
      <Field label="Customer" value={f.customer} onChange={set('customer')} placeholder="Customer name" />
      <Select label="Project" value={f.project_id} onChange={set('project_id')} options={projOpts} />
      <Select label="Currency" value={f.currency} onChange={set('currency')} options={curOpts} />
      <TextArea label="Notes" rows={2} value={f.notes} onChange={set('notes')} />
      {!valid && <p className="text-[11px] text-amber-600">Enter at least a name, customer or project.</p>}
    </Modal>
  )
}

function AddItemModal({ onClose, items, fin, onAdd }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)
  const [qty, setQty] = useState('1')
  const [group, setGroup] = useState('')
  const [sell, setSell] = useState('')
  const [cost, setCost] = useState('')
  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    const base = (items || []).filter((i) => !i.disabled)
    const list = t ? base.filter((i) => `${i.item_name || i.name || ''} ${i.item_code || i.code || ''}`.toLowerCase().includes(t)) : base
    return list.slice(0, 40)
  }, [q, items])
  const choose = (i) => {
    setSel(i)
    setGroup(i.item_group || i.product_family || 'General')
    setSell(i.selling_price != null ? String(i.selling_price) : '')
    setCost(i.landed_cost != null ? String(i.landed_cost) : '')
  }
  const submit = () => {
    const body = { item_id: sel.id, qty: Number(qty) || 1, group_name: group || 'General' }
    if (sell !== '') body.sell_rate = Number(sell)
    if (fin && cost !== '') body.cost_rate = Number(cost)
    onAdd(body)
  }
  const valid = sel && Number(qty) > 0
  return (
    <Modal open size="lg" title="Add Item to BOQ" subtitle="Pick from the Item Master — rate is priced by the engine" onClose={onClose}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!valid} onClick={submit}>Add Item</button>
      </>}>
      {!sel ? (
        <>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Search the Item Master</span>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3">
              <Search size={15} className="text-slate-400" />
              <input autoFocus className="w-full bg-transparent py-2.5 text-sm outline-none" placeholder="Search by name or code…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </label>
          <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
            {results.map((i) => (
              <button key={i.id} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50" onClick={() => choose(i)}>
                <Package size={16} className="shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">{i.item_name || i.name}</div>
                  <div className="text-xs text-muted">{i.item_code || i.code || '—'}{i.item_group ? ` · ${i.item_group}` : ''}</div>
                </div>
                {i.selling_price != null && <span className="shrink-0 text-xs font-semibold text-brand-600">{sar(i.selling_price)}</span>}
              </button>
            ))}
            {results.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted">{(items || []).length === 0 ? 'The Item Master is empty. Add items first.' : 'No items match your search.'}</div>}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <Package size={18} className="mt-0.5 text-brand-500" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-ink">{sel.item_name || sel.name}</div>
              <div className="text-xs text-muted">{sel.item_code || sel.code || '—'}</div>
            </div>
            <button className="text-xs font-semibold text-brand-600" onClick={() => setSel(null)}>Change</button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Quantity" type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
            <Field label="Equipment Group" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="e.g. Cooking" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Sell Rate" hint="blank = priced by the engine" type="number" min="0" step="any" value={sell} onChange={(e) => setSell(e.target.value)} />
            {fin && <Field label="Cost Rate" hint="blank = landed cost" type="number" min="0" step="any" value={cost} onChange={(e) => setCost(e.target.value)} />}
          </div>
        </>
      )}
    </Modal>
  )
}

// Quotations come from the shared /lookups/quotations picker (id · number · customer · status — no money),
// which every internal role may read — including the Project Manager who lives on this page.
function FromQuoteModal({ onClose, quotations, loading, loadErr, busy, onGen }) {
  const [qid, setQid] = useState('')
  const list = quotations || []
  const opts = [
    { value: '', label: '— Select a quotation —' },
    ...list.map((q) => ({ value: q.id, label: q.label || `${q.number || ''} · ${q.customer || ''}`.trim() })),
  ]
  return (
    <Modal open title="Generate from Quotation" subtitle="Import the quotation's line items into this BOQ" onClose={onClose}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!qid || busy} onClick={() => onGen(qid)}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Generate Lines
        </button>
      </>}>
      {loading ? (
        <p className="text-sm text-muted"><Loader2 size={15} className="inline animate-spin" /> Loading quotations…</p>
      ) : loadErr ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">Quotations could not be loaded: {loadErr}</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted">There are no quotations in the system yet. Create one in Sales, or add the BOQ items manually.</p>
      ) : (
        <>
          <Select label="Quotation" value={qid} onChange={(e) => setQid(e.target.value)} options={opts} />
          <p className="text-[11px] text-muted">Every line of the selected quotation is imported into this BOQ. Rates are re-priced by the engine.</p>
        </>
      )}
    </Modal>
  )
}
