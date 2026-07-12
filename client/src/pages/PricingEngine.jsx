import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Percent, Coins, Layers, Calculator, RefreshCw, Search, TrendingUp,
  AlertTriangle, Loader2, Plus, DollarSign,
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
const hasCost = (it) => Number(it?.supplier_price) > 0 || Number(it?.factory_cost) > 0
const markupOf = (it) => {
  const m = Number(it?.markup_factor)
  if (m > 0) return m
  const l = Number(it?.landed_cost), c = Number(it?.calculated_sale_price)
  return l > 0 && c > 0 ? c / l : null
}

const TABS = [
  { key: 'items', label: 'Price Items', icon: Calculator },
  { key: 'templates', label: 'Landed Cost Templates', icon: Layers },
  { key: 'discounts', label: 'Discount Rules', icon: Percent },
  { key: 'fx', label: 'Currencies & FX', icon: Coins },
]

export default function PricingEngine() {
  const d = useData()
  const { canSee } = useAuth()
  const canEdit = canSee('warehouse') || canSee('admin')
  const [tab, setTab] = useState('items')

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
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${tab === key ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'items' && <PriceItemsTab />}
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

// ── TAB 1: Price Items ──────────────────────────────────────────────────────────
function PriceItemsTab() {
  const d = useData()
  const items = d.items || []
  const [q, setQ] = useState('')
  const [brand, setBrand] = useState('')
  const [family, setFamily] = useState('')
  const [selected, setSelected] = useState(null)
  const [recalc, setRecalc] = useState({ busy: false, msg: '' })

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
          <button className="btn-primary" disabled={recalc.busy} onClick={runRecalc}>
            {recalc.busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Recalculate all
          </button>
        </div>
        {recalc.msg && <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700">{recalc.msg}</p>}
      </div>

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
              <th className="th text-right">Supplier</th><th className="th text-right">Landed</th>
              <th className="th text-right">Markup</th><th className="th text-right">Selling</th>
              <th className="th text-right">GP %</th><th className="th text-right">NP %</th>
            </tr></thead>
            <tbody>
              {priced.map((it) => (
                <tr key={it.id} className="cursor-pointer hover:bg-slate-50/60" onClick={() => setSelected(it)}>
                  <td className="td font-semibold text-ink">{it.item_name}</td>
                  <td className="td text-slate-600">{it.brand || '—'}</td>
                  <td className="td text-right tabular-nums">{money(it.supplier_price)}</td>
                  <td className="td text-right tabular-nums">{money(it.landed_cost)}</td>
                  <td className="td text-right tabular-nums">{markupOf(it) == null ? '—' : `×${markupOf(it).toFixed(2)}`}</td>
                  <td className="td text-right font-semibold tabular-nums text-brand-600">{money(it.selling_price)}</td>
                  <td className="td text-right tabular-nums">{pct(it.gp_percent)}</td>
                  <td className="td text-right tabular-nums">{pct(it.np_percent)}</td>
                </tr>
              ))}
              {priced.length === 0 && <tr><td className="td text-slate-400" colSpan={8}>No priced items match. Open an item below and enter a supplier price, or adjust filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* missing prices */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-amber-50/40 p-4">
          <AlertTriangle size={16} className="text-amber-500" />
          <div>
            <h3 className="text-[15px] font-bold text-ink">Cannot be priced — no supplier cost <span className="text-xs font-medium text-muted">({missing.length})</span></h3>
            <p className="text-xs text-muted">Click an item to enter its supplier price (or factory cost) and price it.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="bg-slate-50/60"><th className="th">Item</th><th className="th">Brand</th><th className="th">Model</th><th className="th">Family</th></tr></thead>
            <tbody>
              {missing.map((it) => (
                <tr key={it.id} className="cursor-pointer hover:bg-slate-50/60" onClick={() => setSelected(it)}>
                  <td className="td font-semibold text-ink">{it.item_name}</td>
                  <td className="td text-slate-600">{it.brand || '—'}</td>
                  <td className="td text-slate-600">{it.model || '—'}</td>
                  <td className="td text-slate-600">{it.product_family || '—'}</td>
                </tr>
              ))}
              {missing.length === 0 && <tr><td className="td text-slate-400" colSpan={4}>Every item that matches has a supplier cost.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} size="xl"
        title={selected?.item_name || 'Item pricing'} subtitle="Landed-cost chain · live preview">
        {selected && <ItemPricingPanel item={selected} onSaved={() => { /* store refreshed by panel */ }} />}
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
