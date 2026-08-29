import { useState, useEffect, useMemo, useCallback, Fragment } from 'react'
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom'
import {
  Percent, Coins, Layers, Calculator, RefreshCw, Search, TrendingUp,
  AlertTriangle, Loader2, Plus, DollarSign, History, Trash2, ChevronDown, ChevronUp,
} from 'lucide-react'
import { PageHeader, KpiCard } from '../components/ui.jsx'
import { Modal } from '../components/Modal.jsx'
import MasterTable from '../components/MasterTable.jsx'
import ResourceTable from '../components/ResourceTable.jsx'
import ItemPricingPanel from '../components/ItemPricingPanel.jsx'
import { useData } from '../store/DataContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { sar } from '../data/mockData.js'
import { api } from '../api.js'

const money = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? '—' : sar(v))
const pct = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? '—' : `${Number(v).toFixed(1)}%`)
const hasCost = (it) => Number(it?.valuation_rate) > 0 || Number(it?.selling_price) > 0 || Number(it?.supplier_price) > 0 || Number(it?.factory_cost) > 0
const markupOf = (it) => {
  const m = Number(it?.markup_factor)
  if (m > 0) return m
  const l = Number(it?.landed_cost), c = Number(it?.calculated_sale_price)
  return l > 0 && c > 0 ? c / l : null
}

const TABS = [
  { key: 'items', label: 'Price Items', icon: Calculator },
  { key: 'brands', label: 'Brand Master', icon: TrendingUp },
  { key: 'templates', label: 'Landed Cost Templates', icon: Layers },
  { key: 'discounts', label: 'Discount Rules', icon: Percent },
  { key: 'fx', label: 'Currencies & FX', icon: Coins },
]

