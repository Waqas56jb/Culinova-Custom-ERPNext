import { useState, useEffect, useMemo, useCallback } from 'react'
import { Send, Award, Plus, Search, Package, Clock, Trophy } from 'lucide-react'
import { PageHeader, Badge } from '../components/ui.jsx'
import { Modal, Field, Select, TextArea } from '../components/Modal.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

// local status → pill tone (ui.jsx statusTone doesn't cover Sent/Responded/Awarded)
const pill = { Open: 'blue', Sent: 'violet', Quoted: 'amber', Awarded: 'green', Ordered: 'green', Responded: 'green' }
const money = (n, cur) => (n == null ? '—' : `${cur || 'SAR'} ${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`)

export default function RFQs() {
  const { rfqs, resAdd, resGet, resList, reload, items, suppliers, projects, settings } = useData()
  const { user } = useAuth()
  const canApprove = ['Approval', 'Full Admin'].includes(user?.access_level)

  const [newOpen, setNewOpen] = useState(false)
  const [detailId, setDetailId] = useState(null)

  const counts = useMemo(() => ({
    total: rfqs.length,
    open: rfqs.filter((r) => ['Open', 'Sent'].includes(r.status)).length,
    quoted: rfqs.filter((r) => r.status === 'Quoted').length,
    awarded: rfqs.filter((r) => ['Awarded', 'Ordered'].includes(r.status)).length,
  }), [rfqs])

  return (
    <>
      <PageHeader title="Requests for Quotation (RFQ)" subtitle="Create RFQs from EOS items, send to suppliers, compare quotes & award the best">
        <button className="btn-primary" onClick={() => setNewOpen(true)}><Plus size={16} /> New RFQ</button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total RFQs" value={counts.total} tone="text-ink" />
        <Stat label="Open / Sent" value={counts.open} tone="text-blue-600" />
        <Stat label="Quoted" value={counts.quoted} tone="text-amber-600" />
        <Stat label="Awarded" value={counts.awarded} tone="text-emerald-600" />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">RFQ</th><th className="th">Item</th><th className="th">Project</th><th className="th">Qty</th>
              <th className="th">Quotes</th><th className="th">Status</th><th className="th text-right">Action</th>
            </tr></thead>
            <tbody>
              {rfqs.length === 0 && (
                <tr><td className="td text-muted" colSpan={7}>No RFQs yet. Click <span className="font-semibold text-ink">New RFQ</span> to raise one from the Item Master.</td></tr>
              )}
              {rfqs.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="td font-semibold text-brand-600">{r.ref || r.number}</td>
                  <td className="td font-medium text-ink">{r.item || r.item_name || '—'}</td>
                  <td className="td"><span className="text-xs font-semibold text-violet-600">{r.project_name || '—'}</span></td>
                  <td className="td text-slate-600">{r.qty}</td>
                  <td className="td text-slate-600">{r.suppliers?.length || 0}</td>
                  <td className="td"><Badge tone={pill[r.status] || 'gray'}>{r.status}</Badge></td>
                  <td className="td text-right">
                    <button onClick={() => setDetailId(r.id)} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-500 hover:text-white">
                      {r.status === 'Open' ? <><Send size={13} /> Manage</> : r.status === 'Awarded' || r.status === 'Ordered' ? <><Trophy size={13} /> {r.awarded || r.awarded_supplier}</> : <><Award size={13} /> Compare</>}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {newOpen && (
        <NewRFQModal
          items={items} projects={projects}
          onClose={() => setNewOpen(false)}
          onCreate={async (body) => { const created = await resAdd('rfqs', body); await reload('rfqs'); setNewOpen(false); setDetailId(created.id) }}
        />
      )}

      {detailId && (
        <RFQDetail
          id={detailId} resGet={resGet} resAdd={resAdd} resList={resList}
          suppliers={suppliers} currencies={settings?.currencies} canApprove={canApprove}
          onChanged={() => reload('rfqs')}
          onClose={() => setDetailId(null)}
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

// ── NEW RFQ ────────────────────────────────────────────────────────────────────
function NewRFQModal({ items, projects, onClose, onCreate }) {
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState({})      // item_id → qty
  const [project, setProject] = useState('')
  const [due, setDue] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (items || [])
      .filter((it) => !s || (it.item_name || it.name || '').toLowerCase().includes(s) || (it.item_code || it.code || '').toLowerCase().includes(s))
      .slice(0, 60)
  }, [items, q])

  const toggle = (it) => setPicked((p) => { const n = { ...p }; if (n[it.id] != null) delete n[it.id]; else n[it.id] = 1; return n })
  const setQty = (id, v) => setPicked((p) => ({ ...p, [id]: Math.max(1, Number(v) || 1) }))
  const pickedList = Object.keys(picked)

  const submit = async () => {
    setErr('')
    if (!pickedList.length) { setErr('Select at least one item from the Item Master.'); return }
    setBusy(true)
    try {
      await onCreate({
        project_id: project || null,
        project_name: (projects.find((p) => p.id === project)?.name) || null,
        due_date: due || null,
        notes: notes || null,
        items: pickedList.map((id) => ({ item_id: id, qty: picked[id] })),
      })
    } catch (e) { setErr(e.message || 'Failed to create RFQ'); setBusy(false) }
  }

  return (
    <Modal open onClose={onClose} size="lg" title="New RFQ" subtitle="Pick items from the Item Master — EOS-linked items carry their approved specification"
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? 'Creating…' : `Create RFQ (${pickedList.length} item${pickedList.length === 1 ? '' : 's'})`}</button>
      </>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select label="Project (optional)" value={project} onChange={(e) => setProject(e.target.value)}
          options={[{ value: '', label: '— None —' }, ...(projects || []).map((p) => ({ value: p.id, label: p.name }))]} />
        <Field label="Due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </div>

      <div>
        <span className="mb-1.5 block text-xs font-semibold text-slate-600">Items</span>
        <label className="relative block">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items by name or code…"
            className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-500/15" />
        </label>
        <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-slate-200">
          {filtered.length === 0 && <p className="p-4 text-xs text-muted">No matching items.</p>}
          {filtered.map((it) => {
            const on = picked[it.id] != null
            return (
              <div key={it.id} className={`flex items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-0 ${on ? 'bg-brand-50/60' : ''}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(it)} className="h-4 w-4 accent-brand-500" />
                <button type="button" onClick={() => toggle(it)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium text-ink">{it.item_name || it.name}</p>
                  <p className="truncate text-[11px] text-muted">{it.item_code || it.code}</p>
                </button>
                {it.eos_entry_id && <span className="chip bg-violet-50 text-violet-700"><Package size={11} /> EOS</span>}
                {on && <input type="number" min={1} value={picked[it.id]} onChange={(e) => setQty(it.id, e.target.value)}
                  className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm" aria-label="Quantity" />}
              </div>
            )
          })}
        </div>
      </div>

      <TextArea label="Notes (optional)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      {err && <p className="text-xs font-semibold text-rose-600">{err}</p>}
    </Modal>
  )
}

// ── DETAIL (Suppliers · Quotes · Compare) ──────────────────────────────────────
function RFQDetail({ id, resGet, resAdd, resList, suppliers, currencies, canApprove, onChanged, onClose }) {
  const [rfq, setRfq] = useState(null)
  const [tab, setTab] = useState('suppliers')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try { setRfq(await resGet('rfqs', id)) } catch (e) { setErr(e.message) }
  }, [id, resGet])
  useEffect(() => { load() }, [load])

  const refresh = async () => { await load(); onChanged?.() }

  if (!rfq) {
    return <Modal open onClose={onClose} title="Loading…"><p className="text-sm text-muted">{err || 'Loading RFQ…'}</p></Modal>
  }

  const tabs = [
    { k: 'suppliers', label: `Suppliers (${rfq.suppliers?.length || 0})`, icon: Send },
    { k: 'quotes', label: `Quotes (${rfq.quotes?.length || 0})`, icon: Clock },
    { k: 'compare', label: 'Compare & Award', icon: Award },
  ]

  return (
    <Modal open onClose={onClose} size="xl"
      title={`${rfq.number} · ${rfq.status}`}
      subtitle={[rfq.item_name, rfq.project_name].filter(Boolean).join(' · ') || 'RFQ detail'}
      footer={<button className="btn-ghost" onClick={onClose}>Close</button>}>

      {/* line items */}
      <div className="rounded-xl border border-slate-200 p-3">
        <p className="mb-2 text-xs font-semibold text-slate-600">Requested items</p>
        <div className="space-y-1.5">
          {(rfq.items || []).length === 0 && <p className="text-xs text-muted">{rfq.item_name || 'No line items.'}</p>}
          {(rfq.items || []).map((li) => (
            <div key={li.id} className="flex items-center gap-2 text-sm">
              <span className="font-medium text-ink">{li.item_name}</span>
              <span className="text-muted">× {li.qty} {li.uom || ''}</span>
              {li.specifications && <span className="chip bg-violet-50 text-violet-700"><Package size={11} /> spec attached</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-1.5 border-b border-slate-200">
        {tabs.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition ${tab === t.k ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-ink'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'suppliers' && <SuppliersTab rfq={rfq} suppliers={suppliers} resAdd={resAdd} onDone={refresh} />}
      {tab === 'quotes' && <QuotesTab rfq={rfq} currencies={currencies} resAdd={resAdd} onDone={refresh} />}
      {tab === 'compare' && <CompareTab rfq={rfq} resList={resList} resAdd={resAdd} canApprove={canApprove} onDone={refresh} />}
    </Modal>
  )
}

function SuppliersTab({ rfq, suppliers, resAdd, onDone }) {
  const [sel, setSel] = useState({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const already = new Set((rfq.suppliers || []).map((s) => (s.supplier || '').toLowerCase()))
  const options = (suppliers || []).filter((s) => !already.has((s.name || '').toLowerCase()))

  const send = async () => {
    setErr('')
    const chosen = Object.keys(sel).filter((k) => sel[k])
    if (!chosen.length) { setErr('Select at least one supplier.'); return }
    setBusy(true)
    try {
      await resAdd(`rfqs/${rfq.id}/suppliers`, { suppliers: chosen.map((id) => ({ supplier_id: id, supplier: suppliers.find((s) => s.id === id)?.name })) })
      setSel({}); await onDone()
    } catch (e) { setErr(e.message || 'Failed to send') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-3">
      {(rfq.suppliers || []).length > 0 && (
        <div className="space-y-1.5">
          {rfq.suppliers.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
              <span className="text-sm font-medium text-ink">{s.supplier}{s.email ? <span className="ml-2 text-xs text-muted">{s.email}</span> : null}</span>
              <Badge tone={pill[s.status] || 'gray'}>{s.status}</Badge>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 p-3">
        <p className="mb-2 text-xs font-semibold text-slate-600">Send to more suppliers</p>
        {options.length === 0 ? (
          <p className="text-xs text-muted">{(suppliers || []).length === 0 ? 'No suppliers on file. Add suppliers in the Suppliers page first.' : 'All suppliers have already been added.'}</p>
        ) : (
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {options.map((s) => (
              <label key={s.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                <input type="checkbox" checked={!!sel[s.id]} onChange={(e) => setSel((p) => ({ ...p, [s.id]: e.target.checked }))} className="h-4 w-4 accent-brand-500" />
                <span className="text-sm text-ink">{s.name}</span>
                {s.category && <span className="text-[11px] text-muted">· {s.category}</span>}
              </label>
            ))}
          </div>
        )}
        {err && <p className="mt-2 text-xs font-semibold text-rose-600">{err}</p>}
        <button className="btn-primary mt-3" disabled={busy || options.length === 0} onClick={send}><Send size={14} /> {busy ? 'Sending…' : 'Send RFQ'}</button>
      </div>
    </div>
  )
}

function QuotesTab({ rfq, currencies, resAdd, onDone }) {
  const curOpts = (currencies?.length ? currencies.map((c) => c.code) : ['SAR', 'USD', 'EUR', 'AED'])
  const sentSuppliers = (rfq.suppliers || []).map((s) => s.supplier)
  const [f, setF] = useState({ supplier: '', quote: '', currency: curOpts[0], lead_time_days: '', validity_days: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  const submit = async () => {
    setErr('')
    if (!f.supplier.trim()) { setErr('Choose or type the supplier.'); return }
    if (f.quote === '' || Number.isNaN(Number(f.quote))) { setErr('Enter a numeric quote amount.'); return }
    setBusy(true)
    try {
      await resAdd(`rfqs/${rfq.id}/quotes`, {
        supplier: f.supplier.trim(), quote: Number(f.quote), currency: f.currency,
        lead_time_days: f.lead_time_days === '' ? null : Number(f.lead_time_days),
        validity_days: f.validity_days === '' ? null : Number(f.validity_days),
        notes: f.notes || null,
      })
      setF((p) => ({ ...p, supplier: '', quote: '', lead_time_days: '', validity_days: '', notes: '' }))
      await onDone()
    } catch (e) { setErr(e.message || 'Failed to record quote') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-3">
      {(rfq.quotes || []).length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[520px] text-sm">
            <thead><tr className="bg-slate-50/60"><th className="th">Supplier</th><th className="th">Quote</th><th className="th">Lead</th><th className="th">Validity</th></tr></thead>
            <tbody>
              {rfq.quotes.map((q) => (
                <tr key={q.id} className="border-t border-slate-100">
                  <td className="td font-medium text-ink">{q.supplier}{q.is_awarded && <span className="ml-2 chip bg-emerald-50 text-emerald-700"><Trophy size={11} /> awarded</span>}</td>
                  <td className="td">{money(q.quote, q.currency)}</td>
                  <td className="td text-muted">{q.lead_time_days != null ? `${q.lead_time_days} d` : '—'}</td>
                  <td className="td text-muted">{q.validity_days != null ? `${q.validity_days} d` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 p-3">
        <p className="mb-2 text-xs font-semibold text-slate-600">Record a received quote</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {sentSuppliers.length > 0 ? (
            <Select label="Supplier" value={f.supplier} onChange={(e) => set('supplier', e.target.value)}
              options={[{ value: '', label: '— Select —' }, ...sentSuppliers.map((s) => ({ value: s, label: s }))]} />
          ) : (
            <Field label="Supplier" value={f.supplier} onChange={(e) => set('supplier', e.target.value)} placeholder="Supplier name" />
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Quote amount" type="number" value={f.quote} onChange={(e) => set('quote', e.target.value)} placeholder="0" />
            <Select label="Currency" value={f.currency} onChange={(e) => set('currency', e.target.value)} options={curOpts} />
          </div>
          <Field label="Lead time (days)" type="number" value={f.lead_time_days} onChange={(e) => set('lead_time_days', e.target.value)} placeholder="e.g. 14" />
          <Field label="Validity (days)" type="number" value={f.validity_days} onChange={(e) => set('validity_days', e.target.value)} placeholder="e.g. 30" />
        </div>
        <TextArea label="Notes (optional)" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        {err && <p className="mt-1 text-xs font-semibold text-rose-600">{err}</p>}
        <button className="btn-primary mt-3" disabled={busy} onClick={submit}><Plus size={14} /> {busy ? 'Saving…' : 'Save quote'}</button>
      </div>
    </div>
  )
}

function CompareTab({ rfq, resList, resAdd, canApprove, onDone }) {
  const [cmp, setCmp] = useState(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try { setCmp(await resList(`rfqs/${rfq.id}/compare`)) } catch (e) { setErr(e.message) }
  }, [rfq.id, resList])
  useEffect(() => { load() }, [load])

  const rows = cmp?.rows || []
  const awardedAlready = rfq.status === 'Awarded' || rfq.status === 'Ordered'

  const award = async (supplier) => {
    setErr(''); setBusy(supplier)
    try { await resAdd(`rfqs/${rfq.id}/award`, { supplier }); await onDone() }
    catch (e) { setErr(e.message || 'Failed to award'); setBusy('') }
  }

  if (!cmp) return <p className="py-4 text-sm text-muted">{err || 'Loading comparison…'}</p>
  if (!rows.length) return <p className="py-4 text-sm text-muted">No quotes received yet. Record supplier quotes in the <span className="font-semibold text-ink">Quotes</span> tab to compare them here.</p>

  return (
    <div className="space-y-3">
      {cmp.recommended && !awardedAlready && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <Trophy size={16} /> Recommended: <span className="font-bold">{cmp.recommended}</span> — lowest price in {cmp.base_currency}.
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[720px] text-sm">
          <thead><tr className="bg-slate-50/60">
            <th className="th">Supplier</th><th className="th">Quote</th><th className="th">In {cmp.base_currency}</th>
            <th className="th">Lead time</th><th className="th">Validity</th><th className="th text-right">Action</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.supplier} className={`border-t border-slate-100 ${r.is_lowest ? 'bg-emerald-50/50' : ''}`}>
                <td className="td font-semibold text-ink">
                  {r.supplier}
                  {r.is_awarded && <span className="ml-2 chip bg-emerald-100 text-emerald-700"><Trophy size={11} /> awarded</span>}
                </td>
                <td className="td">{money(r.quote, r.currency)}</td>
                <td className="td font-semibold">
                  {sar(r.base_quote)}
                  {r.is_lowest && <span className="ml-2 chip bg-emerald-50 text-emerald-700">lowest</span>}
                </td>
                <td className="td">
                  {r.lead_time_days != null ? `${r.lead_time_days} d` : '—'}
                  {r.is_fastest && <span className="ml-2 chip bg-blue-50 text-blue-700">fastest</span>}
                </td>
                <td className="td text-muted">{r.validity_days != null ? `${r.validity_days} d` : '—'}</td>
                <td className="td text-right">
                  {awardedAlready ? (
                    <span className="text-xs text-muted">{r.is_awarded ? 'Awarded' : '—'}</span>
                  ) : canApprove ? (
                    <button onClick={() => award(r.supplier)} disabled={!!busy}
                      className="btn-primary !py-1.5 !px-3 text-xs"><Award size={13} /> {busy === r.supplier ? 'Awarding…' : 'Award'}</button>
                  ) : (
                    <span className="text-[11px] text-muted">Approver only</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {err && <p className="text-xs font-semibold text-rose-600">{err}</p>}
      <p className="text-xs text-muted">Awarding the winner creates a Purchase Order from that quote and links it back to this RFQ.</p>
    </div>
  )
}
