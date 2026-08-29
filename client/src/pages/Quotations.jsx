import { useState, useMemo, useEffect, useRef } from 'react'
import { specPreview, specGroups } from '../data/specs'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Plus, AlertTriangle, Pencil, Check, X, ThumbsUp, FileText, Loader2, Search, Trash2,
  History, Send, Package, ClipboardList, Wallet, ScrollText, RefreshCw,
  Boxes, CheckCircle2, ShoppingCart, PackageCheck, Truck,
} from 'lucide-react'
import { PageHeader, Badge, statusTone, KpiCard } from '../components/ui.jsx'
import { Modal, Field, Select, TextArea, Row } from '../components/Modal.jsx'
import { sar } from '../data/mockData.js'
import { api } from '../api.js'
import { useData } from '../store/DataContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import QuotationPreview from '../components/QuotationPreview.jsx'
import LostReasonModal from '../components/LostReasonModal.jsx'

const MANDATORY_FIELDS = ['customer', 'contact_person', 'project_name', 'project_location', 'validity_days', 'payment_terms']
const FIELD_LABEL = {
  customer: 'Customer', contact_person: 'Contact', project_name: 'Project name',
  project_location: 'Project location', validity_days: 'Validity days', payment_terms: 'Payment terms',
}
function missingMandatory(h) {
  const miss = []
  for (const f of MANDATORY_FIELDS) {
    if (f === 'validity_days') {
      const n = Number(h?.validity_days)
      if (!Number.isFinite(n) || n <= 0 || n > 365) miss.push(f)
    } else if (!h?.[f] && h?.[f] !== 0) miss.push(f)
  }
  return miss
}

const STATUS_FILTERS = ['All', 'Draft', 'Pending Approval', 'Sent', 'Under Negotiation', 'Rejected', 'Ordered', 'Lost', 'Expired']

// mirrors server rbac/permissions.financialRoles — decides whether cost/GP UI renders at all
const FINANCIAL_ROLES = ['Management', 'System Admin', 'Accounts User', 'Purchase User', 'Stock User', 'Project Manager']
// roles whose access level includes 'update' (server gates discount/revise on 'update')
const EDITORS = ['Management', 'System Admin', 'Sales Manager']
// Sales User (Create) may reopen their own Draft to finish building before Send — server allows PATCH on own Draft only.
const canEditQuote = (q, user) => {
  if (['Ordered', 'Lost', 'Rejected'].includes(q?.status)) return false
  if (EDITORS.includes(user?.role)) return true
  return user?.role === 'Sales User' && q?.status === 'Draft' && q?.owner_id === user?.id
}
const APPROVERS = ['Management', 'System Admin', 'Sales Manager']
// Sending and marking Lost are 'create'-level actions on the server — a Sales User must be able to do
// both, otherwise the quotation they just built is unreachable forever (and CEO rule #10 says a
// quotation is never deleted, only marked Lost).
const SENDERS = ['Management', 'System Admin', 'Sales Manager', 'Sales User']

const n0 = (v) => Number(v) || 0
const fmtDec = (n) => Number(n || 0).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
// Compact spec/description preview. The EOS specification is an ARRAY of attribute objects, so the
// old `${key}: ${value}` interpolation rendered it as "[object Object]" — see data/specs.js.
const preview = (s, len = 90) => specPreview(s, len)
const itemRate = (it) => n0(it.selling_price) || n0(it.selling_rate) || n0(it.standard_rate) || 0
const itemCost = (it) => (it.landed_cost != null ? n0(it.landed_cost) : it.cost != null ? n0(it.cost) : null)

/** Live VR-chain price from server; falls back to stored fields when the request fails. */
async function fetchServerPrice(it) {
  if (!it?.id) {
    return { rate: itemRate(it), cost: itemCost(it), needs_rate: n0(itemRate(it)) === 0, stale: true, pricing_basis: null }
  }
  try {
    const priced = await api(`/quotations/price-items?ids=${it.id}`)
    const p = priced[it.id]
    if (!p) throw new Error('no price')
    if (!p.priced) {
      return { rate: 0, cost: null, needs_rate: true, stale: false, pricing_basis: p.basis || 'none' }
    }
    return {
      rate: n0(p.selling),
      cost: p.estimated_cost != null ? n0(p.estimated_cost) : (p.expected_landed != null ? n0(p.expected_landed) : null),
      needs_rate: false,
      stale: false,
      pricing_basis: p.basis || null,
    }
  } catch {
    return {
      rate: itemRate(it),
      cost: itemCost(it),
      needs_rate: n0(itemRate(it)) === 0 && !(Number(it.valuation_rate) > 0),
      stale: true,
      pricing_basis: null,
    }
  }
}
const lineNeedsRateWarn = (l) => l.needs_rate || ((l.valuation_rate == null || n0(l.valuation_rate) === 0) && n0(l.rate) === 0)
const plural = (n) => (n === 1 ? '' : 's')

// CEO rule — STOCK FIRST: "first check the available stock; only after utilising the available stock
// allow purchasing". The server does the allocation (POST /quotations/check-stock, and it persists the
// same split on every saved line). These helpers only READ what the server returned — nothing here
// invents, rounds or guesses a quantity.

// Roll up the split PERSISTED on a saved quotation's lines (quotation_items.from_stock / to_purchase).
// Lines created before the stock engine existed carry NULLs — in that case we know nothing, and we say
// nothing (return null) rather than fabricate a "0% stock" chip.
const stockOf = (q) => {
  const lines = q?.items || []
  if (!lines.length) return null
  if (!lines.every((l) => l.from_stock != null && l.to_purchase != null)) return null
  const total_qty = lines.reduce((s, l) => s + n0(l.qty), 0)
  if (total_qty <= 0) return null
  const from_stock = lines.reduce((s, l) => s + n0(l.from_stock), 0)
  const to_purchase = lines.reduce((s, l) => s + n0(l.to_purchase), 0)
  return { total_qty, from_stock, to_purchase, pct: Math.round((from_stock / total_qty) * 100) }
}

/** Action chip — fires on pointerdown so a mid-click DataContext re-render cannot swallow the click. */
function QuoteAct({ onClick, tone = 'brand', icon: Icon, children, disabled, loading, compact }) {
  const blocked = !!(disabled || loading)
  const firedRef = useRef(false)
  const tones = {
    rose: 'border-rose-200/80 text-rose-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 active:bg-rose-100',
    emerald: 'border-emerald-200/80 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 active:bg-emerald-100',
    slate: 'border-slate-200/80 text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 active:bg-slate-100',
    brand: 'border-brand-200/80 text-brand-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 active:bg-brand-100',
  }
  const run = (e) => {
    if (blocked) return
    onClick?.(e)
  }
  return (
    <button
      type="button"
      disabled={blocked}
      onPointerDown={(e) => {
        if (e.button != null && e.button !== 0) return
        if (blocked) return
        firedRef.current = true
        e.preventDefault()
        e.stopPropagation()
        run(e)
      }}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (firedRef.current) { firedRef.current = false; return }
        run(e)
      }}
      className={`inline-flex cursor-pointer touch-manipulation select-none items-center justify-center gap-1.5 rounded-xl border bg-white font-semibold
        transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out
        hover:shadow-sm active:scale-[0.97]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/25
        disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:active:scale-100
        ${compact ? 'min-h-[36px] px-2.5 py-1.5 text-[11px]' : 'min-h-[40px] px-3.5 py-2 text-xs sm:min-h-[36px] sm:px-3 sm:py-1.5'}
        ${tones[tone] || tones.brand}`}
    >
      {loading ? <Loader2 size={14} className="animate-spin shrink-0" /> : Icon && <Icon size={14} className="shrink-0 opacity-80" />}
      <span className="whitespace-nowrap">{children}</span>
    </button>
  )
}