export default function PricingEngine() {
  const d = useData()
  const { canSee } = useAuth()
  const canEdit = canSee('warehouse') || canSee('admin')
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const onBrandRoute = location.pathname === '/stock/brand-master'

  const tabFromRoute = () => {
    if (onBrandRoute) return 'brands'
    if (tabParam && TABS.some((t) => t.key === tabParam)) return tabParam
    return 'items'
  }

  const [tab, setTab] = useState(tabFromRoute)

  useEffect(() => {
    if (location.pathname === '/stock/pricing' && tabParam === 'brands') {
      navigate('/stock/brand-master', { replace: true })
      return
    }
    setTab(tabFromRoute())
  }, [location.pathname, tabParam, onBrandRoute, navigate])

  const selectTab = (key) => {
    setTab(key)
    if (key === 'brands') navigate('/stock/brand-master', { replace: true })
    else if (key === 'items') navigate('/stock/pricing', { replace: true })
    else navigate(`/stock/pricing?tab=${key}`, { replace: true })
  }

  if (!canEdit) {
    return (
      <>
        <PageHeader title="Pricing Engine" subtitle="Landed cost · markup · selling price · multi-currency" />
        <div className="card card-pad text-sm text-muted">You do not have access to the Pricing Engine. It is available to Warehouse and Administration roles.</div>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Pricing Engine" subtitle="Supplier cost → landed cost → markup → selling price → gross &amp; net profit" />
      <KpiRow items={d.items || []} />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => selectTab(key)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${tab === key ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'items' && <PriceItemsTab />}
      {tab === 'brands' && <BrandMasterTab />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'discounts' && <DiscountRulesTab />}
      {tab === 'fx' && <FxTab />}
    </>
  )
}

// ── KPIs ──────────────────────────────────────────────────────────────────────
function KpiRow({ items }) {
  const priced = items.filter(hasCost)
  const missing = items.length - priced.length
  const gps = priced.map((it) => Number(it.gp_percent)).filter((v) => !Number.isNaN(v) && Number(v) !== 0)
  const avgGp = gps.length ? gps.reduce((a, b) => a + b, 0) / gps.length : null
  const mks = priced.map(markupOf).filter((v) => v != null)
  const avgMk = mks.length ? mks.reduce((a, b) => a + b, 0) / mks.length : null
  return (
    <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Items priced" value={priced.length} sub={`of ${items.length} in catalog`} icon={TrendingUp} accent="emerald" />
      <KpiCard label="Missing a price" value={missing} sub="no supplier / factory cost" icon={AlertTriangle} accent="gold" />
      <KpiCard label="Average GP %" value={avgGp == null ? '—' : `${avgGp.toFixed(1)}%`} sub="across priced items" icon={Percent} accent="brand" />
      <KpiCard label="Average markup" value={avgMk == null ? '—' : `×${avgMk.toFixed(2)}`} sub="landed → sale factor" icon={Calculator} accent="violet" />
    </div>
  )
}

const FINANCIAL_ROLES = ['Management', 'System Admin', 'Accounts User', 'Purchase User', 'Stock User', 'Project Manager']
const MGMT_ROLES = ['Management', 'System Admin']
const fmtHistDate = (iso) => {
  if (!iso) return '—'
  const dt = new Date(iso)
  return Number.isNaN(dt.getTime()) ? iso : dt.toLocaleString()
}
const fmtHistVal = (v) => (v == null || v === '' ? '—' : v)

function ValuationRateCell({ item, showFin, isMgmt, pendingReq, onSaved, onHistory, onRequested }) {
  const d = useData()
  const [val, setVal] = useState(item?.valuation_rate ?? '')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [askReason, setAskReason] = useState(false)
  useEffect(() => { setVal(item?.valuation_rate ?? '') }, [item?.id, item?.valuation_rate])
  if (!showFin) return null

  if (pendingReq) {
    return (
      <div className="flex flex-col items-end gap-0.5" onClick={(e) => e.stopPropagation()}>
        <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800" title="Awaiting Management approval">
          Pending: {fmtHistVal(pendingReq.new_value)} (requested by {pendingReq.requested_by || '—'})
        </span>
        <span className="text-xs tabular-nums text-slate-500">current {money(item?.valuation_rate)}</span>
        <button type="button" title="Valuation rate history" onClick={() => onHistory(item)}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-600">
          <History size={14} />
        </button>
      </div>
    )
  }

  const save = async (withReason) => {
    const next = Number(val) || 0
    if (Number(item?.valuation_rate) === next) { setAskReason(false); return }
    setSaving(true)
    try {
      const body = { valuation_rate: next }
      if (!isMgmt && withReason) body.vr_reason = withReason
      const res = await api(`/items/${item.id}`, { method: 'PATCH', body })
      await d.loadAll?.()
      if (res?.pending) {
        onRequested?.(res.request || { item_id: item.id, new_value: next, status: 'Pending' })
        alert(res.message || 'Sent for approval')
      } else {
        onSaved?.()
      }
      setAskReason(false)
      setReason('')
    } catch (e) { alert(e.message) } finally { setSaving(false) }
  }

  const onBlurOrEnter = () => {
    const next = Number(val) || 0
    if (Number(item?.valuation_rate) === next) return
    if (isMgmt) save()
    else setAskReason(true)
  }

  return (
    <div className="flex flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-end gap-1">
        <input
          type="number" step="any" min="0"
          title={isMgmt ? 'Valuation Rate (direct apply)' : 'Request a Valuation Rate change (needs approval)'}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={onBlurOrEnter}
          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
          className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/15"
        />
        <button type="button" title="Valuation rate history" onClick={() => onHistory(item)}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-600">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <History size={14} />}
        </button>
      </div>
      {askReason && !isMgmt && (
        <div className="z-10 w-56 rounded-lg border border-amber-200 bg-amber-50 p-2 shadow-sm">
          <p className="mb-1 text-[10px] font-semibold text-amber-800">Request change (optional note)</p>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason…"
            className="mb-1.5 w-full rounded border border-amber-200 px-2 py-1 text-xs" />
          <div className="flex justify-end gap-1">
            <button type="button" className="rounded px-2 py-0.5 text-[10px] text-slate-500" onClick={() => { setAskReason(false); setVal(item?.valuation_rate ?? '') }}>Cancel</button>
            <button type="button" className="rounded bg-amber-600 px-2 py-0.5 text-[10px] font-bold text-white" onClick={() => save(reason)}>
              Request change
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── TAB 1: Price Items ──────────────────────────────────────────────────────────
function PriceItemsTab() {
  const d = useData()
  const { user } = useAuth()
  const showFin = FINANCIAL_ROLES.includes(user?.role)
  const isMgmt = MGMT_ROLES.includes(user?.role)
  const items = d.items || []
  const [q, setQ] = useState('')
  const [brand, setBrand] = useState('')
  const [family, setFamily] = useState('')
  const [selected, setSelected] = useState(null)
  const [recalc, setRecalc] = useState({ busy: false, msg: '' })
  const [vrHistFor, setVrHistFor] = useState(null)
  const [vrHistRows, setVrHistRows] = useState([])
  const [vrHistLoading, setVrHistLoading] = useState(false)
  const [pendingByItem, setPendingByItem] = useState({})
  const [vrQueue, setVrQueue] = useState([])
  const [showVrQueue, setShowVrQueue] = useState(false)
  const [vrActBusy, setVrActBusy] = useState(null)
  const [rejectFor, setRejectFor] = useState(null)
  const [rejectNote, setRejectNote] = useState('')

  const loadVrPending = useCallback(async () => {
    if (!showFin) return
    try {
      const rows = await api('/items/vr-requests?status=Pending')
      const list = Array.isArray(rows) ? rows : []
      setVrQueue(list)
      setPendingByItem(Object.fromEntries(list.map((r) => [r.item_id, r])))
    } catch { setVrQueue([]); setPendingByItem({}) }
  }, [showFin])

  useEffect(() => { loadVrPending() }, [loadVrPending])

  const openVrHistory = async (it) => {
    setVrHistFor(it)
    setVrHistRows([])
    setVrHistLoading(true)
    try {
      const rows = await api(`/items/${it.id}/pricing-history?field=valuation_rate`)
      setVrHistRows(Array.isArray(rows) ? rows : [])
    } catch { setVrHistRows([]) } finally { setVrHistLoading(false) }
  }

  const decideVr = async (req, decision) => {
    setVrActBusy(req.id)
    try {
      if (decision === 'approved') {
        await api(`/items/vr-requests/${req.id}/approve`, { method: 'POST' })
      } else {
        const reason = rejectNote.trim()
        if (!reason) { alert('Reject reason is required'); setVrActBusy(null); return }
        await api(`/items/vr-requests/${req.id}/reject`, { method: 'POST', body: { reason } })
        setRejectFor(null)
        setRejectNote('')
      }
      await d.loadAll?.()
      await loadVrPending()
    } catch (e) { alert(e.message) } finally { setVrActBusy(null) }
  }

  const vrColSpan = showFin ? 1 : 0
  const pricedColSpan = 8 + vrColSpan
  const missingColSpan = 4 + vrColSpan

  const brands = useMemo(() => Array.from(new Set(items.map((i) => i.brand).filter(Boolean))).sort(), [items])
  const families = useMemo(() => Array.from(new Set(items.map((i) => i.product_family).filter(Boolean))).sort(), [items])

  const match = useCallback((it) => {
    if (brand && it.brand !== brand) return false
    if (family && it.product_family !== family) return false
    if (q) { const s = `${it.item_name || ''} ${it.brand || ''} ${it.model || ''}`.toLowerCase(); if (!s.includes(q.toLowerCase())) return false }
    return true
  }, [q, brand, family])

  const priced = items.filter((it) => hasCost(it) && match(it))
  const missing = items.filter((it) => !hasCost(it) && match(it))

  const runRecalc = async () => {
    setRecalc({ busy: true, msg: '' })
    try {
      const r = await api('/pricing/recalc', { method: 'POST', body: {} })
      await d.loadAll?.()
      setRecalc({ busy: false, msg: `Re-priced ${r.updated} item(s)${r.skipped ? `, ${r.skipped} skipped` : ''}. ${r.unpriced?.length || 0} cannot be priced (no supplier cost).` })
    } catch (e) { setRecalc({ busy: false, msg: e.message }) }
  }

  return (
    <div className="space-y-4">
      <div className="card card-pad">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block flex-1 min-w-[200px]">
            <span className="mb-1 block text-[11px] font-semibold text-slate-500">Search</span>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Item, brand or model…"
                className="w-full rounded-lg border border-slate-200 bg-slate-50/60 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-500/15" />
            </div>
          </label>
          <label className="block w-44">
            <span className="mb-1 block text-[11px] font-semibold text-slate-500">Brand</span>
            <select value={brand} onChange={(e) => setBrand(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white">
              <option value="">All brands</option>
              {brands.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <label className="block w-44">
            <span className="mb-1 block text-[11px] font-semibold text-slate-500">Product family</span>
            <select value={family} onChange={(e) => setFamily(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white">
              <option value="">All families</option>
              {families.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          {isMgmt && (
            <button type="button" onClick={() => setShowVrQueue((v) => !v)}
              className={`relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${showVrQueue ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'}`}>
              VR Requests
              {vrQueue.length > 0 && (
                <span className="ml-0.5 grid h-5 min-w-[20px] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{vrQueue.length}</span>
              )}
            </button>
          )}
          <button className="btn-primary" disabled={recalc.busy} onClick={runRecalc}>
            {recalc.busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Recalculate all
          </button>
        </div>
        {recalc.msg && <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700">{recalc.msg}</p>}
      </div>

      {isMgmt && showVrQueue && (
        <div className="card overflow-hidden border-amber-200">
          <div className="border-b border-amber-100 bg-amber-50/60 p-4">
            <h3 className="text-[15px] font-bold text-ink">Pending Valuation Rate requests <span className="text-xs font-medium text-muted">({vrQueue.length})</span></h3>
            <p className="text-xs text-muted">Approve applies VR and reprices selling · Reject requires a reason</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50/60">
                <th className="th">Item</th><th className="th text-right">Old</th><th className="th text-right">New</th>
                <th className="th">Requester</th><th className="th">Reason</th><th className="th">Actions</th>
              </tr></thead>
              <tbody>
                {vrQueue.map((req) => (
                  <tr key={req.id}>
                    <td className="td font-semibold">{req.item_name || req.item_id}</td>
                    <td className="td text-right tabular-nums">{fmtHistVal(req.old_value)}</td>
                    <td className="td text-right font-semibold tabular-nums text-amber-700">{fmtHistVal(req.new_value)}</td>
                    <td className="td text-xs">{req.requested_by || '—'}<br /><span className="text-muted">{fmtHistDate(req.requested_at)}</span></td>
                    <td className="td text-xs text-muted">{req.reason || '—'}</td>
                    <td className="td">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button type="button" disabled={vrActBusy === req.id}
                          onClick={() => decideVr(req, 'approved')}
                          className="rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-60">
                          {vrActBusy === req.id ? <Loader2 size={12} className="inline animate-spin" /> : 'Approve'}
                        </button>
                        {rejectFor === req.id ? (
                          <span className="flex items-center gap-1">
                            <input value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="Reject reason" className="w-28 rounded border px-1.5 py-1 text-xs" />
                            <button type="button" className="rounded bg-rose-500 px-2 py-1 text-xs font-semibold text-white" onClick={() => decideVr(req, 'rejected')}>Confirm</button>
                            <button type="button" className="text-xs text-slate-400" onClick={() => { setRejectFor(null); setRejectNote('') }}>×</button>
                          </span>
                        ) : (
                          <button type="button" onClick={() => { setRejectFor(req.id); setRejectNote('') }}
                            className="rounded-lg bg-rose-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-600">Reject</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {vrQueue.length === 0 && <tr><td className="td text-slate-400" colSpan={6}>No pending VR requests.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* priced table */}
      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <h3 className="text-[15px] font-bold text-ink">Priced items <span className="text-xs font-medium text-muted">({priced.length})</span></h3>
          <p className="text-xs text-muted">Click a row to open the landed-cost drill-down and edit.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="bg-slate-50/60">
              <th className="th">Item</th><th className="th">Brand</th>
              {showFin && <th className="th text-right">Valuation Rate</th>}
              <th className="th text-right">Supplier</th><th className="th text-right">Landed</th>
              <th className="th text-right">Markup</th><th className="th text-right">Selling</th>
              <th className="th text-right">GP %</th><th className="th text-right">NP %</th>
            </tr></thead>
            <tbody>
              {priced.map((it) => (
                <tr key={it.id} className="cursor-pointer hover:bg-slate-50/60" onClick={() => setSelected(it)}>
                  <td className="td font-semibold text-ink">{it.item_name}</td>
                  <td className="td text-slate-600">{it.brand || '—'}</td>
                  {showFin && (
                    <td className="td text-right">
                      <ValuationRateCell item={it} showFin={showFin} isMgmt={isMgmt} pendingReq={pendingByItem[it.id]}
                        onHistory={openVrHistory} onSaved={loadVrPending} onRequested={loadVrPending} />
                    </td>
                  )}
                  <td className="td text-right tabular-nums">{money(it.supplier_price)}</td>
                  <td className="td text-right tabular-nums">{money(it.landed_cost)}</td>
                  <td className="td text-right tabular-nums">{markupOf(it) == null ? '—' : `×${markupOf(it).toFixed(2)}`}</td>
                  <td className="td text-right font-semibold tabular-nums text-brand-600">{money(it.selling_price)}</td>
                  <td className="td text-right tabular-nums">{pct(it.gp_percent)}</td>
                  <td className="td text-right tabular-nums">{pct(it.np_percent)}</td>
                </tr>
              ))}
              {priced.length === 0 && <tr><td className="td text-slate-400" colSpan={pricedColSpan}>No priced items match. Open an item below and enter a supplier price, or adjust filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* missing prices */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-amber-50/40 p-4">
          <AlertTriangle size={16} className="text-amber-500" />
          <div>
            <h3 className="text-[15px] font-bold text-ink">Cannot be priced — no valuation rate <span className="text-xs font-medium text-muted">({missing.length})</span></h3>
            <p className="text-xs text-muted">Set a valuation rate on the item, then open it to apply the VR pricing chain.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="bg-slate-50/60">
              <th className="th">Item</th><th className="th">Brand</th><th className="th">Model</th><th className="th">Family</th>
              {showFin && <th className="th text-right">Valuation Rate</th>}
            </tr></thead>
            <tbody>
              {missing.map((it) => (
                <tr key={it.id} className="cursor-pointer hover:bg-slate-50/60" onClick={() => setSelected(it)}>
                  <td className="td font-semibold text-ink">{it.item_name}</td>
                  <td className="td text-slate-600">{it.brand || '—'}</td>
                  <td className="td text-slate-600">{it.model || '—'}</td>
                  <td className="td text-slate-600">{it.product_family || '—'}</td>
                  {showFin && (
                    <td className="td text-right">
                      <ValuationRateCell item={it} showFin={showFin} isMgmt={isMgmt} pendingReq={pendingByItem[it.id]}
                        onHistory={openVrHistory} onSaved={loadVrPending} onRequested={loadVrPending} />
                    </td>
                  )}
                </tr>
              ))}
              {missing.length === 0 && <tr><td className="td text-slate-400" colSpan={missingColSpan}>Every matching item has a valuation rate.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} size="xl"
        title={selected?.item_name || 'Item pricing'} subtitle="Valuation rate chain · live preview">
        {selected && <ItemPricingPanel item={selected} onSaved={() => { /* store refreshed by panel */ }} />}
      </Modal>

      <Modal open={!!vrHistFor} onClose={() => setVrHistFor(null)} size="lg"
        title={vrHistFor ? `Valuation Rate History — ${vrHistFor.item_name}` : 'History'}
        subtitle="Date · user · old → new · source (manual / approved-request / opening-stock)"
        footer={<button type="button" className="btn-ghost" onClick={() => setVrHistFor(null)}>Close</button>}>
        {vrHistLoading ? (
          <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-brand-500" /></div>
        ) : vrHistRows.length === 0 ? (
          <p className="py-4 text-sm text-muted">No valuation rate changes recorded yet.</p>
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/60">
                  <th className="th">Date</th><th className="th">User</th>
                  <th className="th">Previous</th><th className="th">New</th><th className="th">Source</th>
                </tr>
              </thead>
              <tbody>
                {vrHistRows.map((row) => (
                  <tr key={row.id}>
                    <td className="td whitespace-nowrap text-xs text-muted">{fmtHistDate(row.created_at)}</td>
                    <td className="td text-xs">
                      {row.changed_by || '—'}
                      {row.note && <div className="mt-0.5 text-[10px] text-slate-400">{row.note}</div>}
                    </td>
                    <td className="td text-xs tabular-nums">{fmtHistVal(row.old_value)}</td>
                    <td className="td text-xs tabular-nums">{fmtHistVal(row.new_value)}</td>
                    <td className="td text-xs text-muted">{row.source || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ── TAB 2: Landed Cost Templates ─────────────────────────────────────────────────
const landedExample = (t, base = 10000) => base * (1 + ((Number(t.freight_pct) || 0) + (Number(t.insurance_pct) || 0) + (Number(t.customs_pct) || 0) + (Number(t.transport_pct) || 0) + (Number(t.other_pct) || 0)) / 100)

function TemplatesTab() {
  const [rows, setRows] = useState([])
  const load = useCallback(() => { api('/pricing/templates').then((r) => setRows(Array.isArray(r) ? r : [])).catch(() => setRows([])) }, [])
  useEffect(() => { load() }, [load])
  const def = rows.find((t) => t.is_default)

  return (
    <div className="space-y-4">
      {def && (
        <div className="card card-pad">
          <h3 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-ink"><Calculator size={15} /> Live example — default template “{def.name}”</h3>
          <p className="text-xs text-muted">SAR 10,000 supplier cost → <b className="text-ink">{sar(landedExample(def))}</b> landed → <b className="text-brand-600">{sar(landedExample(def) * (Number(def.markup_factor) || 1))}</b> calculated sale price (×{Number(def.markup_factor) || 1} markup)</p>
        </div>
      )}
      <MasterTable
        title="Landed Cost Templates" subtitle="Freight / insurance / customs / transport as % of cost base, plus markup. One is the default."
        addLabel="Add Template" canEdit rows={rows}
        onAdd={async (v) => { await api('/pricing/templates', { method: 'POST', body: { ...v, is_active: true } }); load() }}
        onUpdate={async (id, v) => { await api(`/pricing/templates/${id}`, { method: 'PATCH', body: v }); load() }}
        onDelete={async (id) => { await api(`/pricing/templates/${id}`, { method: 'DELETE' }); load() }}
        columns={[
          { key: 'name', label: 'Name', className: 'font-semibold text-ink' },
          { key: 'freight_pct', label: 'Freight %', render: (r) => `${Number(r.freight_pct) || 0}%` },
          { key: 'insurance_pct', label: 'Insurance %', render: (r) => `${Number(r.insurance_pct) || 0}%` },
          { key: 'customs_pct', label: 'Customs %', render: (r) => `${Number(r.customs_pct) || 0}%` },
          { key: 'transport_pct', label: 'Transport %', render: (r) => `${Number(r.transport_pct) || 0}%` },
          { key: 'other_pct', label: 'Other %', render: (r) => `${Number(r.other_pct) || 0}%` },
          { key: 'markup_factor', label: 'Markup', render: (r) => `×${Number(r.markup_factor) || 1}` },
          { key: 'example', label: '10k → landed', render: (r) => sar(landedExample(r)) },
          { key: 'is_default', label: 'Default', type: 'bool' },
          { key: 'is_active', label: 'Active', type: 'bool' },
        ]}
        fields={[
          { key: 'name', label: 'Template Name', required: true, full: true },
          { key: 'freight_pct', label: 'Freight %', type: 'number' },
          { key: 'insurance_pct', label: 'Insurance %', type: 'number' },
          { key: 'customs_pct', label: 'Customs & Duties %', type: 'number' },
          { key: 'transport_pct', label: 'Local Transport %', type: 'number' },
          { key: 'other_pct', label: 'Other %', type: 'number' },
          { key: 'markup_factor', label: 'Markup Factor', type: 'number', hint: 'landed × this = calculated sale price' },
          { key: 'is_default', label: 'Set as default template', type: 'checkbox' },
          { key: 'is_active', label: 'Active', type: 'checkbox' },
        ]}
      />
    </div>
  )
}

// ── TAB 3: Discount Rules ────────────────────────────────────────────────────────
function DiscountRulesTab() {
  return (
    <ResourceTable resource="discount-rules" canEdit title="Discount Rules"
      subtitle="Discount applied in the selling-price chain (by item / group / family / brand / all)" addLabel="Add Rule"
      columns={[
        { key: 'name', label: 'Rule', className: 'font-semibold text-ink' },
        { key: 'applies_to', label: 'Applies To', type: 'badge' },
        { key: 'target', label: 'Target' },
        { key: 'discount_pct', label: 'Discount %', render: (r) => `${Number(r.discount_pct) || 0}%` },
        { key: 'max_discount', label: 'Max %', render: (r) => `${Number(r.max_discount) || 0}%` },
        { key: 'is_active', label: 'Active', type: 'bool' },
      ]}
      fields={[
        { key: 'name', label: 'Rule Name', required: true, full: true },
        { key: 'applies_to', label: 'Applies To', type: 'select', options: ['All', 'Item', 'Item Group', 'Product Family', 'Brand', 'Role', 'Customer Category'] },
        { key: 'target', label: 'Target (item / group / family / brand name)', hint: 'Leave blank when Applies To = All' },
        { key: 'discount_pct', label: 'Discount %', type: 'number' },
        { key: 'max_discount', label: 'Max Discount % (cap)', type: 'number' },
        { key: 'is_active', label: 'Active', type: 'checkbox' },
      ]}
    />
  )
}

// ── TAB 4: Currencies & FX ───────────────────────────────────────────────────────
function FxTab() {
  const [fx, setFx] = useState([])
  const [history, setHistory] = useState([])
  const [histCur, setHistCur] = useState('')
  const [form, setForm] = useState({ from_currency: '', rate: '', valid_from: new Date().toISOString().slice(0, 10) })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [okMsg, setOkMsg] = useState('')

  const loadFx = useCallback(() => { api('/pricing/fx').then((r) => setFx(Array.isArray(r) ? r : [])).catch(() => setFx([])) }, [])
  const loadHist = useCallback((cur) => { api(`/pricing/fx/history${cur ? `?currency=${cur}` : ''}`).then((r) => setHistory(Array.isArray(r) ? r : [])).catch(() => setHistory([])) }, [])
  useEffect(() => { loadFx() }, [loadFx])
  useEffect(() => { loadHist(histCur) }, [loadHist, histCur])

  const base = fx.find((c) => c.is_base)?.code || 'SAR'
  const nonBase = fx.filter((c) => !c.is_base)

  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setOkMsg('')
    if (!form.from_currency) return setErr('Choose a currency')
    if (!(Number(form.rate) > 0)) return setErr('Enter a positive rate')
    setBusy(true)
    try {
      await api('/pricing/fx', { method: 'POST', body: { from_currency: form.from_currency, rate: Number(form.rate), valid_from: form.valid_from || null } })
      setOkMsg(`Saved 1 ${form.from_currency} = ${form.rate} ${base}`)
      setForm((p) => ({ ...p, rate: '' }))
      loadFx(); loadHist(histCur)
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <h3 className="text-[15px] font-bold text-ink">Currencies</h3>
          <p className="text-xs text-muted">Current and latest recorded rate to base ({base}). Every item's supplier price is converted through these.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="bg-slate-50/60"><th className="th">Code</th><th className="th">Name</th><th className="th text-right">Current rate</th><th className="th text-right">Latest recorded</th><th className="th">Effective</th><th className="th">Source</th></tr></thead>
            <tbody>
              {fx.map((c) => (
                <tr key={c.code} className="hover:bg-slate-50/60">
                  <td className="td font-semibold text-ink">{c.code} {c.is_base && <span className="ml-1 chip bg-brand-50 text-brand-600">base</span>}</td>
                  <td className="td text-slate-600">{c.name} {c.symbol ? `(${c.symbol})` : ''}</td>
                  <td className="td text-right tabular-nums">{c.exchange_rate == null ? '—' : Number(c.exchange_rate).toFixed(4)}</td>
                  <td className="td text-right tabular-nums">{c.latest_rate == null ? '—' : Number(c.latest_rate).toFixed(4)}</td>
                  <td className="td text-slate-600">{c.valid_from || '—'}</td>
                  <td className="td text-slate-600">{c.source || '—'}</td>
                </tr>
              ))}
              {fx.length === 0 && <tr><td className="td text-slate-400" colSpan={6}>No currencies configured. Add them in Company Settings.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card card-pad">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-ink"><Plus size={15} /> Record a new exchange rate</h3>
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <label className="block w-44">
            <span className="mb-1 block text-[11px] font-semibold text-slate-500">Currency</span>
            <select value={form.from_currency} onChange={(e) => setForm((p) => ({ ...p, from_currency: e.target.value }))} className="w-full rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white">
              <option value="">Select…</option>
              {nonBase.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
            </select>
          </label>
          <label className="block w-40">
            <span className="mb-1 block text-[11px] font-semibold text-slate-500">Rate to {base}</span>
            <div className="relative">
              <DollarSign size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="number" step="any" value={form.rate} onChange={(e) => setForm((p) => ({ ...p, rate: e.target.value }))} placeholder="e.g. 3.75"
                className="w-full rounded-lg border border-slate-200 bg-slate-50/60 py-2 pl-8 pr-3 text-sm outline-none focus:border-brand-400 focus:bg-white" />
            </div>
          </label>
          <label className="block w-44">
            <span className="mb-1 block text-[11px] font-semibold text-slate-500">Effective from</span>
            <input type="date" value={form.valid_from} onChange={(e) => setForm((p) => ({ ...p, valid_from: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white" />
          </label>
          <button className="btn-primary" disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Save rate</button>
        </form>
        {err && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{err}</p>}
        {okMsg && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-600">{okMsg}</p>}
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div>
            <h3 className="text-[15px] font-bold text-ink">Exchange rate history</h3>
            <p className="text-xs text-muted">Full audit trail, newest first.</p>
          </div>
          <label className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-500">Filter currency</span>
            <select value={histCur} onChange={(e) => setHistCur(e.target.value)} className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-1.5 text-xs outline-none focus:border-brand-400 focus:bg-white">
              <option value="">All currencies</option>
              {nonBase.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
            </select>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="bg-slate-50/60"><th className="th">From</th><th className="th">To</th><th className="th text-right">Rate</th><th className="th">Effective</th><th className="th">Source</th><th className="th">Recorded</th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="hover:bg-slate-50/60">
                  <td className="td font-semibold text-ink">{h.from_currency}</td>
                  <td className="td text-slate-600">{h.to_currency}</td>
                  <td className="td text-right tabular-nums">{Number(h.rate).toFixed(4)}</td>
                  <td className="td text-slate-600">{h.valid_from || '—'}</td>
                  <td className="td text-slate-600">{h.source || '—'}</td>
                  <td className="td text-slate-500">{(h.created_at || '').slice(0, 10) || '—'}</td>
                </tr>
              ))}
              {history.length === 0 && <tr><td className="td text-slate-400" colSpan={6}>No exchange-rate history yet. Record a rate above.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/**
 * BRAND MASTER — the pricing factors that turn a valuation rate into a selling price.
 *
 * The client asked: "Every Brand has pricing factors configured in the Brand Master." This is that
 * screen. For each brand you set the four factors; the worked column shows exactly what a SAR 1,000
 * valuation rate becomes, so the effect of a change is visible before it is saved.
 *
 *   selling = valuation × exchange × price factor × (1 + margin%) × (1 − offer%)
 *
 * Items themselves come from EOS; the ERP only owns these commercial factors — which is why this is
 * the one place a brand's numbers are edited.
 */
function BrandMasterTab() {
  const d = useData()
  const { user } = useAuth()
  // Brand delete follows same gate as edit — Edit / Approval / Full Admin (not Create-only).
  const canDelete = ['Edit', 'Approval', 'Full Admin'].includes(user?.access_level)
  const [q, setQ] = useState('')
  const [edits, setEdits] = useState({})   // id → { field: value }
  const [savingId, setSavingId] = useState(null)
  const [flash, setFlash] = useState(null) // { type: 'success' | 'error', text: string }
  const [showAdd, setShowAdd] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newBrand, setNewBrand] = useState({
    brand: '', currency: 'SAR', exchange_factor: 1, price_factor: 1,
    country_of_origin: '', country_of_purchase: '',
  })
  const [auditFor, setAuditFor] = useState(null)
  const [auditRows, setAuditRows] = useState([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [deleteFor, setDeleteFor] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  const brands = useMemo(() => {
    const term = q.trim().toLowerCase()
    const list = (d.brands || []).filter((b) => !term || String(b.brand || '').toLowerCase().includes(term))
    return [...list].sort((a, b) => {
      const pa = a.factors_pending ? 0 : 1
      const pb = b.factors_pending ? 0 : 1
      if (pa !== pb) return pa - pb
      return String(a.brand).localeCompare(String(b.brand))
    })
  }, [d.brands, q])

  const val = (b, f, dflt) => {
    const e = edits[b.id]
    return e && f in e ? e[f] : (b[f] ?? dflt)
  }
  const setVal = (b, f, v) => setEdits((s) => ({ ...s, [b.id]: { ...(s[b.id] || {}), [f]: v } }))
  const dirty = (b) => !!edits[b.id]

  const example = (b) => {
    // Must stay numerically identical to core/priceEngine.js previewBrandExample() — VR basis 1000.
    const exch = Number(val(b, 'exchange_factor', 1)) || 1
    const pf = Number(val(b, 'price_factor', 1)) || 1
    const margin = Number(val(b, 'add_margin_pct', 0)) || 0
    const offer = Number(val(b, 'special_offer_pct', 0)) || 0
    const cost = 1000 * exch
    const selling = cost * pf * (1 + margin / 100) * (1 - offer / 100)
    return { cost, selling, gp: selling > 0 ? ((selling - cost) / selling) * 100 : 0 }
  }

  const showSuccess = (text) => setFlash({ type: 'success', text })
  const showError = (text) => setFlash({ type: 'error', text })
  const clearFlash = () => setFlash(null)

  const save = async (b) => {
    setSavingId(b.id); clearFlash()
    try {
      await d.updateBrand(b.id, {
        brand: val(b, 'brand', b.brand)?.trim() || b.brand,
        description: val(b, 'description', b.description ?? '') || null,
        country_of_origin: val(b, 'country_of_origin', b.country_of_origin ?? '') || null,
        country_of_purchase: val(b, 'country_of_purchase', b.country_of_purchase ?? '') || null,
        exchange_factor: Number(val(b, 'exchange_factor', 1)) || 1,
        price_factor: Number(val(b, 'price_factor', 1)) || 1,
        add_margin_pct: Number(val(b, 'add_margin_pct', 0)) || 0,
        special_offer_pct: Number(val(b, 'special_offer_pct', 0)) || 0,
        currency: val(b, 'currency', 'SAR'),
      })
      setEdits((s) => { const n = { ...s }; delete n[b.id]; return n })
      showSuccess(`Brand "${b.brand}" saved successfully.`)
    } catch (e) {
      const msg = e.message || 'Could not save changes. Please try again.'
      if (/in use by/i.test(msg)) {
        showError(`Cannot rename — this brand is linked to existing items. Clear or reassign those items first. (${msg})`)
      } else {
        showError(msg)
      }
    } finally { setSavingId(null) }
  }

  const createBrand = async () => {
    if (!newBrand.brand.trim()) return
    const name = newBrand.brand.trim()
    setAdding(true); clearFlash()
    try {
      await d.addBrand({
        brand: name,
        currency: newBrand.currency || 'SAR',
        exchange_factor: Number(newBrand.exchange_factor) || 1,
        price_factor: Number(newBrand.price_factor) || 1,
        country_of_origin: newBrand.country_of_origin || null,
        country_of_purchase: newBrand.country_of_purchase || null,
      })
      setNewBrand({ brand: '', currency: 'SAR', exchange_factor: 1, price_factor: 1, country_of_origin: '', country_of_purchase: '' })
      setShowAdd(false)
      showSuccess(`Brand "${name}" created successfully.`)
    } catch (e) { showError(e.message || 'Could not create brand. Please try again.') } finally { setAdding(false) }
  }

  const openAudit = async (b) => {
    setAuditFor(b)
    setAuditLoading(true)
    setAuditRows([])
    try {
      const rows = await api(`/masters/brands/${b.id}/audit`)
      setAuditRows(Array.isArray(rows) ? rows : [])
    } catch (e) {
      setAuditRows([])
      showError(e.message || 'Could not load change history.')
    } finally { setAuditLoading(false) }
  }

  const confirmDelete = async () => {
    if (!deleteFor) return
    setDeletingId(deleteFor.id)
    clearFlash()
    try {
      await d.deleteBrand(deleteFor.id)
      setDeleteFor(null)
      showSuccess(`Brand "${deleteFor.brand}" deleted.`)
    } catch (e) {
      showError(e.message || 'Could not delete brand.')
    } finally { setDeletingId(null) }
  }

  const numCell = (b, f, step = '0.01') => (
    <input
      type="number" step={step}
      value={val(b, f, f.includes('pct') ? 0 : 1)}
      onChange={(e) => setVal(b, f, e.target.value)}
      className="w-20 rounded-lg border border-slate-200 bg-slate-50/60 px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-brand-400 focus:bg-white"
    />
  )

  const fmtAuditVal = (v) => (v == null || v === '' ? '—' : v)
  const fmtAuditDate = (iso) => {
    if (!iso) return '—'
    const dt = new Date(iso)
    return Number.isNaN(dt.getTime()) ? iso : dt.toLocaleString()
  }

  return (
    <>
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-bold text-ink">Brand Master — Pricing Factors</p>
          <p className="text-[11px] text-muted">selling = valuation × exchange × price factor × (1 + margin%) × (1 − offer%)</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <button type="button" onClick={() => setShowAdd((s) => !s)}
            className="flex items-center gap-1 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600">
            <Plus size={14} /> Add Brand
          </button>
          <div className="relative w-full sm:w-64">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search brand…"
              className="w-full rounded-lg border border-slate-200 bg-slate-50/60 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:bg-white" />
          </div>
        </div>
      </div>
      {showAdd && (
        <div className="border-b border-slate-100 bg-slate-50/40 p-4">
          <p className="mb-2 text-xs font-bold text-ink">New brand</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-[11px] font-semibold text-muted">Brand name *
              <input value={newBrand.brand} onChange={(e) => setNewBrand((s) => ({ ...s, brand: e.target.value }))}
                className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-400" />
            </label>
            <label className="block text-[11px] font-semibold text-muted">Currency
              <input value={newBrand.currency} onChange={(e) => setNewBrand((s) => ({ ...s, currency: e.target.value }))}
                className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm uppercase outline-none focus:border-brand-400" />
            </label>
            <label className="block text-[11px] font-semibold text-muted">Exchange factor
              <input type="number" step="0.01" value={newBrand.exchange_factor} onChange={(e) => setNewBrand((s) => ({ ...s, exchange_factor: e.target.value }))}
                className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-400" />
            </label>
            <label className="block text-[11px] font-semibold text-muted">Price factor
              <input type="number" step="0.01" value={newBrand.price_factor} onChange={(e) => setNewBrand((s) => ({ ...s, price_factor: e.target.value }))}
                className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-400" />
            </label>
            <label className="block text-[11px] font-semibold text-muted">Country of origin
              <input value={newBrand.country_of_origin} onChange={(e) => setNewBrand((s) => ({ ...s, country_of_origin: e.target.value }))}
                className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-400" />
            </label>
            <label className="block text-[11px] font-semibold text-muted">Country of purchase
              <input value={newBrand.country_of_purchase} onChange={(e) => setNewBrand((s) => ({ ...s, country_of_purchase: e.target.value }))}
                className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-400" />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={adding || !newBrand.brand.trim()} onClick={createBrand}
              className="inline-flex min-w-[7.5rem] items-center justify-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
              {adding ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : 'Create brand'}
            </button>
            <button type="button" className="btn-ghost !py-1.5 !text-xs" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}
      {flash && (
        <div className={`border-b px-4 py-2 text-xs font-semibold ${
          flash.type === 'success'
            ? 'border-emerald-100 bg-emerald-50/60 text-emerald-700'
            : 'border-rose-100 bg-rose-50/60 text-rose-700'
        }`}>
          {flash.text}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px]">
          <thead>
            <tr className="bg-slate-50/60">
              <th className="th">Brand</th><th className="th">Currency</th>
              <th className="th text-right">Exchange</th><th className="th text-right">Price Factor</th>
              <th className="th text-right">Add Margin %</th><th className="th text-right">Special Offer %</th>
              <th className="th text-right">SAR 1,000 →</th><th className="th text-right">GP%</th><th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {brands.map((b) => {
              const ex = example(b)
              const open = expandedId === b.id
              return (
                <Fragment key={b.id}>
                <tr className={b.factors_pending ? 'bg-amber-50/70 hover:bg-amber-50' : 'group hover:bg-slate-50/40'}>
                  <td className="td font-semibold text-ink">
                    <button type="button" onClick={() => setExpandedId(open ? null : b.id)}
                      className="mr-1.5 inline-flex rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                      title="Brand details (description, countries, rename)">
                      {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    {val(b, 'brand', b.brand)}
                    {b.factors_pending && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Factors pending</span>
                    )}
                  </td>
                  <td className="td">
                    <input value={val(b, 'currency', 'SAR')} onChange={(e) => setVal(b, 'currency', e.target.value)}
                      className="w-16 rounded-lg border border-slate-200 bg-slate-50/60 px-2 py-1.5 text-sm uppercase outline-none focus:border-brand-400 focus:bg-white" />
                  </td>
                  <td className="td text-right">{numCell(b, 'exchange_factor')}</td>
                  <td className="td text-right">{numCell(b, 'price_factor')}</td>
                  <td className="td text-right">{numCell(b, 'add_margin_pct', '0.1')}</td>
                  <td className="td text-right">{numCell(b, 'special_offer_pct', '0.1')}</td>
                  <td className="td text-right font-semibold tabular-nums text-brand-600">{money(ex.selling)}</td>
                  <td className="td text-right tabular-nums text-slate-500">{ex.gp.toFixed(1)}%</td>
                  <td className="td text-right">
                    <div className="flex justify-end gap-1.5">
                      <button type="button" onClick={() => openAudit(b)} title="Change history"
                        className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                        <History size={13} className="inline" />
                      </button>
                      {canDelete && (
                        <button type="button" onClick={() => setDeleteFor(b)} title="Delete brand"
                          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50">
                          <Trash2 size={13} className="inline" />
                        </button>
                      )}
                      <button onClick={() => save(b)} disabled={!dirty(b) || savingId === b.id}
                        className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
                        {savingId === b.id ? <Loader2 size={13} className="animate-spin" /> : 'Save'}
                      </button>
                    </div>
                  </td>
                </tr>
                {open && (
                  <tr key={`${b.id}-detail`} className="bg-slate-50/50">
                    <td colSpan={9} className="px-4 py-3">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="block text-[11px] font-semibold text-muted">Brand name (rename)
                          <input value={val(b, 'brand', b.brand)} onChange={(e) => setVal(b, 'brand', e.target.value)}
                            className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-400" />
                        </label>
                        <label className="block text-[11px] font-semibold text-muted sm:col-span-2 lg:col-span-3">Description
                          <input value={val(b, 'description', b.description ?? '')} onChange={(e) => setVal(b, 'description', e.target.value)}
                            className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-400" />
                        </label>
                        <label className="block text-[11px] font-semibold text-muted">Country of origin
                          <input value={val(b, 'country_of_origin', b.country_of_origin ?? '')} onChange={(e) => setVal(b, 'country_of_origin', e.target.value)}
                            className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-400" />
                        </label>
                        <label className="block text-[11px] font-semibold text-muted">Country of purchase
                          <input value={val(b, 'country_of_purchase', b.country_of_purchase ?? '')} onChange={(e) => setVal(b, 'country_of_purchase', e.target.value)}
                            className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-400" />
                        </label>
                      </div>
                      <p className="mt-2 text-[10px] text-muted">Rename is blocked while items still reference the old brand name (409). Use History to review description and country changes.</p>
                    </td>
                  </tr>
                )}
                </Fragment>
              )
            })}
            {brands.length === 0 && <tr><td colSpan={9} className="td text-center text-slate-400">No brands found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>

    <Modal open={!!auditFor} onClose={() => setAuditFor(null)} size="lg" title={auditFor ? `History — ${auditFor.brand}` : 'History'}
      subtitle="Field-level changes · user · date/time"
      footer={<button type="button" className="btn-ghost" onClick={() => setAuditFor(null)}>Close</button>}>
      {auditLoading ? (
        <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-brand-500" /></div>
      ) : auditRows.length === 0 ? (
        <p className="py-4 text-sm text-muted">No history recorded yet.</p>
      ) : (
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/60">
                <th className="th">Date</th><th className="th">User</th><th className="th">Field</th>
                <th className="th">Previous</th><th className="th">New</th>
              </tr>
            </thead>
            <tbody>
              {auditRows.map((row) => (
                <tr key={row.id}>
                  <td className="td whitespace-nowrap text-xs text-muted">{fmtAuditDate(row.created_at)}</td>
                  <td className="td text-xs">{row.changed_by || '—'}</td>
                  <td className="td font-mono text-xs">{row.field}</td>
                  <td className="td text-xs tabular-nums">{fmtAuditVal(row.old_value)}</td>
                  <td className="td text-xs tabular-nums">{fmtAuditVal(row.new_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>

    <Modal open={!!deleteFor} onClose={() => !deletingId && setDeleteFor(null)} size="sm"
      title="Delete brand?"
      subtitle={deleteFor ? `"${deleteFor.brand}" will be removed from Brand Master.` : ''}
      footer={(
        <>
          <button type="button" className="btn-ghost" disabled={!!deletingId} onClick={() => setDeleteFor(null)}>Cancel</button>
          <button type="button" disabled={!!deletingId} onClick={confirmDelete}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
            {deletingId ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Delete
          </button>
        </>
      )}>
      <p className="text-sm text-muted">
        Unused brands can be deleted. If any items still use this brand name, delete will be blocked with an error message.
      </p>
    </Modal>
    </>
  )
}
