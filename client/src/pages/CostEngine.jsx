import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import {
  Calculator, Plus, ArrowLeft, DownloadCloud, Trash2, TrendingUp, TrendingDown,
  Wallet, Layers, PieChart as PieIcon,
} from 'lucide-react'
import { PageHeader, KpiCard, ChartCard, Badge, statusTone } from '../components/ui.jsx'
import { Modal, Field, Select, Row } from '../components/Modal.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

// The five cost buckets are a fixed domain defined in server/src/core/costing.js — mirror them here.
const CATEGORY_KEYS = ['Material', 'Manufacturing', 'Purchase', 'Labor', 'Installation']
const CAT_COLOR = {
  Material: '#0EA99A', Manufacturing: '#6366f1', Purchase: '#E0A82E',
  Labor: '#3b82f6', Installation: '#8b5cf6', Overhead: '#94a3b8',
}
const STATUSES = ['Draft', 'In Review', 'Approved', 'Completed']
const n = (v) => Number(v) || 0

export default function CostEngine() {
  const d = useData()
  const { user, canSee } = useAuth()
  const lvl = user?.access_level
  const canEdit = canSee('projects') && ['Create', 'Edit', 'Approval', 'Full Admin'].includes(lvl)
  const canDelete = canSee('projects') && lvl === 'Full Admin'

  const [sheets, setSheets] = useState([])
  const [portfolio, setPortfolio] = useState({ rows: [], totals: {} })
  const [detail, setDetail] = useState(null)      // full selected sheet (header + lines + breakdown)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [newOpen, setNewOpen] = useState(false)

  const loadList = async () => {
    try {
      const [list, prof] = await Promise.all([
        d.resList('cost-sheets'),
        d.resGet('cost-sheets', 'profitability').catch(() => ({ rows: [], totals: {} })),
      ])
      setSheets(list || [])
      setPortfolio(prof || { rows: [], totals: {} })
    } catch (e) { setErr(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { loadList() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const openSheet = async (id) => {
    setErr('')
    try { setDetail(await d.resGet('cost-sheets', id)) } catch (e) { setErr(e.message) }
  }

  // any mutation returns the full re-rolled sheet — keep detail + list fresh
  const applyResult = (full) => { if (full) { setDetail(full); loadList() } }

  if (loading) return <div className="grid min-h-[40vh] place-items-center text-sm text-muted">Loading cost sheets…</div>

  if (detail) {
    return (
      <SheetDetail
        d={d} detail={detail} setDetail={setDetail} canEdit={canEdit} canDelete={canDelete}
        onBack={() => { setDetail(null); loadList() }} applyResult={applyResult} setErr={setErr} err={err}
      />
    )
  }

  const t = portfolio.totals || {}
  return (
    <>
      <PageHeader title="Cost Engine" subtitle="Cost sheets · project overhead allocation · profitability analysis">
        {canEdit && <button className="btn-primary" onClick={() => setNewOpen(true)}><Plus size={16} /> New Cost Sheet</button>}
      </PageHeader>

      {err && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700">{err}</div>}

      {/* portfolio KPIs — real totals from /cost-sheets/profitability */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Cost Sheets" value={t.count ?? sheets.length} sub="in portfolio" icon={Layers} accent="brand" />
        <KpiCard label="Total Revenue" value={sar(t.revenue)} sub="expected across sheets" icon={Wallet} accent="violet" />
        <KpiCard label="Total Cost" value={sar(t.total_cost)} sub="material→installation + overhead" icon={Calculator} accent="gold" />
        <KpiCard label="Portfolio GP" value={`${n(t.gp_percent)}%`} sub={sar(t.gross_profit)} icon={TrendingUp} accent="emerald" />
      </div>

      <div className="card mt-5 overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-[15px] font-bold text-ink">Cost Sheets</h3>
          <p className="text-xs text-muted">Profitability model per project or quotation</p>
        </div>
        {sheets.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-muted">
            <Calculator className="mx-auto mb-2 text-slate-300" />
            No cost sheets yet.{canEdit ? <> Click <b>New Cost Sheet</b> to build the first profitability model.</> : ' Ask a project manager to create one.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-muted">
                  <th className="th">Number</th><th className="th">Name</th><th className="th">Status</th>
                  <th className="th text-right">Total Cost</th><th className="th text-right">Revenue</th>
                  <th className="th text-right">GP %</th><th className="th text-right">NP %</th>
                </tr>
              </thead>
              <tbody>
                {sheets.map((s) => (
                  <tr key={s.id} className="cursor-pointer border-b border-slate-50 hover:bg-slate-50/70" onClick={() => openSheet(s.id)}>
                    <td className="td font-semibold text-brand-600">{s.number}</td>
                    <td className="td text-ink">{s.name}</td>
                    <td className="td"><Badge tone={statusTone(s.status)}>{s.status || 'Draft'}</Badge></td>
                    <td className="td text-right font-medium text-ink">{sar(s.total_cost)}</td>
                    <td className="td text-right text-slate-500">{sar(s.revenue)}</td>
                    <td className={`td text-right font-semibold ${n(s.gp_percent) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{n(s.gp_percent)}%</td>
                    <td className={`td text-right font-semibold ${n(s.np_percent) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{n(s.np_percent)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {newOpen && <NewSheetModal d={d} onClose={() => setNewOpen(false)} onCreated={(full) => { setNewOpen(false); loadList(); if (full?.id) openSheet(full.id) }} setErr={setErr} />}
    </>
  )
}

// ── CREATE MODAL ──────────────────────────────────────────────────────────────
function NewSheetModal({ d, onClose, onCreated, setErr }) {
  const [f, setF] = useState({ name: '', project_id: '', quotation_id: '', overhead_pct: '', revenue: '' })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true); setErr('')
    try {
      const body = {
        name: f.name || undefined,
        project_id: f.project_id || null,
        quotation_id: f.quotation_id || null,
        overhead_pct: f.overhead_pct === '' ? 0 : Number(f.overhead_pct),
        revenue: f.revenue === '' ? 0 : Number(f.revenue),
      }
      const full = await d.resAdd('cost-sheets', body)
      onCreated(full)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const projOpts = [{ value: '', label: '— none —' }, ...(d.projects || []).map((p) => ({ value: p.id, label: p.name || p.ref || p.number }))]
  const quoteOpts = [{ value: '', label: '— none —' }, ...(d.quotations || []).map((q) => ({ value: q.id, label: `${q.ref || q.number} · ${q.customer || ''}` }))]
  return (
    <Modal open onClose={onClose} title="New Cost Sheet" subtitle="Link a project and/or quotation — a document number is assigned automatically"
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Creating…' : 'Create Cost Sheet'}</button></>}>
      <Field label="Name (optional — derived from the project if blank)" value={f.name} onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))} placeholder="e.g. Central Kitchen — Fit-out" />
      <Row>
        <Select label="Project" value={f.project_id} onChange={(e) => setF((s) => ({ ...s, project_id: e.target.value }))} options={projOpts} />
        <Select label="Quotation" value={f.quotation_id} onChange={(e) => setF((s) => ({ ...s, quotation_id: e.target.value }))} options={quoteOpts} />
      </Row>
      <Row>
        <Field label="Overhead %" type="number" value={f.overhead_pct} onChange={(e) => setF((s) => ({ ...s, overhead_pct: e.target.value }))} placeholder="e.g. 10" />
        <Field label="Expected Revenue (SAR)" type="number" value={f.revenue} onChange={(e) => setF((s) => ({ ...s, revenue: e.target.value }))} placeholder="e.g. 250000" />
      </Row>
    </Modal>
  )
}

// ── DETAIL VIEW ───────────────────────────────────────────────────────────────
function SheetDetail({ d, detail, setDetail, canEdit, canDelete, onBack, applyResult, setErr, err }) {
  const [overhead, setOverhead] = useState(String(detail.overhead_pct ?? 0))
  const [revenue, setRevenue] = useState(String(detail.revenue ?? 0))
  const [status, setStatus] = useState(detail.status || 'Draft')
  const [line, setLine] = useState({ category: 'Material', description: '', item_id: '', qty: '1', rate: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => { setOverhead(String(detail.overhead_pct ?? 0)); setRevenue(String(detail.revenue ?? 0)); setStatus(detail.status || 'Draft') }, [detail.id]) // eslint-disable-line

  const saveHeader = async (patch) => {
    try { applyResult(await d.resUpdate('cost-sheets', detail.id, patch)) } catch (e) { setErr(e.message) }
  }
  const addLine = async () => {
    if (!line.category) return
    setBusy(true); setErr('')
    try {
      const body = { category: line.category, description: line.description || null, item_id: line.item_id || null, qty: line.qty === '' ? 1 : Number(line.qty), rate: line.rate === '' ? 0 : Number(line.rate) }
      applyResult(await d.resAdd(`cost-sheets/${detail.id}/lines`, body))
      setLine({ category: line.category, description: '', item_id: '', qty: '1', rate: '' })
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const delLine = async (lineId) => {
    try { applyResult(await d.resDelete(`cost-sheets/${detail.id}/lines`, lineId)) } catch (e) { setErr(e.message) }
  }
  const pull = async () => {
    setBusy(true); setErr('')
    try {
      const r = await d.resAdd(`cost-sheets/${detail.id}/pull-from-project`, {})
      if (r?.sheet) { setDetail(r.sheet) }
      if (r && r.added === 0) setErr(r.skipped ? `Nothing new to pull — ${r.skipped} line(s) already present.` : 'This project has no equipment or purchase orders to pull.')
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const removeSheet = async () => {
    if (!confirm('Delete this cost sheet and all its lines?')) return
    try { await d.resDelete('cost-sheets', detail.id); onBack() } catch (e) { setErr(e.message) }
  }

  const lines = detail.lines || []
  const grouped = useMemo(() => {
    const g = {}
    for (const k of CATEGORY_KEYS) g[k] = []
    for (const l of lines) (g[l.category] = g[l.category] || []).push(l)
    return g
  }, [lines])

  // breakdown from the server (each bucket + overhead with its share); drop zero rows for the chart
  const pieData = (detail.breakdown || []).filter((b) => n(b.amount) > 0)
  const barData = (detail.breakdown || []).map((b) => ({ name: b.category, amount: n(b.amount) }))
  const hasCost = n(detail.total_cost) > 0
  const gpPos = n(detail.gross_profit) >= 0
  const npPos = n(detail.net_profit) >= 0
  const linkedProject = (d.projects || []).find((p) => p.id === detail.project_id)

  return (
    <>
      <PageHeader title={detail.name || detail.number} subtitle={`${detail.number}${linkedProject ? ` · ${linkedProject.name}` : ''}`}>
        <button className="btn-ghost" onClick={onBack}><ArrowLeft size={16} /> All Sheets</button>
        {canEdit && detail.project_id && <button className="btn-ghost" disabled={busy} onClick={pull}><DownloadCloud size={16} /> Pull from Project</button>}
        {canDelete && <button className="btn-ghost text-rose-600" onClick={removeSheet}><Trash2 size={16} /> Delete</button>}
      </PageHeader>

      {err && <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">{err}</div>}

      {/* profit KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Cost" value={sar(detail.total_cost)} sub={`incl. overhead ${sar(detail.overhead_cost)}`} icon={Calculator} accent="gold" />
        <KpiCard label="Revenue" value={sar(detail.revenue)} sub="expected" icon={Wallet} accent="violet" />
        <KpiCard label="Gross Profit" value={sar(detail.gross_profit)} sub={`${n(detail.gp_percent)}% of revenue`} icon={gpPos ? TrendingUp : TrendingDown} accent={gpPos ? 'emerald' : 'gold'} />
        <KpiCard label="Net Profit" value={sar(detail.net_profit)} sub={`${n(detail.np_percent)}% after overhead`} icon={npPos ? TrendingUp : TrendingDown} accent={npPos ? 'emerald' : 'gold'} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* header controls */}
        <ChartCard title="Sheet Settings" subtitle="Overhead allocation drives net profit">
          <div className="space-y-4">
            <Field label="Overhead % (of direct cost)" type="number" value={overhead} disabled={!canEdit}
              onChange={(e) => setOverhead(e.target.value)}
              onBlur={() => canEdit && String(n(overhead)) !== String(n(detail.overhead_pct)) && saveHeader({ overhead_pct: overhead === '' ? 0 : Number(overhead) })} />
            <Field label="Expected Revenue (SAR)" type="number" value={revenue} disabled={!canEdit}
              onChange={(e) => setRevenue(e.target.value)}
              onBlur={() => canEdit && String(n(revenue)) !== String(n(detail.revenue)) && saveHeader({ revenue: revenue === '' ? 0 : Number(revenue) })} />
            <Select label="Status" value={status} disabled={!canEdit} options={STATUSES}
              onChange={(e) => { setStatus(e.target.value); if (canEdit) saveHeader({ status: e.target.value }) }} />
          </div>
        </ChartCard>

        {/* breakdown pie */}
        <ChartCard title="Cost Breakdown" subtitle="Share of total cost">
          {hasCost ? (
            <>
              <ResponsiveContainer width="100%" height={210}>
                <PieChart>
                  <Pie data={pieData} dataKey="amount" nameKey="category" innerRadius={54} outerRadius={84} paddingAngle={3} stroke="none" isAnimationActive={false}>
                    {pieData.map((b) => <Cell key={b.category} fill={CAT_COLOR[b.category] || '#94a3b8'} />)}
                  </Pie>
                  <Tooltip formatter={(v, nm) => [sar(v), nm]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-1 space-y-1.5">
                {pieData.map((b) => (
                  <div key={b.category} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: CAT_COLOR[b.category] || '#94a3b8' }} />
                    <span className="text-slate-500">{b.category}</span>
                    <span className="ml-auto font-semibold text-ink">{sar(b.amount)}</span>
                    <span className="w-10 text-right text-muted">{n(b.pct)}%</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="grid h-[210px] place-items-center text-center text-xs text-muted">
              <div><PieIcon className="mx-auto mb-2 text-slate-300" /> No cost lines yet.<br />Add lines below{detail.project_id ? ' or Pull from Project' : ''}.</div>
            </div>
          )}
        </ChartCard>

        {/* buckets bar */}
        <ChartCard title="Cost by Bucket" subtitle="SAR per category">
          {hasCost ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={barData} margin={{ left: -14, right: 6, top: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} interval={0} angle={-18} textAnchor="end" height={46} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(v) => sar(v)} />
                <Bar dataKey="amount" name="Cost" radius={[6, 6, 0, 0]} barSize={26} isAnimationActive={false}>
                  {barData.map((b) => <Cell key={b.name} fill={CAT_COLOR[b.name] || '#94a3b8'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="grid h-[250px] place-items-center text-xs text-muted">Add cost lines to see the bucket chart.</div>
          )}
        </ChartCard>
      </div>

      {/* editable line table grouped by category */}
      <div className="card mt-4 overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-[15px] font-bold text-ink">Cost Lines</h3>
          <p className="text-xs text-muted">Grouped by bucket · amount = qty × rate</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-muted">
                <th className="th">Description</th><th className="th text-right">Qty</th>
                <th className="th text-right">Rate</th><th className="th text-right">Amount</th>
                {canEdit && <th className="th"></th>}
              </tr>
            </thead>
            <tbody>
              {CATEGORY_KEYS.map((cat) => {
                const rows = grouped[cat] || []
                if (!rows.length) return null
                const subtotal = rows.reduce((s, l) => s + n(l.amount), 0)
                return (
                  <Fragment key={cat}>
                    <tr className="bg-slate-50/60">
                      <td className="td font-semibold text-ink" colSpan={3}>
                        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: CAT_COLOR[cat] }} />{cat}
                      </td>
                      <td className="td text-right font-semibold text-ink">{sar(subtotal)}</td>
                      {canEdit && <td className="td"></td>}
                    </tr>
                    {rows.map((l) => (
                      <tr key={l.id} className="border-b border-slate-50">
                        <td className="td pl-8 text-slate-600">{l.description || <span className="text-muted">—</span>}</td>
                        <td className="td text-right text-slate-500">{n(l.qty)}</td>
                        <td className="td text-right text-slate-500">{sar(l.rate)}</td>
                        <td className="td text-right font-medium text-ink">{sar(l.amount)}</td>
                        {canEdit && (
                          <td className="td text-right">
                            <button className="text-slate-300 hover:text-rose-500" onClick={() => delLine(l.id)} title="Remove line"><Trash2 size={15} /></button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
              {lines.length === 0 && (
                <tr><td className="td py-8 text-center text-sm text-muted" colSpan={canEdit ? 5 : 4}>No cost lines yet. {canEdit ? 'Add one below' : 'Read-only'}{detail.project_id && canEdit ? ' or use Pull from Project.' : '.'}</td></tr>
              )}
            </tbody>
            {lines.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50/60">
                  <td className="td font-bold text-ink" colSpan={3}>Direct Cost + Overhead ({n(detail.overhead_pct)}% = {sar(detail.overhead_cost)})</td>
                  <td className="td text-right font-extrabold text-brand-600">{sar(detail.total_cost)}</td>
                  {canEdit && <td className="td"></td>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* add-line row */}
        {canEdit && (
          <div className="grid grid-cols-1 gap-3 border-t border-slate-100 bg-slate-50/40 p-4 sm:grid-cols-6">
            <Select label="Bucket" value={line.category} options={CATEGORY_KEYS} onChange={(e) => setLine((s) => ({ ...s, category: e.target.value }))} />
            <div className="sm:col-span-2">
              <Field label="Description" value={line.description} onChange={(e) => setLine((s) => ({ ...s, description: e.target.value }))} placeholder="e.g. Stainless steel sheet" />
            </div>
            <Field label="Qty" type="number" value={line.qty} onChange={(e) => setLine((s) => ({ ...s, qty: e.target.value }))} />
            <Field label="Rate (SAR)" type="number" value={line.rate} onChange={(e) => setLine((s) => ({ ...s, rate: e.target.value }))} />
            <div className="flex items-end">
              <button className="btn-primary w-full" disabled={busy} onClick={addLine}><Plus size={16} /> Add</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