function QuoteActions({
  q, canEditRow, canSend, canApprove, canRevise, locked, pending,
  isBusy, setPreview, openRevisions, openBuilder, confirmSend, markLost, run, approveQuotation, reject, reviseQuote,
}) {
  const miss = q.missing_fields?.length ? q.missing_fields : missingMandatory(q)
  const incomplete = q.status === 'Draft' && miss.length > 0
  const missList = miss.map((f) => FIELD_LABEL[f] || f).join(', ')
  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
      <QuoteAct onClick={() => setPreview(q)} tone="slate" icon={FileText}>PDF</QuoteAct>
      <QuoteAct onClick={() => openRevisions(q)} tone="slate" icon={History} loading={isBusy(q.id, 'revisions')}>Revisions</QuoteAct>
      {canEditRow(q) && (
        <QuoteAct onClick={() => openBuilder(q)} icon={Pencil} loading={isBusy(q.id, 'build')}>
          {q.status === 'Draft' ? 'Build' : 'Edit'}
        </QuoteAct>
      )}
      {canRevise && ['Rejected', 'Sent', 'Under Negotiation', 'Expired'].includes(q.status) && (
        <QuoteAct onClick={() => reviseQuote(q)} tone="violet" icon={History} loading={isBusy(q.id, 'revise')}>Revise</QuoteAct>
      )}
      {canSend && q.status === 'Draft' && (
        <span title={incomplete ? `Incomplete: ${missList}` : undefined} className="inline-flex">
          <QuoteAct
            onClick={() => !incomplete && confirmSend(q)}
            tone="emerald"
            icon={Send}
            loading={isBusy(q.id, 'send')}
            disabled={incomplete}
          >
            Send
          </QuoteAct>
        </span>
      )}
      {canSend && !locked && q.status !== 'Lost' && q.status !== 'Rejected' && (
        <QuoteAct onClick={() => markLost(q)} tone="rose" icon={X} loading={isBusy(q.id, 'lost')}>Lost</QuoteAct>
      )}
      {pending && canApprove && (
        <>
          <QuoteAct onClick={() => run(q.id, 'approve', () => approveQuotation(q.id))} tone="emerald" icon={ThumbsUp} loading={isBusy(q.id, 'approve')}>Approve</QuoteAct>
          <QuoteAct onClick={() => reject(q)} tone="rose" icon={X} loading={isBusy(q.id, 'reject')}>Reject</QuoteAct>
        </>
      )}
      {q.status === 'Ordered' && (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
          <Check size={12} /> Ordered
        </span>
      )}
      {(q.status === 'Sent' || q.status === 'Open') && (
        <span className="text-[11px] font-medium text-slate-400">Sent · awaiting customer</span>
      )}
      {q.status === 'Under Negotiation' && (
        <span className="text-[11px] font-medium text-amber-600">Under negotiation</span>
      )}
    </div>
  )
}

