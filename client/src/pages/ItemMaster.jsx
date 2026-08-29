import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { Search, Plus, Package, Layers, Tag, Sparkles, Settings2, Database, SlidersHorizontal, Trash2, RefreshCw, Loader2, Download, CheckCircle2, AlertTriangle, Link2, Inbox, Lock } from 'lucide-react'
import { PageHeader, Badge, Menu, MenuItem } from '../components/ui.jsx'
import { Modal, Field, Select } from '../components/Modal.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import ItemForm from '../components/ItemForm.jsx'
import QuickItemForm from '../components/QuickItemForm.jsx'
import ItemImportExport from '../components/ItemImportExport.jsx'
import EosImportModal from '../components/EosImportModal.jsx'
import ItemView from '../components/ItemView.jsx'
import ImageLightbox from '../components/ImageLightbox.jsx'
import { api } from '../api.js'

const PAGE_SIZE = 50

// ─────────────────────────────────────────────────────────────────────────────
// ITEM MASTER — CEO rule (14 Jul 2026):
//   "Item Master should show ONLY EOS-approved data. In the Item Master, roles get VIEW/READ access
//    only. Item data comes only from what the EOS admin has approved. Create, edit, approve, reject
//    and DELETE all live in EOS — nobody has them in the ERP Item Master."
//
// The server enforces it (POST /items · /items/import · /items/:id/variants · DELETE /items/:id → 403;
// PATCH /items/:id → 403 for ANY item-data field; masters create/edit/delete → 403) and the rule itself
// lives in the DB (system_settings.item_creation_source), NOT in code. So this page READS the policy
// from GET /eos/policy — it never hardcodes it. While the policy says 'eos' there is NO create, edit or
// delete entry point anywhere on this page (a button that only 403s is worse than no button). If the
// owner ever switches the policy back, those paths reappear on their own.
//
// PRICING IS NOT ITEM DATA. EOS carries no prices, so the ERP still owns them — they stay visible here
// and settable in the Pricing Engine (/stock/pricing). Brand pricing factors + supplier price lists
// likewise stay editable; only a brand's IDENTITY belongs to EOS.
// ─────────────────────────────────────────────────────────────────────────────

