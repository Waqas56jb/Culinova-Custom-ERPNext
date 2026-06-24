import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Wallet, TrendingUp, Coins, Activity, ShoppingCart, Plus, FileText,
  Pencil, Send, AlertTriangle, CheckCircle2,
} from 'lucide-react'
import { Badge, statusTone } from '../components/ui.jsx'
import { Modal, Field, Select, Row } from '../components/Modal.jsx'
import { sar } from '../data/mockData.js'
import { gpOf, gpPctOf, collectionPctOf, procurementPctOf } from '../data/projectData.js'
import { useData } from '../store/DataContext.jsx'

const assignees = [
  { value: 'Khalid', label: 'Khalid — Procurement Officer' },
  { value: 'Yusuf', label: 'Yusuf — Storekeeper' },
  { value: 'Hassan', label: 'Hassan — Technician' },
  { value: 'Faisal', label: 'Faisal — Site Engineer' },
  { value: 'Omar', label: 'Omar — Project Manager' },
  { value: 'Bilal', label: 'Bilal — Estimator' },
]

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { projects, addVariation, updateBoqItem, updateProject } = useData()
  const p = projects.find((x) => x.id === id)
  const [voModal, setVoModal] = useState(false)
  const [vo, setVo] = useState({ desc: '', amount: '', status: 'Pending' })
  const [editModal, setEditModal] = useState(false)
  const [edit, setEdit] = useState({ name: '', contractValue: '', start: '', end: '', status: 'On Track' })

  if (!p) return <div className="card card-pad">Project not found. <button className="text-brand-600" onClick={() => navigate('/projects/all')}>Back</button></div>

  const gp = gpOf(p)
  const cards = [
    { label: 'Contract Value', value: sar(p.contractValue), icon: Wallet, accent: 'from-brand-500 to-brand-600' },
    { label: 'Actual Cost', value: sar(p.actualCost), icon: Coins, accent: 'from-gold-500 to-gold-600' },
    { label: `Gross Profit (${gpPctOf(p)}%)`, value: sar(gp), icon: TrendingUp, accent: 'from-emerald-500 to-teal-600' },
    { label: 'Progress', value: `${p.progress}%`, icon: Activity, accent: 'from-violet-500 to-indigo-600' },
  ]
  const saveVo = () => { addVariation(p.id, vo); setVo({ desc: '', amount: '', status: 'Pending' }); setVoModal(false) }

  const boq = p.boq || []
  const installed = boq.filter((b) => b.status === 'Installed').length
  const allDone = boq.length > 0 && installed === boq.length
  const pending = boq.filter((b) => b.status === 'Waiting').length
  const gpPct = gpPctOf(p)
  const lowMargin = gpPct < 20

  const openEdit = () => { setEdit({ name: p.name, contractValue: p.contractValue, start: p.start, end: p.end, status: p.status }); setEditModal(true) }
  const saveEdit = () => { updateProject(p.id, { ...edit, contractValue: Number(edit.contractValue) || p.contractValue }); setEditModal(false) }
  const sendToProcurement = () => { boq.forEach((b, i) => { if (b.status === 'Waiting') updateBoqItem(p.id, i, { status: 'In Progress', assignee: b.assignee || 'Khalid' }) }) }

  return (
    <div>
      {/* sticky project identity bar */}
      <div className="sticky top-[60px] z-30 mb-5 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-card backdrop-blur sm:flex-row sm:items-center">
        <button onClick={() => navigate('/projects/all')} title="Back to Projects"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-ink">
          <ArrowLeft size={18} />
        </button>
        <div className="flex min-w-0 items-center gap-3">
          <span className="font-display text-xl font-extrabold tracking-tight text-brand-600">{p.id}</span>
          <Badge tone={statusTone(p.status)}>{p.status}</Badge>
          <span className="hidden truncate text-sm font-semibold text-ink md:inline">{p.name}</span>
        </div>
        <div className="text-xs text-muted sm:ml-auto">{p.customer} · {p.salesOrder} · PM {p.manager} · {p.start} → {p.end}</div>
        <button onClick={openEdit} className="btn-ghost !px-3 !py-2 text-xs"><Pencil size={14} /> Edit Plan</button>
      </div>

      {/* summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card card-pad">
            <div className={`grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br ${c.accent} text-white shadow-soft`}><c.icon size={20} /></div>
            <p className="mt-3 text-2xl font-extrabold text-ink">{c.value}</p>
            <p className="text-sm text-muted">{c.label}</p>
          </div>
        ))}
      </div>

      {/* meters */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Meter label="Overall Progress" pct={p.progress} color="#0EA99A" />
        <Meter label="Collection %" pct={collectionPctOf(p)} color="#3b82f6" sub={`${sar(p.collected)} of ${sar(p.billed)}`} />
        <Meter label="Procurement %" pct={procurementPctOf(p)} color="#E0A82E" sub={`${sar(p.committedCost)} committed`} />
      </div>

      {/* profitability alert */}
      {lowMargin && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle size={18} className="shrink-0" />
          <span><b>Margin alert:</b> Gross Profit is only <b>{gpPct}%</b> (below 20% target). Review supplier costs or raise a variation order.</span>
        </div>
      )}

      {/* handover signal */}
      {p.status === 'Completed' && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={18} className="shrink-0" />
          <span><b>Project completed &amp; handed over.</b> Finance (ZATCA invoice) and Service (warranty) have been notified.</span>
        </div>
      )}

      {/* Required Items — PM assigns; status flows automatically from each assignee's panel */}
      <div className="mt-6 card overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-ink">Required Items — assign &amp; track</h2>
            <p className="text-xs text-muted">PM assigns each item · status updates automatically as the assignee completes their part</p>
          </div>
          <span className="chip bg-emerald-50 text-emerald-600">{installed}/{boq.length} completed</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">#</th><th className="th">Required Item</th><th className="th">Qty</th>
              <th className="th">Assigned To (role)</th><th className="th">Status (live)</th>
            </tr></thead>
            <tbody>
              {boq.map((b, i) => (
                <tr key={i} className="hover:bg-slate-50/60">
                  <td className="td text-slate-400">{i + 1}</td>
                  <td className="td font-medium text-ink">{b.item}</td>
                  <td className="td text-slate-600">{b.qty}</td>
                  <td className="td">
                    <select value={b.assignee || ''}
                      onChange={(e) => { const name = e.target.value; updateBoqItem(p.id, i, { assignee: name, status: name && b.status === 'Waiting' ? 'Assigned' : b.status }) }}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium outline-none focus:border-brand-400 focus:bg-white">
                      <option value="">— Assign —</option>
                      {assignees.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                  </td>
                  <td className="td"><Badge tone={statusTone(b.status)}>{b.status}</Badge></td>
                </tr>
              ))}
              {boq.length === 0 && <tr><td className="td text-slate-400" colSpan={5}>No items linked from the Sales Order.</td></tr>}
            </tbody>
          </table>
        </div>
        {allDone && p.status !== 'Completed' && (
          <div className="flex flex-col gap-2 border-t border-emerald-100 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-emerald-700">✓ All required items installed — project is ready for Handover.</p>
            <button className="btn-primary !py-2" onClick={() => updateProject(p.id, { status: 'Completed', progress: 100 })}>Mark Project Completed</button>
          </div>
        )}
      </div>

      {/* variations + procurement */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <h3 className="font-bold text-ink">Variation Orders</h3>
            <button className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => setVoModal(true)}><Plus size={14} /> Add</button>
          </div>
          <div className="p-2">
            {p.variations.length ? p.variations.map((x) => (
              <div key={x.id} className="flex items-center gap-3 rounded-xl p-3 hover:bg-slate-50">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-violet-50 text-violet-600"><FileText size={16} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{x.desc}</p>
                  <p className="text-xs text-muted">{x.id}</p>
                </div>
                <span className="text-sm font-semibold text-ink">{sar(x.amount)}</span>
                <Badge tone={statusTone(x.status)}>{x.status}</Badge>
              </div>
            )) : <p className="p-6 text-center text-sm text-slate-400">No variation orders yet</p>}
          </div>
        </div>

        <div className="card card-pad">
          <div className="flex items-center gap-2"><ShoppingCart size={18} className="text-brand-600" /><h3 className="font-bold text-ink">Procurement Status</h3></div>
          <div className="mt-4 space-y-3 text-sm">
            <Row2 k="Pending Procurement" v={`${pending} item${pending === 1 ? '' : 's'}`} tone={pending ? 'amber' : 'green'} />
            <Row2 k="Material Requests" v="Raised" tone="blue" />
            <Row2 k="Purchase Orders" v="2 Issued" tone="green" />
            <Row2 k="Committed Cost" v={sar(p.committedCost)} tone="gray" />
          </div>
          {pending ? (
            <button className="btn-primary mt-5 w-full" onClick={sendToProcurement}>
              <Send size={15} /> Send {pending} Waiting item{pending === 1 ? '' : 's'} to Procurement
            </button>
          ) : (
            <button className="btn-ghost mt-5 w-full" onClick={() => navigate('/procurement/requests')}>Open in Procurement</button>
          )}
        </div>
      </div>

      {/* Edit Project (plan / budget) modal */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title={`Edit Project · ${p.id}`} subtitle="Update the plan, budget & status"
        footer={<><button className="btn-ghost" onClick={() => setEditModal(false)}>Cancel</button><button className="btn-primary" onClick={saveEdit}>Save Changes</button></>}>
        <Field label="Project Name" value={edit.name} onChange={(e) => setEdit((s) => ({ ...s, name: e.target.value }))} />
        <Row>
          <Field label="Contract Value / Budget (SAR)" type="number" value={edit.contractValue} onChange={(e) => setEdit((s) => ({ ...s, contractValue: e.target.value }))} />
          <Select label="Status" value={edit.status} onChange={(e) => setEdit((s) => ({ ...s, status: e.target.value }))} options={['On Track', 'At Risk', 'Delayed', 'Completed']} />
        </Row>
        <Row>
          <Field label="Start Date" type="date" value={edit.start} onChange={(e) => setEdit((s) => ({ ...s, start: e.target.value }))} />
          <Field label="End Date" type="date" value={edit.end} onChange={(e) => setEdit((s) => ({ ...s, end: e.target.value }))} />
        </Row>
      </Modal>

      {/* Add Variation modal */}
      <Modal open={voModal} onClose={() => setVoModal(false)} title="Add Variation Order" subtitle={`Extra scope for ${p.id}`}
        footer={<><button className="btn-ghost" onClick={() => setVoModal(false)}>Cancel</button><button className="btn-primary" onClick={saveVo}>Add Variation</button></>}>
        <Field label="Description" value={vo.desc} onChange={(e) => setVo((s) => ({ ...s, desc: e.target.value }))} placeholder="e.g. Additional walk-in chiller" />
        <Row>
          <Field label="Amount (SAR)" type="number" value={vo.amount} onChange={(e) => setVo((s) => ({ ...s, amount: e.target.value }))} placeholder="85000" />
          <Select label="Status" value={vo.status} onChange={(e) => setVo((s) => ({ ...s, status: e.target.value }))} options={['Pending', 'Approved']} />
        </Row>
      </Modal>
    </div>
  )
}

function Meter({ label, pct, color, sub }) {
  return (
    <div className="card card-pad">
      <div className="flex items-center justify-between"><p className="text-sm font-medium text-slate-600">{label}</p><span className="text-lg font-extrabold text-ink">{pct}%</span></div>
      <div className="mt-2 h-2.5 w-full rounded-full bg-slate-100"><div className="h-2.5 rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: color }} /></div>
      {sub && <p className="mt-1.5 text-xs text-muted">{sub}</p>}
    </div>
  )
}

function Row2({ k, v, tone }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{k}</span>
      <Badge tone={tone}>{v}</Badge>
    </div>
  )
}
