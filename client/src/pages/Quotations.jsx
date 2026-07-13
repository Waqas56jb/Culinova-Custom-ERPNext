import { useState, useMemo, useEffect } from 'react'
import {
  Plus, AlertTriangle, Pencil, Check, X, ThumbsUp, FileText, Loader2, Search, Trash2,
  History, Send, Package, ClipboardList, Wallet, ScrollText,
} from 'lucide-react'
import { PageHeader, Badge, statusTone, KpiCard } from '../components/ui.jsx'
import { Modal, Field, Select, TextArea, Row } from '../components/Modal.jsx'
import { sar } from '../data/mockData.js'
import { api } from '../api.js'
import { useData } from '../store/DataContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import QuotationPreview from '../components/QuotationPreview.jsx'

// mirrors server rbac/permissions.financialRoles — decides whether cost/GP UI renders at all
const FINANCIAL_ROLES = ['Management', 'System Admin', 'Accounts User', 'Purchase User', 'Stock User', 'Project Manager']
// roles whose access level includes 'update' (server gates edit/discount/revise on 'update')
const EDITORS = ['Management', 'System Admin', 'Sales Manager']
const APPROVERS = ['Management', 'System Admin', 'Sales Manager']
// Sending and marking Lost are 'create'-level actions on the server — a Sales User must be able to do
// both, otherwise the quotation they just built is unreachable forever (and CEO rule #10 says a
// quotation is never deleted, only marked Lost).
const SENDERS = ['Management', 'System Admin', 'Sales Manager', 'Sales User']

const n0 = (v) => Number(v) || 0
// strip HTML/JSON noise for a compact spec/description preview
const preview = (s, len = 90) => {
  if (!s) return ''
  let t = String(s)
  if (t.trim().startsWith('{')) { try { t = Object.entries(JSON.parse(t)).filter(([k]) => k !== 'source' && k !== 'eos_entry_id').map(([k, v]) => `${k}: ${v}`).join(' · ') } catch { /* keep */ } }
  t = t.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return t.length > len ? t.slice(0, len) + '…' : t
}
const itemRate = (it) => n0(it.selling_price) || n0(it.selling_rate) || n0(it.standard_rate) || 0
const itemCost = (it) => (it.landed_cost != null ? n0(it.landed_cost) : it.cost != null ? n0(it.cost) : null)