const fmtWhen = (dt) => dt.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
function ago(dt) {
  const s = Math.floor((Date.now() - dt.getTime()) / 1000)
  if (s < 90) return 'just now'
  const m = Math.floor(s / 60); if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h} h ago`
  return `${Math.floor(h / 24)} d ago`
}

// Turn the real /eos/auto-sync/run report into one honest sentence. Zeros everywhere = "Nothing new".
function syncLine(r) {
  if (!r) return ''
  if (r.skipped) return `A sync is already running${r.reason ? ` — ${r.reason}` : ''}.`
  const moved = (r.imported || 0) + (r.updated || 0) + (r.failed || 0)
  if (!moved) return `Nothing new — everything is already in sync${r.unchanged ? ` (${r.unchanged} items checked)` : ''}.`
  const parts = []
  if (r.imported) parts.push(`Imported ${r.imported}`)
  if (r.updated) parts.push(`Updated ${r.updated}`)
  if (r.unchanged) parts.push(`${r.unchanged} unchanged`)
  if (r.failed) parts.push(`${r.failed} failed`)
  return parts.join(' · ')
}

export default function ItemMaster() {
  const d = useData()
  const dRef = useRef(d); dRef.current = d   // stable handle — the store object changes every 12s
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  // Role gate: who may run the ERP-owned actions at all (sync, EOS import, pricing masters).
  const canEdit = ['Management', 'Stock Manager', 'Stock User'].includes(user?.role) || user?.access_level === 'Full Admin'
  const isMgmt = ['Management', 'System Admin'].includes(user?.role)
  const items = d.items || []
  const [q, setQ] = useState('')
  const [g, setG] = useState('All')
  const [disableBusy, setDisableBusy] = useState(null)
  const [page, setPage] = useState(0)
  const [masterItems, setMasterItems] = useState([])
  const [masterTotal, setMasterTotal] = useState(0)
  const [disabledCount, setDisabledCount] = useState(0)
  const [masterLoading, setMasterLoading] = useState(false)
  const [familyFilter, setFamilyFilter] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [form, setForm] = useState({ open: false, id: null })
  const [view, setView] = useState(null)
  const [quick, setQuick] = useState(false)
  const [masters, setMasters] = useState(false)
  const [eos, setEos] = useState(false)
  const [lightbox, setLightbox] = useState(null)

  // ── EOS link state (policy + status) ──
  const [policy, setPolicy] = useState(null)
  const [status, setStatus] = useState(null)
  const [eosErr, setEosErr] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncReport, setSyncReport] = useState(null)
  const [syncErr, setSyncErr] = useState('')

  // Read BOTH endpoints; allSettled so one failure never hides the other, and every failure is SURFACED.
  // (Both are readable by EVERY internal role now — a Project Manager sees the page cleanly.)
  const loadEos = useCallback(async () => {
    const [s, p] = await Promise.allSettled([dRef.current.resList('eos/status'), dRef.current.resList('eos/policy')])
    if (s.status === 'fulfilled') setStatus(s.value)
    if (p.status === 'fulfilled') setPolicy(p.value)
    else if (s.status === 'fulfilled' && s.value?.policy) setPolicy(s.value.policy)   // status carries the policy too
    const problems = [
      s.status === 'rejected' ? `status: ${s.reason?.message || s.reason}` : '',
      p.status === 'rejected' ? `policy: ${p.reason?.message || p.reason}` : '',
    ].filter(Boolean)
    setEosErr(problems.length ? `Could not read the EOS link — ${problems.join(' · ')}` : '')
  }, [])

  useEffect(() => { loadEos() }, [loadEos])

  const loadMaster = useCallback(async () => {
    setMasterLoading(true)
    try {
      const params = new URLSearchParams({
        include_disabled: '1',
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      })
      if (q.trim()) params.set('search', q.trim())
      if (familyFilter) params.set('family', familyFilter)
      if (brandFilter) params.set('brand', brandFilter)
      if (statusFilter === 'active') params.set('status', 'active')
      else if (statusFilter === 'disabled') params.set('status', 'disabled')
      const r = await api(`/items?${params}`)
      setMasterItems(r.items || [])
      setMasterTotal(Number(r.total) || 0)
      // KPI must match Item Master truth (include disabled), not DataContext cache
      try {
        const dc = await api('/items?include_disabled=1&status=disabled&limit=1&offset=0')
        setDisabledCount(Number(dc.total) || 0)
      } catch { /* keep previous */ }
    } catch {
      setMasterItems([])
      setMasterTotal(0)
    } finally {
      setMasterLoading(false)
    }
  }, [page, q, familyFilter, brandFilter, statusFilter])

  useEffect(() => { setPage(0) }, [q, familyFilter, brandFilter, statusFilter])

  useEffect(() => {
    const t = setTimeout(loadMaster, q.trim() ? 300 : 0)
    return () => clearTimeout(t)
  }, [loadMaster, q])

  const toggleDisabled = async (i, e) => {
    e.stopPropagation()
    const next = !i.disabled
    if (!window.confirm(`${next ? 'Disable' : 'Enable'} “${i.item_name || i.model}”?${next ? ' Disabled items are hidden from quotation pickers.' : ''}`)) return
    setDisableBusy(i.id)
    try {
      await api(`/items/${i.id}`, { method: 'PATCH', body: { disabled: next } })
      // Table uses masterItems (paged API), not DataContext — must reload this list
      setMasterItems((rows) => rows.map((r) => (r.id === i.id ? { ...r, disabled: next } : r)))
      setDisabledCount((n) => Math.max(0, n + (next ? 1 : -1)))
      await loadMaster()
      await d.loadItems?.()
    } catch (err) { alert(err.message || 'Failed to update item') }
    finally { setDisableBusy(null) }
  }

  // Global search / deep links open ?item=<uuid> — open the detail modal even when already on this page.
  useEffect(() => {
    const id = searchParams.get('item')
    if (id) setView(id)
  }, [searchParams])

  const closeView = () => {
    setView(null)
    if (searchParams.get('item')) {
      const next = new URLSearchParams(searchParams)
      next.delete('item')
      setSearchParams(next, { replace: true })
    }
  }

  // The SERVER policy decides, not this file. Unknown policy → assume the CEO's rule (the server enforces
  // it anyway, so showing a create/edit button would only produce a 403).
  const source = policy?.item_creation_source || 'eos'
  const eosOnly = source === 'eos'
  // The ONE flag that governs every item-DATA mutation affordance on this page: create, advanced form,
  // bulk import, edit, delete. Under the live 'eos' policy it is false for EVERY role, Management included.
  const erpOwnsItems = canEdit && !eosOnly
  const autoOn = (policy?.eos_auto_sync || 'on').toLowerCase() === 'on'
  const cadence = Number(policy?.eos_auto_sync_minutes) || 30
  const reachable = status?.eos_reachable !== false

  const syncTimes = [status?.last_sync, status?.last_auto_sync?.finished]
    .filter(Boolean).map((t) => new Date(t)).filter((t) => !Number.isNaN(t.getTime()))
  const lastAt = syncTimes.length ? new Date(Math.max(...syncTimes.map((t) => t.getTime()))) : null

  // Force a sync pass now — real report, real refresh, errors surfaced.
  const runSync = async () => {
    setSyncing(true); setSyncErr(''); setSyncReport(null)
    try {
      const r = await dRef.current.resAdd('eos/auto-sync/run', {})
      setSyncReport(r)
      await dRef.current.loadAll()   // newly-imported / updated items land in every panel
      await loadEos()
      await loadMaster()
    } catch (e) {
      setSyncErr(e?.message || 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  // Export stays available to everyone — it reads, it never creates. (Cost columns are server-redacted
  // per role, so whatever the user cannot see on screen is not in their file either.)
  const exportItems = async () => {
    try {
      let all = []
      let offset = 0
      let total = Infinity
      while (offset < total) {
        const r = await api(`/items?include_disabled=1&limit=200&offset=${offset}`)
        const batch = r.items || []
        total = Number(r.total) || batch.length
        all = all.concat(batch)
        if (!batch.length) break
        offset += batch.length
      }
      const data = all.map((i) => ({
        'Item Code': i.item_code, 'Item Name': i.item_name, 'Item Group': i.category || i.item_group, 'Sub Item Group': i.sub_category,
        'Product Family': i.product_family, 'Brand': i.brand, 'Model No.': i.model, 'Default Unit of Measure': i.stock_uom,
        'Dimensions': i.dimensions || '', 'Power Type': i.power_type || '', 'Country of Origin': i.country_of_origin || '',
        'Currency': i.currency || '', 'Supplier Net Price': i.supplier_price ?? '', 'Landed Cost': i.cost ?? '',
        'Add Margin %': i.add_margin_pct ?? '', 'Selling Price': i.standard_rate ?? '', 'GP %': i.gp_percent ?? '',
        'EOS Linked': i.eos_entry_id ? 'Yes' : 'No', 'Status': i.disabled ? 'Disabled' : 'Active',
      }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.length ? data : [{ 'Item Code': '' }]), 'Item Master')
      XLSX.writeFile(wb, `Culinova-Item-Master-${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (e) {
      setEosErr(`Export failed — ${e?.message || 'unknown error'}`)
    }
  }

  const familyOptions = useMemo(() => ['', ...new Set((d.productFamilies || []).map((f) => f.name || f).filter(Boolean))], [d.productFamilies])
  const brandOptions = useMemo(() => ['', ...new Set((d.brands || []).map((b) => b.brand).filter(Boolean))], [d.brands])
  const brandFactorsPending = useMemo(() => {
    const m = new Map()
    for (const b of d.brands || []) {
      if (b.factors_pending) m.set(String(b.brand || '').toLowerCase(), true)
    }
    return m
  }, [d.brands])
  const groups = ['All', ...new Set(items.map((i) => i.category).filter(Boolean))]
  const rows = g === 'All'
    ? masterItems
    : masterItems.filter((i) => i.category === g)
  const seeCost = masterItems.some((i) => i.cost != null) || items.some((i) => i.cost != null)
  const pageCount = Math.max(1, Math.ceil(masterTotal / PAGE_SIZE))
  const rangeFrom = masterTotal ? page * PAGE_SIZE + 1 : 0
  const rangeTo = Math.min(masterTotal, (page + 1) * PAGE_SIZE)

  const flag = (on, label, tone) => (on ? <span className={`mr-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${tone}`}>{label}</span> : null)

  return (
    <>
      <PageHeader title="Item Master" subtitle={eosOnly ? 'View only — synchronised from CULINOVA EOS, the single source of truth for item data' : 'Central catalogue — used by every panel'}>
        {/* The bulk Import/Export menu carries an IMPORT entry — it only exists while the ERP may create items. */}
        {erpOwnsItems && <ItemImportExport />}
        {/* Export always stays: it reads, it never writes. */}
        {!erpOwnsItems && (
          <button className="btn-ghost whitespace-nowrap" onClick={exportItems}><Download size={16} /> Export</button>
        )}
        {canEdit && (
          <Menu label="More" icon={Settings2}>
            <MenuItem icon={Settings2} onClick={() => setMasters(true)}>
              {eosOnly ? 'Masters (brand factors · price lists)' : 'Masters (brands · families · price lists)'}
            </MenuItem>
            {erpOwnsItems && <MenuItem icon={SlidersHorizontal} onClick={() => setForm({ open: true, id: null })}>Advanced item form</MenuItem>}
          </Menu>
        )}
        {erpOwnsItems && <button className="btn-primary whitespace-nowrap" onClick={() => setQuick(true)}><Plus size={16} /> New Item</button>}
      </PageHeader>

      {/* ── THE HEADLINE: the EOS relationship. Calm, factual — not an error. ── */}
      <div className={`card mb-4 overflow-hidden animate-fade-up ${reachable ? '' : 'ring-1 ring-amber-200'}`}>
        <div className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${reachable ? 'bg-gradient-to-r from-brand-50/70 to-transparent' : 'bg-amber-50/60'}`}>
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white shadow-soft ${reachable ? 'bg-brand-500' : 'bg-amber-500'}`}>
            {reachable ? <Database size={20} /> : <AlertTriangle size={20} />}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="flex flex-wrap items-center gap-2 font-display text-[15px] font-bold text-ink">
              {eosOnly ? 'Item data is owned by CULINOVA EOS — the Item Master is read-only here' : `Item creation policy: ${source} — EOS sync stays active`}
              {eosOnly && <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500"><Lock size={10} /> View only</span>}
            </h3>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              {eosOnly
                ? <>Create, edit, approve, reject and delete all happen in EOS — approved items sync here. </>
                : <>The owner has allowed items to be created in the ERP, so the create and edit actions are available again. </>}
              {autoOn
                ? <>Approved items sync in automatically <b className="text-slate-600">every {cadence} min</b>.</>
                : <span className="font-semibold text-amber-600">Automatic sync is switched OFF — use “Sync now”.</span>}
              {lastAt && <> Last sync <b className="text-slate-600" title={fmtWhen(lastAt)}>{ago(lastAt)}</b> ({fmtWhen(lastAt)}).</>}
              {!lastAt && status && <> No sync has run yet.</>}
              {!reachable && <span className="font-semibold text-amber-700"> EOS is unreachable — the last known data is shown.</span>}
              {eosOnly && <> Pricing is not item data — set it in the <b className="text-slate-600">Pricing Engine</b>.</>}
            </p>
          </div>
          {canEdit && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button className="btn-ghost whitespace-nowrap" disabled={syncing} onClick={runSync} title="Force an EOS → Item Master sync pass right now">
                {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} {syncing ? 'Syncing…' : 'Sync now'}
              </button>
              <button className="btn-primary whitespace-nowrap" onClick={() => setEos(true)}>
                <Database size={16} /> Import from EOS
              </button>
            </div>
          )}
        </div>

        {/* status strip — real numbers from GET /eos/status */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 border-t border-slate-100 px-4 py-2.5">
          <Strip icon={Package} label="Total items" value={status?.total_items ?? items.length} tone="text-brand-600" />
          <Strip icon={Link2} label="Linked to EOS" value={status?.eos_linked ?? items.filter((i) => i.eos_entry_id).length} tone="text-emerald-600" />
          <Strip icon={Inbox} label="Approved & pending import" value={status?.pending_approved ?? '—'} tone={status?.pending_approved ? 'text-amber-600' : 'text-slate-400'}
            hint={!reachable ? 'EOS unreachable' : status?.total_approved != null ? `${status.total_approved} approved in EOS` : ''} />
        </div>

        {(syncReport || syncErr || eosErr) && (
          <div className="space-y-1.5 border-t border-slate-100 px-4 py-2.5">
            {syncReport && (
              <div className={`flex items-start gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${syncReport.failed ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'}`}>
                {syncReport.failed ? <AlertTriangle size={13} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={13} className="mt-0.5 shrink-0" />}
                <span>
                  {syncLine(syncReport)}
                  {(syncReport.errors || []).length > 0 && (
                    <span className="mt-0.5 block font-normal text-rose-600">
                      {(syncReport.errors || []).map((er, i) => <span key={i} className="block">{er.item_name || er.id || 'EOS'}: {er.error}</span>)}
                    </span>
                  )}
                </span>
              </div>
            )}
            {syncErr && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">Sync failed — {syncErr}</div>}
            {eosErr && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{eosErr}</div>}
          </div>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Items" value={items.filter((i) => !i.has_variants).length} icon={Package} tone="text-brand-600" />
        <Stat label="Templates" value={items.filter((i) => i.has_variants).length} icon={Layers} tone="text-violet-600" />
        <Stat label="Product Families" value={(d.productFamilies || []).length} icon={Tag} tone="text-gold-600" />
        <Stat label="Disabled" value={disabledCount} icon={Sparkles} tone="text-rose-600" />
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4">
          <div className="flex flex-wrap items-end gap-2">
            <label className="block min-w-[140px]">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">Family</span>
              <select value={familyFilter} onChange={(e) => setFamilyFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-2 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white">
                <option value="">All families</option>
                {familyOptions.filter(Boolean).map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <label className="block min-w-[140px]">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">Brand</span>
              <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-2 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white">
                <option value="">All brands</option>
                {brandOptions.filter(Boolean).map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
            <label className="block min-w-[120px]">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">Status</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-2 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white">
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>
            <div className="relative min-w-[200px] flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code / name / brand…" className="w-full rounded-lg border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:bg-white" />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {groups.slice(0, 8).map((x) => (
              <button key={x} onClick={() => setG(x)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${g === x ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{x}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">Model</th><th className="th">Item</th><th className="th">Family</th><th className="th">Category</th><th className="th">Brand</th>
              <th className="th">Type</th>{seeCost && <th className="th">Cost</th>}<th className="th">Sell Rate</th><th className="th">Status</th>
              {isMgmt && <th className="th">Actions</th>}
            </tr></thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} onClick={() => setView(i.id)} className="cursor-pointer hover:bg-slate-50/60">
                  <td className="td">
                    <div className="font-semibold text-brand-600">{i.model || i.item_name || i.item_code}</div>
                    <div className="text-[10px] text-slate-400" title="Internal item code — for database references only">{i.item_code}</div>
                  </td>
                  <td className="td font-medium text-ink">
                    <div className="flex items-center gap-2">
                      {i.image_url ? <img src={i.image_url} alt="" onClick={(e) => { e.stopPropagation(); setLightbox(i.image_url) }} className="h-12 w-12 shrink-0 cursor-zoom-in rounded-lg border border-slate-200 object-cover transition hover:ring-2 hover:ring-brand-400" /> : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-dashed border-slate-200 text-[9px] text-slate-300">IMG</span>}
                      <span>{i.item_name}{i.variant_of && <span className="ml-1 text-[10px] text-violet-500">variant</span>}{i.eos_entry_id && <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-brand-50 px-1 py-0.5 text-[9px] font-bold text-brand-600" title="Synced from CULINOVA EOS"><Database size={9} /> EOS</span>}</span>
                    </div>
                  </td>
                  <td className="td text-slate-500">{i.product_family || '—'}</td>
                  <td className="td text-slate-500">{i.category || '—'}</td>
                  <td className="td text-slate-500">
                    {i.brand || '—'}
                    {i.brand && brandFactorsPending.get(String(i.brand).toLowerCase()) && (
                      <span className="ml-1 inline-flex items-center rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700" title="Set exchange and price factors in Pricing Engine → Brand Master">Brand factors not set</span>
                    )}
                  </td>
                  <td className="td">
                    {flag(i.is_stock_item, 'STK', 'bg-emerald-50 text-emerald-600')}
                    {flag(i.is_sales_item, 'SAL', 'bg-blue-50 text-blue-600')}
                    {flag(i.is_purchase_item, 'PUR', 'bg-amber-50 text-amber-600')}
                    {flag(i.has_variants, 'TPL', 'bg-violet-50 text-violet-600')}
                  </td>
                  {seeCost && <td className="td text-slate-600">{i.cost != null ? sar(i.cost) : '—'}</td>}
                  <td className="td font-semibold">{sar(i.standard_rate || 0)}</td>
                  <td className="td"><Badge tone={i.disabled ? 'red' : 'green'}>{i.disabled ? 'Disabled' : 'Active'}</Badge></td>
                  {isMgmt && (
                    <td className="td" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="btn-ghost !px-2 !py-1 text-[11px]" disabled={disableBusy === i.id}
                        onClick={(e) => toggleDisabled(i, e)}>
                        {disableBusy === i.id ? <Loader2 size={12} className="animate-spin" /> : null}
                        {i.disabled ? 'Enable' : 'Disable'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td className="td text-slate-400" colSpan={(seeCost ? 9 : 8) + (isMgmt ? 1 : 0)}>
                  {masterLoading ? 'Loading…'
                    : masterTotal === 0
                      ? (eosOnly ? 'No items yet — approve an item in CULINOVA EOS and it will appear here.' : 'No items yet.')
                      : 'No items match these filters.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-xs text-muted">
          <span>{masterLoading ? 'Loading…' : masterTotal ? `${rangeFrom}–${rangeTo} of ${masterTotal}` : '0 items'}</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page <= 0 || masterLoading} onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Prev</button>
            <span className="font-semibold text-slate-500">Page {page + 1} / {pageCount}</span>
            <button type="button" disabled={page + 1 >= pageCount || masterLoading} onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>

      {/* Read-only detail. onEdit is only wired when the ERP owns items; under the 'eos' policy the
          modal has no Edit and no Delete at all — it points at the Pricing Engine for prices instead. */}
      <ItemView
        open={!!view}
        itemId={view}
        canEditData={erpOwnsItems}
        canPrice={canEdit}
        eosOwned={eosOnly}
        onClose={closeView}
        onEdit={erpOwnsItems ? () => { setForm({ open: true, id: view }); closeView() } : undefined}
      />

      {/* ItemForm / QuickItemForm are NOT deleted — they simply have no route into them while EOS owns
          item data. They come back the moment the owner switches item_creation_source away from 'eos'. */}
      {erpOwnsItems && <ItemForm open={form.open} itemId={form.id} onClose={() => setForm({ open: false, id: null })} />}
      {erpOwnsItems && <QuickItemForm open={quick} onClose={() => setQuick(false)} />}

      <EosImportModal open={eos} onClose={() => setEos(false)} onImported={loadEos} />
      <MastersModal open={masters} onClose={() => setMasters(false)} eosOwned={eosOnly} />
      <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
    </>
  )
}

function Strip({ icon: Icon, label, value, tone, hint }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <Icon size={14} className={tone} />
      <b className={`text-sm font-extrabold ${tone}`}>{value}</b>
      <span className="text-muted">{label}</span>
      {hint && <span className="text-[10px] text-slate-400">· {hint}</span>}
    </span>
  )
}

function Stat({ label, value, icon: Icon, tone }) {
  return (
    <div className="card card-pad flex items-center gap-3">
      <span className={`grid h-10 w-10 place-items-center rounded-xl bg-slate-100 ${tone}`}><Icon size={18} /></span>
      <div><p className={`text-2xl font-extrabold ${tone}`}>{value}</p><p className="text-xs text-muted">{label}</p></div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MASTERS — mirrors the server exactly.
//   Under item_creation_source = 'eos':
//     · brands / product families / units / item groups / attributes  → create·edit·delete are 403.
//       They are created by the EOS import, so here they are a READ-ONLY reference list.
//     · a brand's PRICING factors (currency · exchange · price factor) are still PATCHable — EOS
//       carries no prices, so the ERP owns them. Kept editable.
//     · supplier price lists are pure pricing → still importable.
// ─────────────────────────────────────────────────────────────────────────────
const EOS_NOTE = 'Created in CULINOVA EOS and synced here. To add or change one, do it in EOS.'
const MTABS = ['Brands', 'Product Families', 'Units', 'Price Lists']

function MastersModal({ open, onClose, eosOwned = true }) {
  const d = useData()
  const [tab, setTab] = useState('Brands')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const ok = (t) => { setErr(''); setMsg(t); setTimeout(() => setMsg(''), 2500) }
  const fail = (e) => { setMsg(''); setErr(e?.message || 'Something went wrong') }

  const [br, setBr] = useState({ brand: '', currency: 'SAR', exchange_factor: 1, price_factor: 1, country_of_origin: '', country_of_purchase: '' })
  const [fam, setFam] = useState({ name: '', category: 'Equipment', sub_category: '', datasheet_url: '' })
  const [pl, setPl] = useState({ name: '', brand: '', currency: '', year: '', rows: '' })
  const [uoms, setUoms] = useState([])
  const [uom, setUom] = useState({ name: '', symbol: '' })

  // brand PRICING factors — the one thing the ERP still owns on a brand
  const [edit, setEdit] = useState(null)          // { id, currency, exchange_factor, price_factor }
  const [savingBrand, setSavingBrand] = useState(false)

  const loadUoms = useCallback(async () => {
    try { const u = await d.resList('masters/uoms'); setUoms(Array.isArray(u) ? u : []) }
    catch (e) { setUoms([]); setErr(`Could not load units — ${e?.message || 'unknown error'}`) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { if (open) { setErr(''); setMsg(''); setEdit(null); loadUoms() } }, [open, loadUoms])

  const addUom = async () => { if (!uom.name) return; try { await d.resAdd('masters/uoms', uom); setUom({ name: '', symbol: '' }); await loadUoms(); ok('Unit added') } catch (e) { fail(e) } }
  const delUom = async (id) => { try { await d.resDelete('masters/uoms', id); await loadUoms(); ok('Unit removed') } catch (e) { fail(e) } }
  const addBrand = async () => { if (!br.brand) return; try { await d.addBrand(br); setBr({ brand: '', currency: 'SAR', exchange_factor: 1, price_factor: 1, country_of_origin: '', country_of_purchase: '' }); ok('Brand added') } catch (e) { fail(e) } }
  const addFam = async () => { if (!fam.name) return; try { await d.addProductFamily(fam); setFam({ name: '', category: 'Equipment', sub_category: '', datasheet_url: '' }); ok('Product Family added') } catch (e) { fail(e) } }

  // ALLOWED under the EOS policy — pricing is not item data.
  const saveFactors = async () => {
    if (!edit) return
    setSavingBrand(true)
    try {
      await d.updateBrand(edit.id, {
        currency: edit.currency || 'SAR',
        exchange_factor: Number(edit.exchange_factor) || 1,
        price_factor: Number(edit.price_factor) || 1,
      })
      setEdit(null)
      ok('Pricing factors saved — items on this brand are repriced on their next save.')
    } catch (e) { fail(e) } finally { setSavingBrand(false) }
  }

  const addPL = async () => {
    if (!pl.name) return
    const items = pl.rows.split('\n').map((l) => l.split(/[,\t]/)).filter((c) => c[0] && c[0].trim()).map((c) => ({ model: c[0].trim(), supplier_price: Number((c[1] || '').trim()) || 0 }))
    try { const r = await d.addPriceList({ name: pl.name, brand: pl.brand, currency: pl.currency, year: pl.year, items }); setPl({ name: '', brand: '', currency: '', year: '', rows: '' }); ok(`Price list added (${r.imported} items)`) } catch (e) { fail(e) }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Item Masters"
      subtitle={eosOwned ? 'Brand pricing factors · Supplier price lists — everything else is owned by EOS' : 'Brands (factors) · Product Families · Supplier Price Lists'}
      footer={<button className="btn-ghost" onClick={onClose}>Close</button>}>
      <div className="-mt-1 mb-3 flex gap-1.5 border-b border-slate-100 pb-3">
        {MTABS.map((t) => <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === t ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{t}</button>)}
      </div>
      {msg && <div className="mb-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-600">{msg}</div>}
      {err && <div className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{err}</div>}

      {tab === 'Brands' && (
        <div className="space-y-3">
          {eosOwned && (
            <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-muted">
              <Lock size={12} className="mt-0.5 shrink-0 text-slate-400" />
              <span>Most brand names arrive from EOS. You can also <b className="text-slate-600">add brands here</b> and set pricing factors in the ERP.</span>
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Brand Name" value={br.brand} onChange={(e) => setBr((s) => ({ ...s, brand: e.target.value }))} />
            <Field label="Currency" value={br.currency} onChange={(e) => setBr((s) => ({ ...s, currency: e.target.value }))} placeholder="SAR" />
            <Field label="Exchange Factor" type="number" value={br.exchange_factor} onChange={(e) => setBr((s) => ({ ...s, exchange_factor: e.target.value }))} hint="supplier price × this = landed cost" />
            <Field label="Price Factor" type="number" value={br.price_factor} onChange={(e) => setBr((s) => ({ ...s, price_factor: e.target.value }))} hint="landed × this = selling price" />
            <Field label="Country of Origin" value={br.country_of_origin} onChange={(e) => setBr((s) => ({ ...s, country_of_origin: e.target.value }))} placeholder="Italy" />
            <Field label="Country of Purchase" value={br.country_of_purchase} onChange={(e) => setBr((s) => ({ ...s, country_of_purchase: e.target.value }))} placeholder="KSA" />
          </div>
          <button className="btn-primary !py-2" onClick={addBrand}>Add Brand</button>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50/60">
                <th className="th">Brand</th><th className="th">Currency</th><th className="th">Exchange</th><th className="th">Price Factor</th><th className="th"></th>
              </tr></thead>
              <tbody>
                {(d.brands || []).map((b) => {
                  const on = edit?.id === b.id
                  return (
                    <tr key={b.id}>
                      <td className="td font-medium text-ink">{b.brand}</td>
                      {on ? (
                        <>
                          <td className="td"><input value={edit.currency} onChange={(e) => setEdit((s) => ({ ...s, currency: e.target.value }))} className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-brand-400" /></td>
                          <td className="td"><input type="number" step="0.0001" value={edit.exchange_factor} onChange={(e) => setEdit((s) => ({ ...s, exchange_factor: e.target.value }))} className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-brand-400" /></td>
                          <td className="td"><input type="number" step="0.0001" value={edit.price_factor} onChange={(e) => setEdit((s) => ({ ...s, price_factor: e.target.value }))} className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-brand-400" /></td>
                          <td className="td">
                            <div className="flex gap-1.5">
                              <button className="btn-primary !px-2.5 !py-1 !text-xs" disabled={savingBrand} onClick={saveFactors}>{savingBrand ? <Loader2 size={12} className="animate-spin" /> : null} Save</button>
                              <button className="btn-ghost !px-2.5 !py-1 !text-xs" onClick={() => setEdit(null)}>Cancel</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="td">{b.currency || '—'}</td>
                          <td className="td">{b.exchange_factor ?? '—'}</td>
                          <td className="td">{b.price_factor ?? '—'}</td>
                          <td className="td">
                            <button className="text-xs font-semibold text-brand-600 hover:underline"
                              onClick={() => setEdit({ id: b.id, currency: b.currency || 'SAR', exchange_factor: b.exchange_factor ?? 1, price_factor: b.price_factor ?? 1 })}>
                              Edit factors
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
                {(d.brands || []).length === 0 && (
                  <tr><td className="td text-slate-400" colSpan={5}>{eosOwned ? 'No brands yet — they arrive with the first approved EOS item.' : 'No brands yet.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'Product Families' && (
        <div className="space-y-3">
          {eosOwned ? (
            <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-muted">
              <Lock size={12} className="mt-0.5 shrink-0 text-slate-400" /> <span>{EOS_NOTE}</span>
            </p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Family Name" value={fam.name} onChange={(e) => setFam((s) => ({ ...s, name: e.target.value }))} placeholder="4 Burner Gas Range" />
                <Select label="Category" value={fam.category} onChange={(e) => setFam((s) => ({ ...s, category: e.target.value }))} options={['Equipment', 'Custom Fabrication']} />
                <Field label="Sub Category" value={fam.sub_category} onChange={(e) => setFam((s) => ({ ...s, sub_category: e.target.value }))} placeholder="Cooking Equipment" />
                <Field label="Datasheet URL (custom fab)" value={fam.datasheet_url} onChange={(e) => setFam((s) => ({ ...s, datasheet_url: e.target.value }))} placeholder="https://…" />
              </div>
              <button className="btn-primary !py-2" onClick={addFam}>Add Product Family</button>
            </>
          )}
          <div className="flex flex-wrap gap-1.5">
            {(d.productFamilies || []).map((f) => <span key={f.id} className="rounded-lg bg-slate-100 px-2 py-1 text-[11px]">{f.name} <span className="text-slate-400">· {f.category}</span></span>)}
            {(d.productFamilies || []).length === 0 && <span className="text-xs text-slate-400">{eosOwned ? 'No product families yet — they arrive with the first approved EOS item.' : 'No product families yet.'}</span>}
          </div>
        </div>
      )}

      {tab === 'Units' && (
        <div className="space-y-3">
          {eosOwned ? (
            <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-muted">
              <Lock size={12} className="mt-0.5 shrink-0 text-slate-400" /> <span>{EOS_NOTE}</span>
            </p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Unit Name" value={uom.name} onChange={(e) => setUom((s) => ({ ...s, name: e.target.value }))} placeholder="e.g. Kilogram" />
                <Field label="Symbol" value={uom.symbol} onChange={(e) => setUom((s) => ({ ...s, symbol: e.target.value }))} placeholder="e.g. kg" />
              </div>
              <button className="btn-primary !py-2" onClick={addUom}>Add Unit</button>
            </>
          )}
          <div className="flex flex-wrap gap-1.5">
            {uoms.map((u) => (
              <span key={u.id} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px]">
                {u.name}{u.symbol ? ` · ${u.symbol}` : ''}
                {!eosOwned && <button onClick={() => delUom(u.id)} className="text-slate-400 hover:text-rose-500"><Trash2 size={11} /></button>}
              </span>
            ))}
            {uoms.length === 0 && <span className="text-xs text-slate-400">No units yet.</span>}
          </div>
        </div>
      )}

      {/* Supplier price lists are PRICING — the ERP owns them under every policy. */}
      {tab === 'Price Lists' && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="List Name" value={pl.name} onChange={(e) => setPl((s) => ({ ...s, name: e.target.value }))} placeholder="Fagor 2027 Price List" />
            <Select label="Brand" value={pl.brand} onChange={(e) => setPl((s) => ({ ...s, brand: e.target.value }))} options={['', ...(d.brands || []).map((b) => b.brand)]} />
            <Field label="Currency" value={pl.currency} onChange={(e) => setPl((s) => ({ ...s, currency: e.target.value }))} placeholder="EUR" />
            <Field label="Year" value={pl.year} onChange={(e) => setPl((s) => ({ ...s, year: e.target.value }))} placeholder="2027" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Paste from Excel — one line per item: <span className="text-muted">Model, SupplierPrice</span></label>
            <textarea rows={5} value={pl.rows} onChange={(e) => setPl((s) => ({ ...s, rows: e.target.value }))} placeholder={'C-G941, 1000\nC-G740, 850'} className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm font-mono outline-none focus:border-brand-400 focus:bg-white" />
          </div>
          <button className="btn-primary !py-2" onClick={addPL}>Import Price List</button>
          <div className="space-y-1">{(d.priceLists || []).map((l) => <div key={l.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-1.5 text-xs"><span className="font-medium text-ink">{l.name}</span><span className="text-muted">{l.brand} · {l.items} items</span></div>)}</div>
        </div>
      )}
    </Modal>
  )
}