export default function Quotations() {
  const d = useData()
  const location = useLocation()
  const navigate = useNavigate()
  const { quotations, items, customers, settings, opportunities, loadAll, loadQuotations, pauseSync, resumeSync, approveQuotation, rejectQuotation, sendQuotation, lostQuotation } = d
  const { user } = useAuth()
  const isMgmt = ['Management', 'System Admin'].includes(user?.role)
  const showFin = FINANCIAL_ROLES.includes(user?.role)
  const canEdit = EDITORS.includes(user?.role)
  const canEditRow = (q) => canEditQuote(q, user)
  const canApprove = APPROVERS.includes(user?.role)
  const canSend = SENDERS.includes(user?.role)
  const canRevise = EDITORS.includes(user?.role) || user?.role === 'Sales User'

  const [tab, setTab] = useState('list') // list | lost
  const [statusFilter, setStatusFilter] = useState('All')
  const [lostModal, setLostModal] = useState(null) // quotation row
  const [lostReport, setLostReport] = useState(null)

  // Projects live in the projects panel, which Sales cannot read — so the store's `projects` array is
  // permanently empty here. Use the shared read-only lookup instead, which every internal role may read.
  const [projectOpts, setProjectOpts] = useState([])
  useEffect(() => {
    let alive = true
    d.lookupProjects().then((r) => { if (alive) setProjectOpts(Array.isArray(r) ? r : []) }).catch(() => { if (alive) setProjectOpts([]) })
    return () => { alive = false }
    // Mount-once: depending on `d` re-fired on every DataContext tick and ate clicks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // Keep background loadAll off while the builder is open OR an action is in flight
  // (avoids starving Save PATCH and swallowing button clicks mid-press).
  useEffect(() => {
    if (!builder && !busy) { resumeSync?.(); return }
    pauseSync?.()
    return () => resumeSync?.()
  }, [builder, busy, pauseSync, resumeSync])

  const run = async (id, action, fn) => {
    setBusy(`${id}:${action}`)
    try { await fn() } catch (e) { alert(e.message) } finally { setBusy(null) }
  }
  const isBusy = (id, action) => busy === `${id}:${action}`
  const reject = (q) => {
    const reason = window.prompt('Reject (approval) — reason (optional):') ?? ''
    run(q.id, 'reject', () => rejectQuotation(q.id, reason))
  }
  // A quotation is never deleted — it is marked Lost with a fixed reason (CEO rule #10/#13).
  const markLost = (q) => setLostModal(q)
  const reviseQuote = (q) => {
    const note = window.prompt(`Revise ${q.ref || q.number} — note (optional):`) ?? ''
    if (note === null) return
    run(q.id, 'revise', async () => {
      await api(`/quotations/${q.id}/revise`, { method: 'POST', body: { note: note.trim() || null } })
      await loadQuotations()
    })
  }
  const confirmSend = async (q) => {
    setBusy(`${q.id}:send`)
    try {
      const full = await api(`/quotations/${q.id}`)
      const miss = missingMandatory(full)
      if (miss.length) {
        alert(`Cannot send — incomplete: ${miss.map((f) => FIELD_LABEL[f] || f).join(', ')}`)
        return
      }
      const zeroCount = (full.quotation_items || []).filter((l) => l.needs_rate || n0(l.rate) === 0).length
      if (zeroCount > 0 && !window.confirm(`${zeroCount} line(s) have no price. Send anyway?`)) return
      await sendQuotation(q.id)
    } catch (e) { alert(e.message) } finally { setBusy(null) }
  }

  // ── KPIs ──
  const totalValue = quotations.reduce((s, q) => s + n0(q.amount), 0)
  const openCount = quotations.filter((q) => ['Open', 'Sent', 'Draft', 'Pending Approval', 'Under Negotiation'].includes(q.status)).length
  const orderedCount = quotations.filter((q) => q.status === 'Ordered').length

  const filteredQuotes = useMemo(() => {
    if (statusFilter === 'All') return quotations
    if (statusFilter === 'Sent') return quotations.filter((q) => q.status === 'Sent' || q.status === 'Open')
    return quotations.filter((q) => q.status === statusFilter)
  }, [quotations, statusFilter])

  useEffect(() => {
    if (tab !== 'lost') return
    api('/sales/reports/lost-analysis').then(setLostReport).catch(() => setLostReport(null))
  }, [tab, quotations])

  // ── builder state ──
  const emptyHeader = {
    opportunity_id: '', customer: '', contact_person: '', project_name: '', project_id: '', project_location: '',
    customer_email: '', validity_days: 30, payment_terms: '100% Advanced Payment', currency: 'SAR',
    terms_text: '', notes: '', discount_pct: 0, discount_fixed: 0, override_reason: '',
    delivery_time: '5-7 Days After Approval',
    warranty_terms: 'Two-years warranty: 1st year covers labor & parts, 2nd year covers labor only (excludes parts). Misuse not covered',
    sales_consultant: '', sales_consultant_phone: '', sales_consultant_email: '', area: '', language: 'en',
  }
  const openBuilderFromPrefill = (prefill) => {
    setError('')
    const preLines = (prefill.lines || []).map((l) => ({
      item_id: l.item_id,
      item_code: l.item_code,
      item_name: l.item_name,
      brand: l.brand,
      model: l.model,
      uom: l.uom || 'Nos',
      description: l.description,
      specifications: l.specifications,
      image_url: l.image_url,
      datasheet_url: l.datasheet_url,
      pos: l.pos || l.area || '',
      qty: n0(l.qty) || 1,
      rate: n0(l.rate),
      cost: l.cost != null ? n0(l.cost) : null,
      discount_pct: n0(l.discount_pct),
    }))
    setBuilder({
      editingId: null,
      ...emptyHeader,
      opportunity_id: prefill.opportunity_id,
      customer: prefill.customer || '',
      contact_person: prefill.contact_person || '',
      customer_email: prefill.customer_email || '',
      project_name: prefill.project_name || '',
      project_location: prefill.project_location || '',
      sales_consultant: prefill.sales_consultant || '',
      sales_consultant_email: prefill.sales_consultant_email || '',
      sales_consultant_phone: prefill.sales_consultant_phone || '',
      lines: preLines,
    })
    if (prefill.unresolved?.length) {
      setError(`${prefill.unresolved.length} BOQ line(s) could not be matched to Item Master — add them manually.`)
    }
  }
  const openBuilder = async (q = null) => {
    setError('')
    if (!q) { setBuilder({ editingId: null, ...emptyHeader, lines: [], linesDirty: true }); return }
    setBusy(`${q.id}:build`)
    try {
      const full = await api(`/quotations/${q.id}`)
      const lines = (full.quotation_items || []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((l) => {
        const margin = n0(l.add_margin_pct)
        const rate = n0(l.rate)
        // base_rate = chain price before margin (never the already-margined rate)
        const base_rate = margin > 0.001
          ? Math.round((rate / (1 + margin / 100)) * 100) / 100
          : rate
        return {
          item_id: l.item_id, item_code: l.item_code, item_name: l.item_name, brand: l.brand, model: l.model, uom: l.uom,
          description: l.description, specifications: l.specifications, image_url: l.image_url, datasheet_url: l.datasheet_url,
          pos: l.pos || l.area || '',
          qty: n0(l.qty), rate, cost: l.cost, discount_pct: n0(l.discount_pct),
          add_margin_pct: margin, base_rate,
        }
      })
      setBuilder({
        editingId: full.id, opportunity_id: full.opportunity_id || '',
        customer: full.customer || '', contact_person: full.contact_person || '',
        project_name: full.project_name || '', project_id: full.project_id || '', project_location: full.project_location || '',
        customer_email: full.customer_email || '',
        validity_days: full.validity_days || 30, payment_terms: full.payment_terms || '', currency: full.currency || 'SAR',
        terms_text: full.terms_text || '', notes: full.notes || '', discount_pct: n0(full.discount_pct), discount_fixed: n0(full.discount_fixed),
        override_reason: full.override_reason || '',
        discount_source: full.discount_source || '',
        valid_till: full.valid_till || '',
        delivery_time: full.delivery_time || emptyHeader.delivery_time,
        warranty_terms: full.warranty_terms || emptyHeader.warranty_terms,
        sales_consultant: full.sales_consultant || '', sales_consultant_phone: full.sales_consultant_phone || '',
        sales_consultant_email: full.sales_consultant_email || '', area: full.area || '', language: full.language || 'en',
        lines, linesDirty: false,
      })
    } catch (e) { alert(e.message) } finally { setBusy(null) }
  }

  const setH = (patch) => setBuilder((b) => ({ ...b, ...patch }))
  const addLine = async (it) => {
    if (builder?.lines?.some((l) => l.item_id === it.id)) return
    const price = await fetchServerPrice(it)
    setBuilder((b) => {
      if (b.lines.some((l) => l.item_id === it.id)) return b
      return {
        ...b, linesDirty: true, lines: [...b.lines, {
          item_id: it.id, item_code: it.item_code || it.code, item_name: it.item_name || it.name, brand: it.brand, model: it.model,
          uom: it.uom || it.stock_uom || 'Nos', description: it.description, specifications: it.specifications,
          image_url: it.image_url, datasheet_url: it.datasheet_url, pos: '',
          qty: 1, rate: price.rate, base_rate: price.rate, cost: price.cost, discount_pct: 0, add_margin_pct: 0,
          valuation_rate: it.valuation_rate != null ? n0(it.valuation_rate) : undefined,
          needs_rate: price.needs_rate, stale_price: price.stale, pricing_basis: price.pricing_basis,
        }],
      }
    })
  }
  const setLine = (i, patch) => setBuilder((b) => ({ ...b, linesDirty: true, lines: b.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }))
  const removeLine = (i) => setBuilder((b) => ({ ...b, linesDirty: true, lines: b.lines.filter((_, idx) => idx !== i) }))

  // live totals (server recomputes authoritatively on save)
  const bNet = builder ? builder.lines.reduce((s, l) => s + n0(l.qty) * n0(l.rate) * (1 - n0(l.discount_pct) / 100), 0) : 0
  const bCost = builder ? builder.lines.reduce((s, l) => s + n0(l.qty) * (l.cost != null ? n0(l.cost) : 0), 0) : 0
  const bDiscAmt = Math.min(bNet, (bNet * Math.max(0, n0(builder?.discount_pct))) / 100 + Math.max(0, n0(builder?.discount_fixed)))
  const bAfter = bNet - bDiscAmt
  const bVat = bAfter * vatRate
  const bTotal = bAfter + bVat
  const bGp = bAfter > 0 ? ((bAfter - bCost) / bAfter) * 100 : 0

  useEffect(() => {
    if (location.state?.quotePrefill) {
      openBuilderFromPrefill(location.state.quotePrefill)
      navigate(location.pathname, { replace: true, state: {} })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.quotePrefill])

  const saveBuilder = async () => {
    setError('')
    if (!builder.customer.trim()) { setError('Customer is required'); return }
    if (!builder.editingId && !builder.opportunity_id) { setError('Quotation must be linked to an Opportunity — create from Opportunities page'); return }
    if (!builder.lines.length) { setError('Add at least one item to the quotation'); return }
    setSaving(true)
    const body = {
      opportunity_id: builder.opportunity_id || null,
      customer: builder.customer.trim(), contact_person: builder.contact_person || null, project_name: builder.project_name || null,
      project_id: builder.project_id || null, project_location: builder.project_location || null, customer_email: builder.customer_email || null,
      validity_days: Number(builder.validity_days) || 30, payment_terms: builder.payment_terms || null,
      currency: builder.currency || 'SAR', terms_text: builder.terms_text || null, notes: builder.notes || null,
      discount_pct: n0(builder.discount_pct), discount_fixed: n0(builder.discount_fixed),
      override_reason: builder.override_reason?.trim() || null,
      delivery_time: builder.delivery_time || null, warranty_terms: builder.warranty_terms || null,
      sales_consultant: builder.sales_consultant || null, sales_consultant_phone: builder.sales_consultant_phone || null,
      sales_consultant_email: builder.sales_consultant_email || null, area: builder.area || null, language: builder.language || 'en',
      // Skip full line rebuild on edit when only header/discount changed — that path was taking 50s+.
      ...((!builder.editingId || builder.linesDirty) ? {
        items: builder.lines.map((l, i) => ({
          item_id: l.item_id, item_code: l.item_code, item_name: l.item_name, brand: l.brand, model: l.model, uom: l.uom,
          description: l.description, specifications: l.specifications, image_url: l.image_url, datasheet_url: l.datasheet_url,
          pos: l.pos || null,
          qty: n0(l.qty), rate: n0(l.rate), discount_pct: n0(l.discount_pct), sort_order: i,
          ...(l.add_margin_pct != null && n0(l.add_margin_pct) > 0 ? { add_margin_pct: n0(l.add_margin_pct) } : {}),
        })),
      } : {}),
    }
    try {
      if (builder.editingId) await api(`/quotations/${builder.editingId}`, { method: 'PATCH', body })
      else await api('/quotations', { method: 'POST', body })
      setBuilder(null)
      setSaving(false)
      ;(loadQuotations || loadAll)().catch(() => {})
    } catch (e) { setError(e.message); setSaving(false) }
  }

  const revise = async () => {
    if (!builder?.editingId) return
    const note = window.prompt('Revision note (what changed / why):') ?? ''
    setSaving(true)
    try {
      await api(`/quotations/${builder.editingId}/revise`, { method: 'POST', body: { note } })
      await (loadQuotations?.() || loadAll())
    }
    catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const openRevisions = async (q) => {
    setBusy(`${q.id}:revisions`)
    try { const revisions = await api(`/quotations/${q.id}/revisions`); setRevView({ quotation: q, revisions: revisions || [] }) }
    catch (e) { alert(e.message) } finally { setBusy(null) }
  }

  const actionProps = {
    canEditRow, canSend, canApprove, canRevise, isBusy, setPreview, openRevisions, openBuilder,
    confirmSend, markLost, run, approveQuotation, reject, reviseQuote,
  }

  return (
    <>
      <PageHeader title="Quotations / Estimation" subtitle="Create from Opportunity — EOS specs, images & fixed pricing from Item Master">
        <button type="button" className="btn-primary w-full sm:w-auto" onClick={() => navigate('/sales/opportunities')}>
          <Plus size={16} /> New from Opportunity
        </button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <button type="button" onClick={() => setTab('list')}
          className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${tab === 'list' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
          Quotations
        </button>
        <button type="button" onClick={() => setTab('lost')}
          className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${tab === 'lost' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
          Lost Analysis
        </button>
      </div>

      {tab === 'lost' ? (
        <div className="card overflow-hidden p-4 animate-fade-up">
          <h3 className="mb-3 font-display text-base font-bold text-ink">Lost Analysis</h3>
          {!lostReport ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : (
            <>
              <p className="mb-3 text-xs text-slate-500">
                Quotes lost: {lostReport.totals?.quote_count || 0} · Value {sar(lostReport.totals?.quote_value || 0)}
                {' · '}Opportunities: {lostReport.totals?.opportunity_count || 0}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                      <th className="pb-2 pr-3">Reason</th>
                      <th className="pb-2 pr-3">Quotes</th>
                      <th className="pb-2 pr-3">Quote value</th>
                      <th className="pb-2 pr-3">Opps</th>
                      <th className="pb-2">Opp value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(lostReport.by_reason || []).map((r) => (
                      <tr key={r.reason} className="border-t border-slate-100">
                        <td className="py-2 pr-3 font-medium">{r.reason}</td>
                        <td className="py-2 pr-3 tabular-nums">{r.quote_count}</td>
                        <td className="py-2 pr-3 tabular-nums">{sar(r.quote_value)}</td>
                        <td className="py-2 pr-3 tabular-nums">{r.opportunity_count}</td>
                        <td className="py-2 tabular-nums">{sar(r.opportunity_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : (
      <>

      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <KpiCard label="Quotations" value={quotations.length} icon={FileText} accent="brand" />
        <KpiCard label="Open / Draft" value={openCount} icon={ClipboardList} accent="violet" />
        <KpiCard label="Ordered" value={orderedCount} icon={Check} accent="emerald" />
        <KpiCard label="Pipeline Value" value={sar(totalValue)} icon={Wallet} accent="gold" />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((s) => (
          <button key={s} type="button" onClick={() => setStatusFilter(s)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusFilter === s ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {s}
          </button>
        ))}
      </div>

      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-brand-200/70 bg-gradient-to-r from-brand-50 to-white px-3.5 py-3 text-sm text-brand-900 sm:items-center sm:px-4 animate-fade-up">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-brand-600 sm:mt-0" />
        <span className="leading-relaxed">
          <b className="font-semibold">Workflow:</b> Lead → Opportunity → <b className="font-semibold">Create Quotation</b> on the opportunity card.
          <span className="hidden sm:inline"> Customer, contact, project &amp; location inherit automatically. Prices come from the pricing chain — sales cannot edit rates.</span>
        </span>
      </div>

      {/* ── Mobile / tablet cards ── */}
      <div className="space-y-3 lg:hidden">
        {filteredQuotes.length === 0 && (
          <div className="card px-5 py-10 text-center text-sm text-slate-400">
            No quotations yet. Create one from an Opportunity.
          </div>
        )}
        {filteredQuotes.map((q) => {
          const pending = q.approval === 'Pending'
          const locked = ['Ordered', 'Lost', 'Rejected'].includes(q.status)
          const st = stockOf(q)
          return (
            <article key={q.id} className="card overflow-hidden animate-fade-up">
              <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-display text-sm font-bold tracking-tight text-brand-700">{q.ref}</p>
                    <p className="mt-0.5 truncate text-sm font-medium text-ink">{q.customer}</p>
                  </div>
                  <Badge tone={statusTone(q.status)}>{q.status}</Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 px-4 py-3.5 text-sm">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Amount</p>
                  <p className="mt-0.5 font-bold tabular-nums text-ink">{sar(q.amount)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Discount</p>
                  <p className="mt-0.5 font-semibold text-slate-600">{q.discount ? `${q.discount}%` : '—'}</p>
                </div>
                {showFin && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">GP</p>
                    <span className={`chip mt-0.5 ${q.gp < 35 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>{q.gp}%</span>
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Valid till</p>
                  <p className="mt-0.5 text-xs font-medium leading-snug text-slate-600">
                    {q.valid_till
                      ? `${q.valid_till}${q.validity_days ? ` (${q.validity_days} days)` : ''}`
                      : (q.validity ? `${q.validity} days` : '—')}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Stock</p>
                  <div className="mt-0.5">
                    {st ? (
                      <span
                        title={`${st.from_stock} of ${st.total_qty} unit${plural(st.total_qty)} from stock · ${st.to_purchase} to purchase`}
                        className={`chip ${st.to_purchase === 0 ? 'bg-emerald-50 text-emerald-600' : st.from_stock === 0 ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'}`}>
                        {st.pct}%{st.to_purchase > 0 ? ` · buy ${st.to_purchase}` : ''}
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Revision</p>
                  <p className="mt-0.5 font-medium text-slate-500">r{q.revision ?? 0}</p>
                </div>
              </div>
              <div className="border-t border-slate-100 bg-white px-4 py-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Actions</p>
                <QuoteActions q={q} locked={locked} pending={pending} {...actionProps} />
              </div>
            </article>
          )
        })}
      </div>

      {/* ── Desktop table ── */}
      <div className="card hidden overflow-hidden lg:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead>
              <tr className="bg-slate-50/80">
                <th className="th">Quotation</th>
                <th className="th">Customer</th>
                <th className="th">Amount (incl. VAT)</th>
                <th className="th">Disc.</th>
                {showFin && <th className="th">GP</th>}
                <th className="th">Stock</th>
                <th className="th">Valid Till</th>
                <th className="th">Rev.</th>
                <th className="th">Status</th>
                <th className="th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {quotations.map((q) => {
                const pending = q.approval === 'Pending'
                const locked = ['Ordered', 'Lost'].includes(q.status)
                const st = stockOf(q)
                return (
                  <tr key={q.id} className="transition-colors hover:bg-slate-50/70">
                    <td className="td font-semibold text-brand-600">{q.ref}</td>
                    <td className="td font-medium text-ink">{q.customer}</td>
                    <td className="td font-semibold tabular-nums">{sar(q.amount)}</td>
                    <td className="td text-slate-500">{q.discount ? `${q.discount}%` : '—'}</td>
                    {showFin && (
                      <td className="td">
                        <span className={`chip ${q.gp < 35 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>{q.gp}%</span>
                      </td>
                    )}
                    <td className="td">
                      {st ? (
                        <span
                          title={`${st.from_stock} of ${st.total_qty} unit${plural(st.total_qty)} from stock · ${st.to_purchase} to purchase`}
                          className={`chip ${st.to_purchase === 0 ? 'bg-emerald-50 text-emerald-600' : st.from_stock === 0 ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'}`}>
                          {st.pct}% stock{st.to_purchase > 0 ? ` · buy ${st.to_purchase}` : ''}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="td text-slate-500">
                      {q.valid_till
                        ? `${q.valid_till}${q.validity_days ? ` (${q.validity_days} days)` : ''}`
                        : (q.validity ? `${q.validity} days` : '—')}
                    </td>
                    <td className="td text-slate-400">r{q.revision ?? 0}</td>
                    <td className="td"><Badge tone={statusTone(q.status)}>{q.status}</Badge></td>
                    <td className="td">
                      <QuoteActions q={q} locked={locked} pending={pending} {...actionProps} />
                    </td>
                  </tr>
                )
              })}
              {quotations.length === 0 && (
                <tr>
                  <td className="td text-slate-400" colSpan={showFin ? 10 : 9}>
                    No quotations yet. Click “New from Opportunity” to build one from the Item Master.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {builder && (
        <Builder
          builder={builder} setH={setH} items={items} customers={customers} projects={projectOpts} opportunities={opportunities}
          currencies={settings?.currencies || []} addLine={addLine} setLine={setLine} removeLine={removeLine}
          totals={{ net: bNet, discAmt: bDiscAmt, vat: bVat, total: bTotal, gp: bGp, cost: bCost, vatRate }}
          showFin={showFin} canEditRate={showFin} canLineMargin={isMgmt} onClose={() => setBuilder(null)} onSave={saveBuilder} onRevise={revise}
          saving={saving} error={error} canRefreshPrices={showFin || SENDERS.includes(user?.role)}
        />
      )}

      {revView && <RevisionsModal open onClose={() => setRevView(null)} data={revView} showFin={showFin} />}
      <QuotationPreview open={!!preview_} onClose={() => setPreview(null)} quotation={preview_} />
    </>
  )
}

// ── The quotation BUILDER ────────────────────────────────────────────────────
function Builder({ builder, setH, items, customers, projects, opportunities, currencies, addLine, setLine, removeLine, totals, showFin, canEditRate, canLineMargin, onClose, onSave, onRevise, saving, error, canRefreshPrices }) {
  const d = useData()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [terms, setTerms] = useState([])
  const [paymentTemplates, setPaymentTemplates] = useState([])
  const [pickTerm, setPickTerm] = useState('')
  const [customValidity, setCustomValidity] = useState(false)
  const [smartFamily, setSmartFamily] = useState('')
  const [smartBrand, setSmartBrand] = useState('')
  const [smartRecs, setSmartRecs] = useState([])
  const [smartBusy, setSmartBusy] = useState(false)
  const [searchPrices, setSearchPrices] = useState({})
  const [refreshBusy, setRefreshBusy] = useState(false)

  const productFamilies = useMemo(() => {
    return Array.from(new Set((items || []).map((it) => it.product_family).filter(Boolean))).sort()
  }, [items])

  // Brands stocked in the chosen family. The recommender can only report "preferred brand" as a
  // reason if it is TOLD the preference — nothing else in the quotation implies one, which is why
  // that reason never appeared.
  const familyBrands = useMemo(() => {
    const pool = smartFamily ? (items || []).filter((it) => it.product_family === smartFamily) : []
    return Array.from(new Set(pool.map((it) => it.brand).filter(Boolean))).sort()
  }, [items, smartFamily])

  // Item-Master search results. MUST be declared before the availability effect below, which lists it
  // as a dependency — a dependency array is read during render, so referencing this const from that
  // array before this line runs throws "Cannot access 'results' before initialization" (its temporal
  // dead zone), which crashes the whole Quotations page to a blank screen.
  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    return (items || []).filter((it) => {
      if (it.disabled) return false
      const hay = `${it.item_name || it.name || ''} ${it.brand || ''} ${it.model || ''} ${it.item_group || ''}`.toLowerCase()
      return hay.includes(s)
    }).slice(0, 8)
  }, [q, items])

  // Server VR-chain prices for search results (rates never invented client-side).
  useEffect(() => {
    const ids = (results || []).map((r) => r.id).filter(Boolean)
    if (!ids.length) { setSearchPrices({}); return }
    let cancelled = false
    api(`/quotations/price-items?ids=${ids.join(',')}`)
      .then((r) => { if (!cancelled) setSearchPrices(r || {}) })
      .catch(() => { if (!cancelled) setSearchPrices({}) })
    return () => { cancelled = true }
  }, [results])

  const displayRate = (it) => {
    const p = searchPrices[it.id]
    if (p?.priced && p.selling != null) return n0(p.selling)
    return itemRate(it)
  }
  // Live availability for whatever the search is currently showing — one bulk call per result set,
  // so the estimator sees stock before committing a line instead of after saving the quotation.
  const [avail, setAvail] = useState({})
  useEffect(() => {
    const ids = (results || []).map((r) => r.id).filter(Boolean)
    if (!ids.length) { setAvail({}); return }
    let cancelled = false
    api(`/inventory/availability-bulk?ids=${ids.join(',')}`)
      .then((r) => { if (!cancelled) setAvail(r || {}) })
      .catch(() => { if (!cancelled) setAvail({}) })   // availability is a hint, never a blocker
    return () => { cancelled = true }
  }, [results])

  const loadSmartRecs = async () => {
    if (!smartFamily) return
    setSmartBusy(true)
    try {
      const qs = new URLSearchParams({ product_family: smartFamily, limit: '5' })
      if (smartBrand) qs.set('brand', smartBrand)
      const recs = await api(`/engineering/equipment-recommendations?${qs}`)
      setSmartRecs(Array.isArray(recs) ? recs : [])
    } catch (e) {
      setSmartRecs([])
      alert(e.message || 'Could not load recommendations')
    } finally { setSmartBusy(false) }
  }

  const addRecLine = async (rec) => {
    const it = (items || []).find((x) => x.id === rec.item_id)
    if (it) await addLine(it)
    else await addLine({
      id: rec.item_id, item_name: rec.item_name, name: rec.item_name,
      brand: rec.brand, model: rec.model, selling_price: rec.selling_price,
      image_url: rec.image_url, specifications: rec.specifications, datasheet_url: rec.datasheet_url,
    })
  }

  const refreshPrices = async () => {
    if (!builder.editingId) return
    setRefreshBusy(true)
    try {
      const preview = await api(`/quotations/${builder.editingId}/refresh-prices`, { method: 'POST', body: { apply: false } })
      const lines = preview.lines || []
      const changed = lines.filter((l) => Math.abs(n0(l.old_rate) - n0(l.new_rate)) > 0.009)
      if (!changed.length) { alert('All line prices are already up to date.'); return }
      const msg = changed.map((l) => `${l.item_name}: ${fmtDec(l.old_rate)} → ${fmtDec(l.new_rate)} SAR`).join('\n')
      if (!window.confirm(`Refresh prices for ${changed.length} line(s)?\n\n${msg}`)) return
      const applied = await api(`/quotations/${builder.editingId}/refresh-prices`, { method: 'POST', body: { apply: true } })
      const refreshed = (applied.quotation?.quotation_items || []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      setH({
        lines: refreshed.map((l) => ({
          item_id: l.item_id, item_code: l.item_code, item_name: l.item_name, brand: l.brand, model: l.model, uom: l.uom,
          description: l.description, specifications: l.specifications, image_url: l.image_url, datasheet_url: l.datasheet_url,
          pos: l.pos || l.area || '',
          qty: n0(l.qty), rate: n0(l.rate), cost: l.cost, discount_pct: n0(l.discount_pct),
          needs_rate: l.needs_rate,
        })),
      })
    } catch (e) { alert(e.message) } finally { setRefreshBusy(false) }
  }

  useEffect(() => { api('/quotations/terms').then(setTerms).catch(() => setTerms([])) }, [])
  useEffect(() => {
    let alive = true
    d.getPaymentTemplates().then((r) => { if (alive) setPaymentTemplates(r || []) }).catch(() => { if (alive) setPaymentTemplates([]) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── STOCK FIRST (CEO rule) ────────────────────────────────────────────────
  // As the quote is composed, ask the server for the live stock-first split. This is a what-if: it
  // saves nothing. The very same allocation is what the server persists on save, reserves on customer
  // acceptance and hands to Procurement — so what is shown here IS what will happen.
  const [stock, setStock] = useState(null)      // { lines, summary, sig } — the server's answer
  const [checking, setChecking] = useState(false)
  const [stockErr, setStockErr] = useState('')
  const [ack, setAck] = useState(false)         // "I understand N units must be purchased"
  const seqRef = useRef(0)                      // out-of-order guard: only the newest reply may land

  // Only the ITEM SET and the QUANTITIES change the stock position — rate/discount edits must not
  // re-trigger a check.
  const sig = useMemo(
    () => JSON.stringify(builder.lines.map((l) => [l.item_id || null, l.item_name || '', n0(l.qty)])),
    [builder.lines],
  )

  useEffect(() => {
    const items_ = builder.lines.map((l) => ({
      item_id: l.item_id || null,          // never '' → the server writes this to a uuid column
      item_name: l.item_name || '',
      qty: n0(l.qty),
    }))
    if (!items_.length) { seqRef.current += 1; setStock(null); setStockErr(''); setChecking(false); return }
    const seq = ++seqRef.current
    setChecking(true)
    const t = setTimeout(async () => {
      try {
        const r = await d.resAdd('quotations/check-stock', { items: items_ })  // POST /api/quotations/check-stock
        if (seq !== seqRef.current) return                                     // a newer request is in flight — drop this reply
        if (!r || !Array.isArray(r.lines) || !r.summary) throw new Error('Stock check returned an unexpected response')
        setStock({ ...r, sig })
        setStockErr('')
      } catch (e) {
        if (seq !== seqRef.current) return
        setStock(null)
        setStockErr(e.message || 'Could not check stock')                      // surfaced in the panel — never swallowed
      } finally {
        if (seq === seqRef.current) setChecking(false)
      }
    }, 400)                                                                    // debounced — typing is never blocked
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])

  // The answer is only trustworthy for the line set it was computed from.
  const fresh = !!stock && stock.sig === sig
  const summary = stock?.summary || null
  const needsProc = !!summary?.needs_procurement
  const toBuy = n0(summary?.to_purchase)

  // Any change to the item set / quantities invalidates the acknowledgement the user gave: they
  // acknowledged a specific shortfall, not this new one. (Rate/discount edits do not change `sig`, so
  // they do not clear it.)
  useEffect(() => { setAck(false) }, [sig])

  // 'Stock first', not 'stock only': a quotation that needs purchasing is never blocked — but the
  // purchase must be deliberate and visible, so it must be acknowledged.
  const blockedByStock = needsProc && !ack

  // Map a builder line → its allocated line. The server returns one entry per line, in order; if the
  // shapes ever disagree we show "checking" rather than a badge that might belong to another item.
  const allocFor = (i, l) => {
    if (!fresh || !stock.lines || stock.lines.length !== builder.lines.length) return null
    const s = stock.lines[i]
    if (!s) return null
    const same = l.item_id ? s.item_id === l.item_id : s.item_name === l.item_name
    return same ? s : null
  }

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
          {!error && blockedByStock && (
            <span className="mr-auto self-center text-xs font-semibold text-amber-700">
              {toBuy} unit{plural(toBuy)} are not in stock — tick the purchase acknowledgement below the totals to save.
            </span>
          )}
          {builder.editingId && canRefreshPrices && (
            <button type="button" className="btn-ghost" onClick={refreshPrices} disabled={saving || refreshBusy}>
              {refreshBusy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Refresh prices
            </button>
          )}
          {builder.editingId && <button className="btn-ghost" onClick={onRevise} disabled={saving}><History size={15} /> Save Revision</button>}
          <button className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={onSave} disabled={saving || blockedByStock}
            title={blockedByStock ? 'Acknowledge the units that must be purchased first' : undefined}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {builder.editingId ? 'Save Changes' : 'Create Quotation'}
          </button>
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
        <Field label="Project Location" value={builder.project_location || ''} onChange={(e) => setH({ project_location: e.target.value })} placeholder="Riyadh → Al Malqa" />
        <Select label="Linked Project (optional)" value={builder.project_id || ''} onChange={(e) => setH({ project_id: e.target.value })} options={projOpts} />
        {!customValidity ? (
          <Select label="Validity" value={builder.validity_days} onChange={(e) => {
            if (e.target.value === 'custom') setCustomValidity(true)
            else setH({ validity_days: Number(e.target.value) })
          }} options={[
            { value: 7, label: '7 days' }, { value: 15, label: '15 days' }, { value: 30, label: '30 days' }, { value: 60, label: '60 days' }, { value: 'custom', label: 'Custom…' },
          ]} />
        ) : (
          <Field label="Custom Validity (days)" type="number" min="1" max="365" value={builder.validity_days} onChange={(e) => setH({ validity_days: Number(e.target.value) })} />
        )}
        {paymentTemplates.length > 0 ? (
          <Select label="Payment Terms" value={builder.payment_terms} onChange={(e) => setH({ payment_terms: e.target.value })}
            options={paymentTemplates.map((t) => ({ value: t.body, label: t.name }))} />
        ) : (
          <Field label="Payment Terms" value={builder.payment_terms} onChange={(e) => setH({ payment_terms: e.target.value })} placeholder="100% Advanced Payment" />
        )}
        <Field label="Delivery Time" value={builder.delivery_time || ''} onChange={(e) => setH({ delivery_time: e.target.value })} />
        <Field label="Warranty" value={builder.warranty_terms || ''} onChange={(e) => setH({ warranty_terms: e.target.value })} />
        <Select label="Currency" value={builder.currency} onChange={(e) => setH({ currency: e.target.value })} options={currOpts} />
      </div>

      {/* item picker */}
      <div className="rounded-xl border border-slate-200 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-bold text-ink"><Package size={16} className="text-brand-500" /> Equipment Lines</div>

        {productFamilies.length > 0 && (
          <div className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border border-brand-100 bg-brand-50/40 p-3">
            <Select label="Smart selection — Product Family" value={smartFamily} onChange={(e) => { setSmartFamily(e.target.value); setSmartBrand(''); setSmartRecs([]) }}
              options={[{ value: '', label: '— pick family —' }, ...productFamilies.map((f) => ({ value: f, label: f }))]} />
            <Select label="Preferred brand (optional)" value={smartBrand} onChange={(e) => { setSmartBrand(e.target.value); setSmartRecs([]) }}
              options={[{ value: '', label: '— no preference —' }, ...familyBrands.map((b) => ({ value: b, label: b }))]} />
            <button type="button" onClick={loadSmartRecs} disabled={!smartFamily || smartBusy}
              className="mb-0.5 inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-3 py-2.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
              {smartBusy ? <Loader2 size={14} className="animate-spin" /> : <Boxes size={14} />} Suggest equipment
            </button>
            {smartRecs.length > 0 && (
              <div className="w-full space-y-1 pt-1">
                {smartRecs.map((rec) => (
                  <button key={rec.item_id} type="button" onClick={() => addRecLine(rec)}
                    className="flex w-full items-center justify-between rounded-lg border border-white bg-white px-3 py-2 text-left text-xs hover:border-brand-200">
                    <span><b>{rec.item_name}</b> · {rec.reason}{rec.in_stock ? ' · in stock' : ''}</span>
                    <span className="font-semibold text-brand-600">{sar(rec.selling_price)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

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
                    <AvailabilityChips a={avail[it.id]} />
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-brand-600">{sar(displayRate(it))}</span>
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
                {canLineMargin && <th className="px-2 py-1.5 text-right">+Margin %</th>}
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
                          {l.stale_price && (
                            <p className="mt-1 text-[11px] font-medium text-slate-500">Stale price — server unavailable; using last stored rate</p>
                          )}
                          {lineNeedsRateWarn(l) && (
                            <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] font-medium text-amber-700">
                              <AlertTriangle size={11} className="shrink-0" />
                              No rate — set Valuation Rate in Pricing Engine
                              {showFin && (
                                <button type="button" onClick={() => nav('/stock/pricing?tab=items')}
                                  className="font-semibold text-brand-600 underline hover:text-brand-700">
                                  Open Pricing Engine →
                                </button>
                              )}
                            </p>
                          )}
                          {l.datasheet_url && <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-500"><FileText size={11} /> datasheet</span>}
                          <div className="mt-1"><StockBadge s={allocFor(i, l)} err={stockErr} /></div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right"><input type="number" min="0" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm" /></td>
                    <td className="px-2 py-2 text-right">
                      {canEditRate ? (
                        <input type="number" min="0" value={l.rate} onChange={(e) => setLine(i, { rate: e.target.value })} className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm" />
                      ) : (
                        <span className="text-sm font-semibold text-slate-600" title="Fixed from pricing chain">{fmtDec(l.rate)}</span>
                      )}
                    </td>
                    {canLineMargin && (
                      <td className="px-2 py-2 text-right">
                        <input type="number" min="0" step="0.1" value={l.add_margin_pct ?? 0}
                          onChange={(e) => {
                            const pct = Math.max(0, n0(e.target.value))
                            const oldMargin = n0(l.add_margin_pct)
                            let base = n0(l.base_rate)
                            // Recover chain base if base was wrongly set to the margined rate
                            if (oldMargin > 0.001 && Math.abs(base - n0(l.rate)) < 0.05) {
                              base = Math.round((n0(l.rate) / (1 + oldMargin / 100)) * 100) / 100
                            }
                            if (!(base > 0)) base = n0(l.rate)
                            setLine(i, {
                              add_margin_pct: e.target.value,
                              base_rate: base,
                              rate: Math.round(base * (1 + pct / 100) * 100) / 100,
                            })
                          }}
                          className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm" title="Management-only additional margin (folded into rate)" />
                      </td>
                    )}
                    <td className="px-2 py-2 text-right"><input type="number" min="0" max="100" value={l.discount_pct} onChange={(e) => setLine(i, { discount_pct: e.target.value })} className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm" /></td>
                    <td className="px-2 py-2 text-right font-semibold text-ink">{sar(amt)}</td>
                    <td className="px-2 py-2 text-right"><button onClick={() => removeLine(i)} className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button></td>
                  </tr>
                )
              })}
              {builder.lines.length === 0 && <tr><td colSpan={canLineMargin ? 7 : 6} className="px-2 py-6 text-center text-xs text-slate-400">Search above and click an item to add it as a quotation line.</td></tr>}
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

        <div className="space-y-4">
        <StockPanel
          lines={builder.lines.length} summary={fresh ? summary : null} checking={checking || (!!builder.lines.length && !fresh && !stockErr)}
          err={stockErr} ack={ack} setAck={setAck}
        />

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
            {canLineMargin && (
              <TextArea label="Strategic override reason" rows={2} value={builder.override_reason || ''} onChange={(e) => setH({ override_reason: e.target.value })}
                placeholder="Required when discount > 25% or GP below 35%" />
            )}
            {builder.discount_source && (
              <p className="text-[11px] text-slate-500">Discount applied by: <span className="font-semibold text-ink">{builder.discount_source}</span></p>
            )}
            {canLineMargin && builder.override_reason && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">
                Override reason on file: {builder.override_reason}
              </p>
            )}
            {builder.validity_days > 0 && (
              <p className="text-[11px] text-slate-500">
                Validity: {builder.validity_days} days
                {builder.valid_till ? ` · Valid till ${builder.valid_till} (${builder.validity_days} days)` : ''}
              </p>
            )}
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
          <p className="mt-3 text-[11px] text-slate-400">Role limits: Sales User 15% · Sales Manager 20% · above your limit needs approval · max 25% (Management may override with reason).</p>
        </div>
        </div>
      </div>
    </Modal>
  )
}

// ── STOCK FIRST — per-line badge ─────────────────────────────────────────────
// Renders ONLY what the server allocated. `s` is null while the check is in flight (or if it failed),
// and then we say so — we never show a fake zero.
function StockBadge({ s, err }) {
  const cls = (tone) => `inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${tone}`
  if (err) return <span className={cls('bg-rose-50 text-rose-600')}><AlertTriangle size={11} /> Stock unknown — check failed</span>
  if (!s) return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400"><Loader2 size={11} className="animate-spin" /> checking stock…</span>

  const lead = s.lead_time_days ? ` · ~${s.lead_time_days} day${plural(s.lead_time_days)} lead time` : ''
  // no Item-Master link → a one-off / custom fabrication: it has no stock by definition
  if (!s.stocked_item) return <span className={cls('bg-slate-100 text-slate-600')}><Package size={11} /> Custom item · to purchase</span>
  if (!(n0(s.qty) > 0)) return <span className={cls('bg-slate-100 text-slate-500')}><Boxes size={11} /> Set a quantity · {n0(s.available)} available</span>
  if (s.in_stock) return <span className={cls('bg-emerald-50 text-emerald-700')}><CheckCircle2 size={11} /> In stock · {n0(s.available)} available</span>
  if (s.partial) {
    return (
      <span className={cls('bg-amber-50 text-amber-700')}>
        <PackageCheck size={11} /> {n0(s.from_stock)} of {n0(s.qty)} from stock · {n0(s.to_purchase)} to purchase{lead}
      </span>
    )
  }
  return (
    <span className={cls('bg-rose-50 text-rose-600')}>
      <ShoppingCart size={11} /> Not in stock · {n0(s.to_purchase)} to purchase{lead}
    </span>
  )
}

// ── STOCK FIRST — the summary the CEO asked for ──────────────────────────────
// "Utilise the stock we already own first; only the shortfall may be purchased." This panel makes the
// profitability story legible: how much of the quote we already own, and exactly what has to be bought.
// A quote that needs purchasing is NOT blocked — but it must be acknowledged, so the purchase is a
// deliberate decision rather than an accident.
function StockPanel({ lines, summary, checking, err, ack, setAck }) {
  const toBuy = n0(summary?.to_purchase)
  const tone = err ? 'border-rose-200 bg-rose-50/50'
    : !summary ? 'border-slate-200 bg-slate-50/40'
      : summary.fully_from_stock ? 'border-emerald-200 bg-emerald-50/50'
        : summary.needs_procurement ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200 bg-slate-50/40'

  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink">
        <Boxes size={15} className="text-brand-500" /> Stock First
        {checking && <Loader2 size={13} className="animate-spin text-slate-400" />}
      </p>

      {err ? (
        <p className="text-xs font-semibold text-rose-600">Could not check stock: {err}</p>
      ) : lines === 0 ? (
        <p className="text-xs text-slate-500">Add equipment lines to see how much of this quotation is already covered by stock you own.</p>
      ) : !summary ? (
        <p className="text-xs text-slate-500">Checking live stock…</p>
      ) : (
        <div className="space-y-2">
          {/* coverage */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div className={`h-full rounded-full ${summary.fully_from_stock ? 'bg-emerald-500' : summary.stock_coverage_pct > 0 ? 'bg-amber-500' : 'bg-slate-300'}`}
              style={{ width: `${Math.max(0, Math.min(100, n0(summary.stock_coverage_pct)))}%` }} />
          </div>
          <p className="text-xs text-slate-700">
            <b>Stock coverage {n0(summary.stock_coverage_pct)}%</b> — {n0(summary.from_stock)} of {n0(summary.total_qty)} unit{plural(n0(summary.total_qty))} come from stock you already own.
            {toBuy > 0 && <> {toBuy} unit{plural(toBuy)} will have to be purchased.</>}
          </p>

          {summary.fully_from_stock && (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <CheckCircle2 size={13} /> Fully covered by stock — nothing needs to be purchased.
            </p>
          )}

          {summary.needs_procurement && (
            <>
              <div className="rounded-lg border border-amber-200 bg-white/70 p-2.5">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-amber-800"><ShoppingCart size={12} /> To be purchased</p>
                <ul className="space-y-1">
                  {(summary.purchase_lines || []).map((p, i) => (
                    <li key={`${p.item_id || p.item_name}-${i}`} className="flex flex-wrap items-baseline gap-x-1.5 text-[11px] text-slate-600">
                      <span className="font-semibold text-ink">{p.item_name}</span>
                      <span>— {n0(p.to_purchase)} of {n0(p.qty)} to purchase{n0(p.from_stock) > 0 ? ` (${n0(p.from_stock)} from stock)` : ''}</span>
                      {p.lead_time_days ? <span className="inline-flex items-center gap-0.5 text-slate-500"><Truck size={11} /> ~{p.lead_time_days} day{plural(p.lead_time_days)}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>

              {/* stock first, not stock only — the purchase is allowed, but it must be deliberate */}
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-amber-300 bg-white px-2.5 py-2">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-amber-600" />
                <span className="text-[11px] font-semibold text-amber-800">
                  I understand {toBuy} unit{plural(toBuy)} {toBuy === 1 ? 'is' : 'are'} not in stock and will have to be purchased.
                </span>
              </label>
            </>
          )}

          <p className="text-[11px] text-slate-400">Stock is allocated to your lines first; only the shortfall above can ever become a purchase. Reserved stock (already promised to an accepted order) is not counted as available.</p>
        </div>
      )}
    </div>
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

/**
 * Availability of an item at the moment it is being picked.
 *   In Stock   — physical minus reserved: what this quotation may actually promise
 *   Reserved   — committed to an accepted order, so it is NOT available here
 *   In Transit — on an open purchase order, coming but not on the shelf
 * 'To Purchase' is the shortfall against a quantity, so it belongs to the stock-first allocation
 * on the quotation lines rather than to a single item in the picker.
 */
function AvailabilityChips({ a }) {
  if (!a) return null
  const chips = []
  if (a.in_stock > 0) chips.push({ label: `In Stock ${a.in_stock}`, cls: 'bg-emerald-50 text-emerald-700' })
  if (a.reserved > 0) chips.push({ label: `Reserved ${a.reserved}`, cls: 'bg-amber-50 text-amber-700' })
  if (a.in_transit > 0) chips.push({ label: `In Transit ${a.in_transit}`, cls: 'bg-sky-50 text-sky-700' })
  if (!chips.length) {
    chips.push({
      label: a.lead_time_days ? `To Purchase · ${a.lead_time_days}d lead` : 'To Purchase',
      cls: 'bg-slate-100 text-slate-600',
    })
  }
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {chips.map((c) => (
        <span key={c.label} className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${c.cls}`}>{c.label}</span>
      ))}
    </span>
  )
}