export default function Quotations() {
  const d = useData()
  const { quotations, items, customers, settings, loadAll, approveQuotation, rejectQuotation, sendQuotation, lostQuotation } = d
  const { user } = useAuth()
  const showFin = FINANCIAL_ROLES.includes(user?.role)
  const canEdit = EDITORS.includes(user?.role)
  const canApprove = APPROVERS.includes(user?.role)
  const canSend = SENDERS.includes(user?.role)

  // Projects live in the projects panel, which Sales cannot read — so the store's `projects` array is
  // permanently empty here. Use the shared read-only lookup instead, which every internal role may read.
  const [projectOpts, setProjectOpts] = useState([])
  useEffect(() => {
    d.lookupProjects().then((r) => setProjectOpts(Array.isArray(r) ? r : [])).catch(() => setProjectOpts([]))
  }, [d])

  const vatRate = useMemo(() => {
    const vs = settings?.vatSettings || []
    const r = vs.find((v) => v.is_active && v.is_default)?.rate ?? vs.find((v) => v.is_active)?.rate ?? 15
    return Number(r) / 100
  }, [settings])

  const [busy, setBusy] = useState(null)
  const [preview_, setPreview] = useState(null)
  const [builder, setBuilder] = useState(null)   // { editingId, ...header, lines: [] }
  const [revView, setRevView] = useState(null)   // { quotation, revisions }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const run = async (id, fn) => { setBusy(id); try { await fn() } catch (e) { alert(e.message) } finally { setBusy(null) } }
  const reject = (q) => { const reason = window.prompt('Reject (approval) — reason (optional):') ?? ''; run(q.id, () => rejectQuotation(q.id, reason)) }
  // A quotation is never deleted — it is marked Lost with a mandatory reason (CEO rule #10), which the
  // server records in the revision history.
  const markLost = (q) => {
    const reason = window.prompt(`Mark ${q.ref} as Lost — reason (required):`)
    if (reason == null) return                       // cancelled
    if (!reason.trim()) { alert('A reason is required to mark a quotation as Lost.'); return }
    run(q.id, () => lostQuotation(q.id, reason.trim()))
  }

  // ── KPIs ──
  const totalValue = quotations.reduce((s, q) => s + n0(q.amount), 0)
  const openCount = quotations.filter((q) => ['Open', 'Draft', 'Pending Approval'].includes(q.status)).length
  const orderedCount = quotations.filter((q) => q.status === 'Ordered').length

  // ── builder state ──
  const emptyHeader = { customer: '', contact_person: '', project_name: '', project_id: '', customer_email: '', validity_days: 30, payment_terms: '50% advance, 50% on delivery', currency: 'SAR', terms_text: '', notes: '', discount_pct: 0, discount_fixed: 0 }
  const openBuilder = async (q = null) => {
    setError('')
    if (!q) { setBuilder({ editingId: null, ...emptyHeader, lines: [] }); return }
    setBusy(q.id)
    try {
      const full = await api(`/quotations/${q.id}`)
      const lines = (full.quotation_items || []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((l) => ({
        item_id: l.item_id, item_name: l.item_name, brand: l.brand, model: l.model, uom: l.uom,
        description: l.description, specifications: l.specifications, image_url: l.image_url, datasheet_url: l.datasheet_url,
        qty: n0(l.qty), rate: n0(l.rate), cost: l.cost, discount_pct: n0(l.discount_pct),
      }))
      setBuilder({
        editingId: full.id, customer: full.customer || '', contact_person: full.contact_person || '',
        project_name: full.project_name || '', project_id: full.project_id || '', customer_email: full.customer_email || '',
        validity_days: full.validity_days || 30, payment_terms: full.payment_terms || '', currency: full.currency || 'SAR',
        terms_text: full.terms_text || '', notes: full.notes || '', discount_pct: n0(full.discount_pct), discount_fixed: n0(full.discount_fixed),
        lines,
      })
    } catch (e) { alert(e.message) } finally { setBusy(null) }
  }

  const setH = (patch) => setBuilder((b) => ({ ...b, ...patch }))
  const addLine = (it) => setBuilder((b) => {
    if (b.lines.some((l) => l.item_id === it.id)) return b
    return {
      ...b, lines: [...b.lines, {
        item_id: it.id, item_name: it.item_name || it.name, brand: it.brand, model: it.model,
        uom: it.uom || it.stock_uom || 'Nos', description: it.description, specifications: it.specifications,
        image_url: it.image_url, datasheet_url: it.datasheet_url, qty: 1, rate: itemRate(it), cost: itemCost(it), discount_pct: 0,
      }],
    }
  })
  const setLine = (i, patch) => setBuilder((b) => ({ ...b, lines: b.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }))
  const removeLine = (i) => setBuilder((b) => ({ ...b, lines: b.lines.filter((_, idx) => idx !== i) }))

  // live totals (server recomputes authoritatively on save)
  const bNet = builder ? builder.lines.reduce((s, l) => s + n0(l.qty) * n0(l.rate) * (1 - n0(l.discount_pct) / 100), 0) : 0
  const bCost = builder ? builder.lines.reduce((s, l) => s + n0(l.qty) * (l.cost != null ? n0(l.cost) : 0), 0) : 0
  const bDiscAmt = Math.min(bNet, (bNet * Math.max(0, n0(builder?.discount_pct))) / 100 + Math.max(0, n0(builder?.discount_fixed)))
  const bAfter = bNet - bDiscAmt
  const bVat = bAfter * vatRate
  const bTotal = bAfter + bVat
  const bGp = bAfter > 0 ? ((bAfter - bCost) / bAfter) * 100 : 0

  const saveBuilder = async () => {
    setError('')
    if (!builder.customer.trim()) { setError('Customer is required'); return }
    if (!builder.lines.length) { setError('Add at least one item to the quotation'); return }
    setSaving(true)
    const body = {
      customer: builder.customer.trim(), contact_person: builder.contact_person || null, project_name: builder.project_name || null,
      project_id: builder.project_id || null, customer_email: builder.customer_email || null,
      validity_days: Number(builder.validity_days) || 30, payment_terms: builder.payment_terms || null,
      currency: builder.currency || 'SAR', terms_text: builder.terms_text || null, notes: builder.notes || null,
      discount_pct: n0(builder.discount_pct), discount_fixed: n0(builder.discount_fixed),
      items: builder.lines.map((l, i) => ({
        item_id: l.item_id, item_name: l.item_name, brand: l.brand, model: l.model, uom: l.uom,
        description: l.description, specifications: l.specifications, image_url: l.image_url, datasheet_url: l.datasheet_url,
        qty: n0(l.qty), rate: n0(l.rate), discount_pct: n0(l.discount_pct), sort_order: i,
      })),
    }
    try {
      if (builder.editingId) await api(`/quotations/${builder.editingId}`, { method: 'PATCH', body })
      else await api('/quotations', { method: 'POST', body })
      await loadAll()
      setBuilder(null)
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const revise = async () => {
    if (!builder?.editingId) return
    const note = window.prompt('Revision note (what changed / why):') ?? ''
    setSaving(true)
    try { await api(`/quotations/${builder.editingId}/revise`, { method: 'POST', body: { note } }); await loadAll() }
    catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const openRevisions = async (q) => {
    setBusy(q.id)
    try { const revisions = await api(`/quotations/${q.id}/revisions`); setRevView({ quotation: q, revisions: revisions || [] }) }
    catch (e) { alert(e.message) } finally { setBusy(null) }
  }

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
      <PageHeader title="Quotations / Estimation" subtitle="EOS-driven equipment quotes — auto specs, technical data, images, terms & revisions">
        <button className="btn-primary" onClick={() => openBuilder()}><Plus size={16} /> New Quotation</button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Quotations" value={quotations.length} icon={FileText} accent="brand" />
        <KpiCard label="Open / Draft" value={openCount} icon={ClipboardList} accent="violet" />
        <KpiCard label="Ordered" value={orderedCount} icon={Check} accent="emerald" />
        <KpiCard label="Pipeline Value" value={sar(totalValue)} icon={Wallet} accent="gold" />
      </div>

      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 animate-fade-up">
        <AlertTriangle size={18} className="shrink-0" />
        <span><b>How it works:</b> pick equipment from the Item Master — its specs, technical data, images &amp; datasheet are snapshotted onto the quote. Line rates prefill from the pricing chain. A discount can never exceed the item’s cap. <b>Only the customer</b> can Accept / Reject (in their portal).</span>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead>
              <tr className="bg-slate-50/60">
                <th className="th">Quotation</th><th className="th">Customer</th><th className="th">Amount (incl. VAT)</th>
                <th className="th">Disc.</th>{showFin && <th className="th">GP</th>}
                <th className="th">Valid Till</th><th className="th">Rev.</th><th className="th">Status</th><th className="th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {quotations.map((q) => {
                const pending = q.approval === 'Pending'
                const locked = ['Ordered', 'Lost'].includes(q.status)
                return (
                  <tr key={q.id} className="hover:bg-slate-50/60">
                    <td className="td font-semibold text-brand-600">{q.ref}</td>
                    <td className="td font-medium text-ink">{q.customer}</td>
                    <td className="td font-semibold">{sar(q.amount)}</td>
                    <td className="td text-slate-500">{q.discount ? `${q.discount}%` : '—'}</td>
                    {showFin && <td className="td"><span className={`chip ${q.gp < 35 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>{q.gp}%</span></td>}
                    <td className="td text-slate-500">{q.valid_till || (q.validity ? `${q.validity} days` : '—')}</td>
                    <td className="td text-slate-400">r{q.revision ?? 0}</td>
                    <td className="td"><Badge tone={statusTone(q.status)}>{q.status}</Badge></td>
                    <td className="td">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Act onClick={() => setPreview(q)} tone="slate" icon={FileText}>PDF</Act>
                        <Act onClick={() => openRevisions(q)} tone="slate" icon={History} loading={busy === q.id}>Revisions</Act>
                        {canEdit && !locked && <Act onClick={() => openBuilder(q)} icon={Pencil} loading={busy === q.id}>{q.status === 'Draft' ? 'Build' : 'Edit'}</Act>}
                        {canSend && q.status === 'Draft' && <Act onClick={() => run(q.id, () => sendQuotation(q.id))} tone="emerald" icon={Send}>Send</Act>}
                        {canSend && !locked && q.status !== 'Lost' && <Act onClick={() => markLost(q)} tone="rose" icon={X} loading={busy === q.id}>Lost</Act>}
                        {pending && canApprove && (
                          <>
                            <Act onClick={() => run(q.id, () => approveQuotation(q.id))} tone="emerald" icon={ThumbsUp} loading={busy === q.id}>Approve</Act>
                            <Act onClick={() => reject(q)} tone="rose" icon={X} loading={busy === q.id}>Reject</Act>
                          </>
                        )}
                        {q.status === 'Ordered' && <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><Check size={13} /> Ordered</span>}
                        {q.status === 'Open' && <span className="text-xs font-medium text-slate-400">Sent · awaiting customer</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {quotations.length === 0 && <tr><td className="td text-slate-400" colSpan={showFin ? 9 : 8}>No quotations yet. Click “New Quotation” to build one from the Item Master.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {builder && (
        <Builder
          builder={builder} setH={setH} items={items} customers={customers} projects={projectOpts}
          currencies={settings?.currencies || []} addLine={addLine} setLine={setLine} removeLine={removeLine}
          totals={{ net: bNet, discAmt: bDiscAmt, vat: bVat, total: bTotal, gp: bGp, cost: bCost, vatRate }}
          showFin={showFin} onClose={() => setBuilder(null)} onSave={saveBuilder} onRevise={revise}
          saving={saving} error={error}
        />
      )}

      {revView && <RevisionsModal open onClose={() => setRevView(null)} data={revView} showFin={showFin} />}
      <QuotationPreview open={!!preview_} onClose={() => setPreview(null)} quotation={preview_} />
    </>
  )
}

// ── The quotation BUILDER ────────────────────────────────────────────────────
function Builder({ builder, setH, items, customers, projects, currencies, addLine, setLine, removeLine, totals, showFin, onClose, onSave, onRevise, saving, error }) {
  const [q, setQ] = useState('')
  const [terms, setTerms] = useState([])
  const [pickTerm, setPickTerm] = useState('')

  useEffect(() => { api('/quotations/terms').then(setTerms).catch(() => setTerms([])) }, [])

  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    return (items || []).filter((it) => {
      const hay = `${it.item_name || it.name || ''} ${it.brand || ''} ${it.model || ''} ${it.item_group || ''}`.toLowerCase()
      return hay.includes(s)
    }).slice(0, 8)
  }, [q, items])

  const insertTerm = (id) => {
    const t = terms.find((x) => x.id === id)
    if (!t) return
    const block = `${t.name}: ${t.body}`
    setH({ terms_text: builder.terms_text ? `${builder.terms_text}\n${block}` : block })
    setPickTerm('')
  }

  const custOpts = ['', ...new Set((customers || []).map((c) => c.name).filter(Boolean))]
  // options come from /lookups/projects → { id, ref, name, label } (readable by Sales)
  const projOpts = [{ value: '', label: '— none —' }, ...(projects || []).map((p) => ({ value: p.id, label: p.label || [p.ref, p.name].filter(Boolean).join(' · ') }))]
  const currOpts = (currencies?.length ? currencies.map((c) => c.code) : ['SAR'])

  return (
    <Modal open size="xl" onClose={onClose}
      title={builder.editingId ? 'Edit Quotation' : 'New Quotation'}
      subtitle="Pick equipment from the Item Master — specs, technical data & images are auto-imported"
      footer={
        <>
          {error && <span className="mr-auto self-center text-xs font-semibold text-rose-600">{error}</span>}
          {builder.editingId && <button className="btn-ghost" onClick={onRevise} disabled={saving}><History size={15} /> Save Revision</button>}
          <button className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={onSave} disabled={saving}>{saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {builder.editingId ? 'Save Changes' : 'Create Quotation'}</button>
        </>
      }>
      {/* customer + project */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Customer *</span>
          <input list="qb-customers" value={builder.customer} onChange={(e) => setH({ customer: e.target.value })}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm outline-none focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-500/15" placeholder="Select or type a customer" />
          <datalist id="qb-customers">{custOpts.filter(Boolean).map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <Field label="Contact Person" value={builder.contact_person} onChange={(e) => setH({ contact_person: e.target.value })} placeholder="Attn." />
        <Field label="Customer Email" type="email" value={builder.customer_email} onChange={(e) => setH({ customer_email: e.target.value })} placeholder="name@company.com" />
        <Field label="Project Name" value={builder.project_name} onChange={(e) => setH({ project_name: e.target.value })} placeholder="e.g. Main Kitchen Fit-out" />
        <Select label="Linked Project (optional)" value={builder.project_id || ''} onChange={(e) => setH({ project_id: e.target.value })} options={projOpts} />
        <Select label="Validity" value={builder.validity_days} onChange={(e) => setH({ validity_days: Number(e.target.value) })} options={[{ value: 15, label: '15 days' }, { value: 30, label: '30 days' }, { value: 60, label: '60 days' }]} />
        <Field label="Payment Terms" value={builder.payment_terms} onChange={(e) => setH({ payment_terms: e.target.value })} placeholder="e.g. 50% advance, 50% on delivery" />
        <Select label="Currency" value={builder.currency} onChange={(e) => setH({ currency: e.target.value })} options={currOpts} />
      </div>

      {/* item picker */}
      <div className="rounded-xl border border-slate-200 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-bold text-ink"><Package size={16} className="text-brand-500" /> Equipment Lines</div>
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the Item Master by name, brand or model…"
            className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-500/15" />
          {results.length > 0 && (
            <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
              {results.map((it) => (
                <button key={it.id} onClick={() => { addLine(it); setQ('') }}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50">
                  <ItemThumb src={it.image_url} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{it.item_name || it.name}</p>
                    <p className="truncate text-[11px] text-slate-500">{[it.brand, it.model].filter(Boolean).join(' · ') || it.item_group}{(() => { const pv = preview(it.specifications || it.description, 60); return pv ? ` — ${pv}` : '' })()}</p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-brand-600">{sar(itemRate(it))}</span>
                </button>
              ))}
            </div>
          )}
          {q.trim() && results.length === 0 && <p className="mt-2 text-xs text-slate-400">No matching items in the Item Master.</p>}
        </div>

        {/* lines */}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-2 py-1.5 text-left">Equipment</th>
                <th className="px-2 py-1.5 text-right">Qty</th>
                <th className="px-2 py-1.5 text-right">Rate</th>
                <th className="px-2 py-1.5 text-right">Disc %</th>
                <th className="px-2 py-1.5 text-right">Amount</th>
                <th className="px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {builder.lines.map((l, i) => {
                const amt = n0(l.qty) * n0(l.rate) * (1 - n0(l.discount_pct) / 100)
                return (
                  <tr key={l.item_id || i} className="border-t border-slate-100 align-top">
                    <td className="px-2 py-2">
                      <div className="flex items-start gap-2.5">
                        <ItemThumb src={l.image_url} />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink">{l.item_name}</p>
                          <p className="text-[11px] text-slate-500">{[l.brand, l.model].filter(Boolean).join(' · ')}</p>
                          {preview(l.specifications || l.description, 70) && <p className="mt-0.5 text-[11px] text-slate-400">{preview(l.specifications || l.description, 70)}</p>}
                          {l.datasheet_url && <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-500"><FileText size={11} /> datasheet</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right"><input type="number" min="0" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm" /></td>
                    <td className="px-2 py-2 text-right"><input type="number" min="0" value={l.rate} onChange={(e) => setLine(i, { rate: e.target.value })} className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm" /></td>
                    <td className="px-2 py-2 text-right"><input type="number" min="0" max="100" value={l.discount_pct} onChange={(e) => setLine(i, { discount_pct: e.target.value })} className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm" /></td>
                    <td className="px-2 py-2 text-right font-semibold text-ink">{sar(amt)}</td>
                    <td className="px-2 py-2 text-right"><button onClick={() => removeLine(i)} className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button></td>
                  </tr>
                )
              })}
              {builder.lines.length === 0 && <tr><td colSpan={6} className="px-2 py-6 text-center text-xs text-slate-400">Search above and click an item to add it as a quotation line.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* terms + totals */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div>
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600"><ScrollText size={14} /> Commercial Terms</span>
            <select value={pickTerm} onChange={(e) => { setPickTerm(e.target.value); insertTerm(e.target.value) }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm outline-none focus:border-brand-400 focus:bg-white">
              <option value="">Insert a standard term…</option>
              {terms.map((t) => <option key={t.id} value={t.id}>{t.category} — {t.name}</option>)}
            </select>
          </div>
          <TextArea label="Terms &amp; Conditions text" rows={4} value={builder.terms_text} onChange={(e) => setH({ terms_text: e.target.value })} placeholder="Payment, delivery, warranty…" />
          <TextArea label="Notes / Special Requirements" rows={2} value={builder.notes} onChange={(e) => setH({ notes: e.target.value })} />
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
          <p className="mb-3 text-sm font-bold text-ink">Totals</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-slate-600"><span>Net (before discount)</span><span className="font-semibold">{sar(totals.net)}</span></div>
            <Row>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-500">Header Discount %</span>
                <input type="number" min="0" max="100" value={builder.discount_pct} onChange={(e) => setH({ discount_pct: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-500">Fixed Discount</span>
                <input type="number" min="0" value={builder.discount_fixed} onChange={(e) => setH({ discount_fixed: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" />
              </label>
            </Row>
            {totals.discAmt > 0 && <div className="flex justify-between text-rose-600"><span>Discount</span><span>− {sar(totals.discAmt)}</span></div>}
            <div className="flex justify-between text-slate-600"><span>VAT ({(totals.vatRate * 100).toFixed(0)}%)</span><span>{sar(totals.vat)}</span></div>
            <div className="flex justify-between rounded-lg bg-brand-50 px-3 py-2 text-base font-extrabold text-brand-700"><span>Total</span><span>{sar(totals.total)}</span></div>
            {showFin && (
              <div className="mt-2 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                <span className="font-semibold text-slate-500">Gross Profit</span>
                <span className={`font-bold ${totals.gp < 35 ? 'text-rose-600' : 'text-emerald-600'}`}>{totals.gp.toFixed(1)}% · {sar(totals.net - totals.discAmt - totals.cost)}</span>
              </div>
            )}
          </div>
          <p className="mt-3 text-[11px] text-slate-400">A discount above the item’s cap will be rejected on save. Final figures are recomputed on the server.</p>
        </div>
      </div>
    </Modal>
  )
}

function ItemThumb({ src }) {
  const [ok, setOk] = useState(true)
  if (src && ok) return <img src={src} alt="" onError={() => setOk(false)} className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 object-cover" />
  return <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 bg-slate-100 text-slate-300"><Package size={16} /></div>
}

// ── Revision history ─────────────────────────────────────────────────────────
function RevisionsModal({ open, onClose, data, showFin }) {
  const { quotation, revisions } = data
  const label = (a) => ({ created: 'Created', revised: 'Revised', edited: 'Edited', lost: 'Marked Lost' }[a] || a || 'Change')
  return (
    <Modal open={open} onClose={onClose} size="lg" title={`Revision History — ${quotation.ref}`} subtitle={`${revisions.length} record(s) · revisions are never deleted`}>
      {revisions.length === 0 && <p className="text-sm text-slate-400">No revisions recorded yet.</p>}
      <ol className="relative space-y-4 border-l border-slate-200 pl-5">
        {revisions.map((r) => {
          const c = r.changes || {}
          const diff = Array.isArray(c.diff) ? c.diff : []
          return (
            <li key={r.id} className="relative">
              <span className="absolute -left-[27px] top-1 grid h-4 w-4 place-items-center rounded-full bg-brand-500 text-white"><History size={9} /></span>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="blue">rev {r.revision >= 9999 ? '—' : r.revision}</Badge>
                <span className="text-sm font-semibold text-ink">{label(c.action)}</span>
                {c.by && <span className="text-xs text-slate-500">by {c.by}</span>}
                <span className="ml-auto text-[11px] text-slate-400">{(r.created_at || '').replace('T', ' ').slice(0, 16)}</span>
              </div>
              {c.note && <p className="mt-1 text-xs text-slate-600">“{c.note}”</p>}
              {c.reason && <p className="mt-1 text-xs text-rose-600">Reason: {c.reason}</p>}
              {diff.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {diff.map((d, i) => (
                    <li key={i} className="text-[11px] text-slate-500">
                      <span className="font-semibold text-slate-600">{d.field}</span>: <span className="text-slate-400 line-through">{String(d.from ?? '—')}</span> → <span className="text-slate-700">{String(d.to ?? '—')}</span>
                    </li>
                  ))}
                </ul>
              )}
              {showFin && c.snapshot?.header?.total_amount != null && (
                <p className="mt-1 text-[11px] text-slate-400">Total at this revision: {sar(c.snapshot.header.total_amount)}{c.snapshot.header.gp_percent != null ? ` · GP ${c.snapshot.header.gp_percent}%` : ''}</p>
              )}
            </li>
          )
        })}
      </ol>
    </Modal>
  )
}
