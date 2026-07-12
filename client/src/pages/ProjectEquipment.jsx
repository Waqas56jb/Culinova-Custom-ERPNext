import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus, Package, Trash2, Loader2, Search, Boxes, Truck, Wrench,
  CheckCircle2, Layers, Sparkles, FolderKanban, DollarSign,
} from 'lucide-react'
import { PageHeader, KpiCard } from '../components/ui.jsx'
import { Modal, Field, Select, TextArea } from '../components/Modal.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { api } from '../api.js'

// Roles that receive cost / margin (mirrors server rbac/permissions.financialRoles). The server ALSO
// redacts, so a non-financial viewer just gets undefined — we never render "NaN"/"undefined".
const FIN_ROLES = ['Management', 'System Admin', 'Accounts User', 'Purchase User', 'Stock User', 'Project Manager']
const pctStr = (n) => `${Math.round(Number(n) || 0)}%`
const isEos = (i) => !!(i && (i.eos_entry_id || i.eos_model_number))

// status → subtle colour for the inline dropdowns
const TONE = {
  Pending: 'bg-amber-50 text-amber-700', 'In Transit': 'bg-blue-50 text-blue-700', Delivered: 'bg-emerald-50 text-emerald-700',
  'Not Started': 'bg-slate-100 text-slate-600', 'In Progress': 'bg-blue-50 text-blue-700', Completed: 'bg-emerald-50 text-emerald-700',
}

function ProgressBar({ label, value, icon: Icon, tone = 'brand' }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0))
  const bar = { brand: 'bg-brand-500', gold: 'bg-gold-500', emerald: 'bg-emerald-500' }[tone] || 'bg-brand-500'
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-medium text-ink">{Icon && <Icon size={14} className="text-slate-400" />}{label}</span>
        <span className="font-semibold text-ink">{pctStr(v)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${bar} transition-all duration-500`} style={{ width: `${v}%` }} />
      </div>
    </div>
  )
}

export default function ProjectEquipment() {
  const { projects, items, warehouses, resList } = useData()
  const { user } = useAuth()
  const fin = FIN_ROLES.includes(user?.role)
  const canDelete = user?.access_level === 'Full Admin'

  const [selProject, setSelProject] = useState('')
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [statusOpts, setStatusOpts] = useState({ delivery: [], installation: [], commissioning: [] })
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [qtyDraft, setQtyDraft] = useState({})
  const [modal, setModal] = useState(false)
  const [err, setErr] = useState('')

  // pick the first project by default so the page is never blank when projects exist
  useEffect(() => { if (!selProject && (projects || []).length) setSelProject(projects[0].id) }, [projects, selProject])

  // the status vocabulary comes from the server (not hardcoded on the client)
  useEffect(() => { api('/project-equipment/meta/status-options').then((o) => o && setStatusOpts(o)).catch(() => {}) }, [])

  const itemById = useMemo(() => { const m = {}; for (const i of items || []) m[i.id] = i; return m }, [items])

  const load = useCallback(async (pid) => {
    if (!pid) { setRows([]); setSummary(null); return }
    setLoading(true); setErr('')
    try {
      const [list, sum] = await Promise.all([
        resList('project-equipment', `project_id=${pid}`),
        api(`/project-equipment/summary/${pid}`),
      ])
      setRows(list || []); setSummary(sum || null)
    } catch (e) { setErr(e.message) } finally { setLoading(false) }
  }, [resList])

  useEffect(() => { load(selProject) }, [selProject, load])

  const refresh = () => load(selProject)
  const run = async (fn) => { setBusy(true); setErr(''); try { await fn(); await refresh() } catch (e) { setErr(e.message); alert(e.message) } finally { setBusy(false) } }

  const s = summary || {}
  const projectOpts = [{ value: '', label: '— Select a project —' }, ...(projects || []).map((p) => ({ value: p.id, label: `${p.ref || p.number || ''} · ${p.name || ''}`.trim() }))]

  // ── actions ──────────────────────────────────────────────────────────────
  async function onAssign(body) { await run(() => api('/project-equipment', { method: 'POST', body: { ...body, project_id: selProject } })); setModal(false) }
  async function commitQty(row, val) {
    const q = Number(val)
    setQtyDraft((d) => { const n = { ...d }; delete n[row.id]; return n })
    if (!Number.isFinite(q) || q <= 0 || q === Number(row.qty)) return
    await run(() => api(`/project-equipment/${row.id}`, { method: 'PATCH', body: { qty: q } }))
  }
  async function setStatus(row, field, value) {
    if (value === row[`${field}_status`]) return
    await run(() => api(`/project-equipment/${row.id}/status`, { method: 'POST', body: { field, value } }))
  }
  const optDisabled = (field, opt, row) => (
    (field === 'installation' && opt === 'Completed' && row.delivery_status !== 'Delivered') ||
    (field === 'commissioning' && opt === 'Completed' && row.installation_status !== 'Completed')
  )

  const colCount = 6 + (fin ? 2 : 0) + 3 + (canDelete ? 1 : 0)

  return (
    <>
      <PageHeader title="Project Equipment" subtitle="Assign equipment to a project and track delivery, installation & commissioning">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Project</span>
          <select className="min-w-[220px] max-w-[280px] rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white"
            value={selProject} onChange={(e) => setSelProject(e.target.value)}>
            {projectOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <button className="btn-primary" disabled={!selProject} onClick={() => setModal(true)}><Plus size={16} /> Assign Equipment</button>
      </PageHeader>

      {err && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{err}</div>}

      {(projects || []).length === 0 ? (
        <div className="card card-pad text-center text-sm text-muted">
          <FolderKanban size={22} className="mx-auto mb-2 text-slate-300" />
          No projects yet. Create a project first (Project Management → Projects), then come back to assign its equipment.
        </div>
      ) : !selProject ? (
        <div className="card card-pad text-center text-sm text-muted">Select a project above to see its equipment.</div>
      ) : (
        <>
          {/* KPI roll-up (from /summary — real rows) */}
          <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard label="Equipment Lines" value={s.item_count || 0} icon={Boxes} accent="brand" sub={`${s.total_qty || 0} units total`} />
            <KpiCard label="Total Price" value={sar(s.total_price)} icon={DollarSign} accent="violet" />
            {fin && <KpiCard label="Total Cost" value={sar(s.total_cost)} icon={Package} accent="gold" />}
            {fin && <KpiCard label="Margin" value={sar(s.margin)} icon={Layers} accent="emerald" sub={pctStr(s.gp_percent)} />}
            {!fin && <KpiCard label="Units" value={s.total_qty || 0} icon={Package} accent="gold" />}
          </div>

          {/* progress per lifecycle dimension */}
          <div className="card card-pad mb-5">
            <h3 className="mb-4 text-[15px] font-bold text-ink">Site Progress</h3>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <ProgressBar label="Delivery" value={s.delivery_pct} icon={Truck} tone="brand" />
              <ProgressBar label="Installation" value={s.installation_pct} icon={Wrench} tone="gold" />
              <ProgressBar label="Commissioning" value={s.commissioning_pct} icon={CheckCircle2} tone="emerald" />
            </div>
          </div>

          {/* equipment table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px]">
                <thead>
                  <tr className="bg-slate-50/60">
                    <th className="th">Code</th>
                    <th className="th">Equipment</th>
                    <th className="th">Area / Position</th>
                    <th className="th w-24">Qty</th>
                    <th className="th">Unit Price</th>
                    <th className="th">Total Price</th>
                    {fin && <th className="th">Unit Cost</th>}
                    {fin && <th className="th">Total Cost</th>}
                    <th className="th">Delivery</th>
                    <th className="th">Installation</th>
                    <th className="th">Commissioning</th>
                    {canDelete && <th className="th"></th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const it = itemById[r.item_id]
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/60">
                        <td className="td text-xs text-slate-500">{r.item_code || '—'}</td>
                        <td className="td">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-ink">{r.item_name || '—'}</span>
                            {isEos(it) && <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700"><Sparkles size={10} /> EOS</span>}
                          </div>
                        </td>
                        <td className="td text-slate-500">
                          {r.area || '—'}{r.position ? <span className="text-xs text-muted"> · {r.position}</span> : ''}
                        </td>
                        <td className="td">
                          <input type="number" min="0" step="any"
                            className="w-20 rounded-lg border border-slate-200 bg-slate-50/60 px-2 py-1 text-sm outline-none focus:border-brand-400 focus:bg-white"
                            value={qtyDraft[r.id] ?? r.qty}
                            onChange={(e) => setQtyDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                            onBlur={(e) => commitQty(r, e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
                        </td>
                        <td className="td text-slate-500">{sar(r.unit_price)}</td>
                        <td className="td font-semibold">{sar(r.total_price)}</td>
                        {fin && <td className="td text-slate-500">{sar(r.unit_cost)}</td>}
                        {fin && <td className="td text-slate-500">{sar(r.total_cost)}</td>}
                        {['delivery', 'installation', 'commissioning'].map((field) => {
                          const val = r[`${field}_status`] || ''
                          const base = statusOpts[field] || []
                          // keep the row's current value selectable even if it predates this module's
                          // vocabulary (e.g. a BOQ-pushed row still carrying the DB default 'Pending')
                          const opts = val && !base.includes(val) ? [...base, val] : base
                          return (
                            <td key={field} className="td">
                              <select value={val} disabled={busy} onChange={(e) => setStatus(r, field, e.target.value)}
                                className={`rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold outline-none ${TONE[val] || 'bg-slate-100 text-slate-600'}`}>
                                {opts.map((o) => (
                                  <option key={o} value={o} disabled={optDisabled(field, o, r)}>{o}</option>
                                ))}
                              </select>
                            </td>
                          )
                        })}
                        {canDelete && (
                          <td className="td">
                            <button className="rounded-lg border border-rose-200 p-1.5 text-rose-500 hover:bg-rose-50" title="Remove"
                              onClick={() => { if (confirm(`Remove ${r.item_name} from this project?`)) run(() => api(`/project-equipment/${r.id}`, { method: 'DELETE' })) }}>
                              <Trash2 size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                  {!loading && rows.length === 0 && (
                    <tr><td className="td text-slate-400" colSpan={colCount}>No equipment assigned to this project yet. Click <b>“Assign Equipment”</b> to pick items from the Item Master.</td></tr>
                  )}
                  {loading && <tr><td className="td text-slate-400" colSpan={colCount}><Loader2 size={15} className="inline animate-spin" /> Loading…</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {modal && <AssignModal onClose={() => setModal(false)} items={items} warehouses={warehouses} fin={fin} busy={busy} onAssign={onAssign} />}
    </>
  )
}

// ── Assign Equipment modal ─────────────────────────────────────────────────────
function AssignModal({ onClose, items, warehouses, fin, busy, onAssign }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)
  const [qty, setQty] = useState('1')
  const [area, setArea] = useState('')
  const [position, setPosition] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [price, setPrice] = useState('')
  const [cost, setCost] = useState('')
  const [notes, setNotes] = useState('')

  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    const base = items || []
    const list = t ? base.filter((i) => `${i.item_name || i.name || ''} ${i.item_code || i.code || ''}`.toLowerCase().includes(t)) : base
    return list.slice(0, 40)
  }, [q, items])

  const choose = (i) => {
    setSel(i)
    setArea(i.item_group || i.product_family || '')
    setPrice(i.selling_price != null ? String(i.selling_price) : '')
    setCost(i.landed_cost != null ? String(i.landed_cost) : '')
  }

  const whOpts = [{ value: '', label: '— No warehouse —' }, ...(warehouses || []).map((w) => ({ value: w.name, label: w.name }))]
  const submit = () => {
    const body = { item_id: sel.id, qty: Number(qty) || 1, area: area || null, position: position || null, notes: notes || null }
    if (warehouse) body.warehouse = warehouse
    if (price !== '') body.unit_price = Number(price)
    if (fin && cost !== '') body.unit_cost = Number(cost)
    onAssign(body)
  }
  const valid = sel && Number(qty) > 0

  return (
    <Modal open size="lg" title="Assign Equipment" subtitle="Pick an item from the Item Master — cost & price come from the pricing engine" onClose={onClose}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!valid || busy} onClick={submit}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Assign</button>
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
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-ink">{i.item_name || i.name}</span>
                    {isEos(i) && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700"><Sparkles size={10} /> EOS</span>}
                  </div>
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
              <div className="flex items-center gap-2">
                <span className="font-semibold text-ink">{sel.item_name || sel.name}</span>
                {isEos(sel) && <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700"><Sparkles size={10} /> EOS</span>}
              </div>
              <div className="text-xs text-muted">{sel.item_code || sel.code || '—'}</div>
            </div>
            <button className="text-xs font-semibold text-brand-600" onClick={() => setSel(null)}>Change</button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Quantity" type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
            {warehouses && warehouses.length > 0
              ? <Select label="Warehouse" value={warehouse} onChange={(e) => setWarehouse(e.target.value)} options={whOpts} />
              : <Field label="Warehouse" value={warehouse} onChange={(e) => setWarehouse(e.target.value)} placeholder="Optional" />}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Area" value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Main Kitchen" />
            <Field label="Position" value={position} onChange={(e) => setPosition(e.target.value)} placeholder="e.g. Line A / Wall 2" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Unit Price" hint="blank = priced by the engine" type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} />
            {fin && <Field label="Unit Cost" hint="blank = landed cost" type="number" min="0" step="any" value={cost} onChange={(e) => setCost(e.target.value)} />}
          </div>
          <TextArea label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes for this equipment line" />
        </>
      )}
    </Modal>
  )
}
