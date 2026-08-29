import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Wallet, TrendingUp, Coins, Activity, ShoppingCart, Plus, FileText,
  Pencil, Send, AlertTriangle, CheckCircle2, ClipboardList, Lock,
} from 'lucide-react'
import { Badge, statusTone } from '../components/ui.jsx'
import { Modal, Field, Select, Row } from '../components/Modal.jsx'
import { sar } from '../data/mockData.js'
import { hasCost, collectionPctOf, procurementPctOf } from '../data/projectData.js'
import { useData } from '../store/DataContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { api } from '../api.js'
import { StockAvailabilityChips } from '../components/StockAvailabilityChips.jsx'

const BOQ_STATUSES = ['Waiting', 'Assigned', 'In Progress', 'Installed']
const MANAGEMENT_ROLES = ['Management', 'System Admin']

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const {
    projects, team, purchaseOrders, addVariation, updateBoqItem, updateProject,
    sendToProcurement, lookupTeam, resList,
  } = useData()
  const { user, canSee } = useAuth()
  const p = projects.find((x) => x.id === id)

  // contract_value is a PROTECTED column server-side: it is silently stripped for anyone who is not
  // Management, so a PM who types into it would see "saved" and nothing would change. Show it read-only.
  const canEditContract = MANAGEMENT_ROLES.includes(user?.role)
  const canSeeProcurement = canSee('procurement')

  const [voModal, setVoModal] = useState(false)
  const [vo, setVo] = useState({ desc: '', amount: '', status: 'Pending' })
  const [voErr, setVoErr] = useState('')
  const [voBusy, setVoBusy] = useState(false)
  const [editModal, setEditModal] = useState(false)
  const [edit, setEdit] = useState({ name: '', contractValue: '', start: '', end: '', status: 'On Track', manager_id: '' })
  const [editErr, setEditErr] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [teamOpts, setTeamOpts] = useState([])          // /lookups/team — assignable Project Managers
  const [prs, setPrs] = useState([])                    // this project's REAL purchase requisitions
  const [procBusy, setProcBusy] = useState(false)
  const [procMsg, setProcMsg] = useState('')
  const [procErr, setProcErr] = useState('')
  const [boqErr, setBoqErr] = useState('')
  const [completeErr, setCompleteErr] = useState('')
  const [availMap, setAvailMap] = useState({})

  // the manager picker's options (readable by every internal role)
  useEffect(() => {
    let alive = true
    lookupTeam().then((rows) => { if (alive) setTeamOpts(rows || []) }).catch(() => { if (alive) setTeamOpts([]) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Material Requests = the real Purchase Requisitions raised from this project (Project → PR → RFQ → PO).
  const loadPrs = useCallback(async () => {
    if (!id || !canSeeProcurement) { setPrs([]); return }
    try {
      const rows = await resList('purchase-requisitions')
      setPrs((rows || []).filter((r) => r.project_id === id))
    } catch { setPrs([]) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, canSeeProcurement])
  useEffect(() => { loadPrs() }, [loadPrs])

  if (!p) return <div className="card card-pad">Project not found. <button className="text-brand-600" onClick={() => navigate('/projects/all')}>Back</button></div>

  // readable project reference — NEVER the raw uuid (that stays for keys/routing only)
  const pref = p.ref || p.number || p.id

  const contract = Number(p.contractValue) || 0
  const budgetCost = Number(p.committedCost) || 0
  const actualCost = Number(p.actualCost) || 0
  const costVisible = hasCost(p)                                 // role is allowed to see cost at all
  // A cost of 0 does NOT mean "100% margin" — it means nothing has been costed yet. Reporting a
  // fabricated margin as fact is a lie, so GP is shown only when a real cost has been booked.
  const costBooked = Number(p.committed_cost) > 0 || Number(p.actual_cost) > 0
  const estGp = contract - budgetCost
  const actGp = contract - actualCost
  const estGpPct = contract > 0 ? Math.round((estGp / contract) * 100) : null
  const actGpPct = contract > 0 ? Math.round((actGp / contract) * 100) : null

  const cards = [
    { label: 'Contract Value', value: sar(contract), icon: Wallet, accent: 'from-brand-500 to-brand-600' },
    { label: 'Budgeted Cost', value: costVisible ? sar(budgetCost) : '—', icon: Coins, accent: 'from-gold-500 to-gold-600' },
    { label: 'Actual Cost', value: costVisible ? sar(actualCost) : '—', icon: Coins, accent: 'from-violet-500 to-indigo-600' },
    { label: 'Progress', value: `${p.progress}%`, icon: Activity, accent: 'from-emerald-500 to-teal-600' },
  ]

  const boq = p.boq || []
  const installed = boq.filter((b) => ['Installed', 'Delivered'].includes(b.status)).length
  const allDone = boq.length > 0 && installed === boq.length
  const pending = boq.filter((b) => b.status === 'Waiting').length

  useEffect(() => {
    const ids = [...new Set(boq.map((b) => b.item_id).filter(Boolean))]
    if (!ids.length) { setAvailMap({}); return }
    let alive = true
    api(`/inventory/availability-bulk?ids=${ids.join(',')}`)
      .then((m) => { if (alive) setAvailMap(m && typeof m === 'object' ? m : {}) })
      .catch(() => { if (alive) setAvailMap({}) })
    return () => { alive = false }
  }, [p?.id, boq.map((b) => b.item_id).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  // the honest root cause of a missing margin: the BOQ was seeded from items that carry no cost.
  // Only claim this to a role that can actually SEE cost — otherwise budget_cost is merely redacted,
  // not zero, and the banner would be a guess.
  const boqNoBudget = costVisible && boq.length > 0 && boq.every((b) => !Number(b.budget_cost))
  const lowMargin = costBooked && estGpPct != null && estGpPct < 20

  // REAL procurement figures for this project (no mock values)
  const projectPOs = (purchaseOrders || []).filter((po) => po.project_id === p.id)
  const poValue = projectPOs.reduce((s, po) => s + (Number(po.amount) || 0), 0)

  const openEdit = () => {
    setEditErr('')
    setEdit({
      name: p.name || '', contractValue: contract, start: p.start || '', end: p.end || '',
      status: p.status || 'On Track', manager_id: p.manager_id || '',
    })
    setEditModal(true)
  }

  const saveEdit = async () => {
    setEditErr(''); setEditBusy(true)
    try {
      const body = {
        name: (edit.name || '').trim() || p.name,
        status: edit.status,
        manager_id: edit.manager_id || null,       // '' → null, never an empty string into a uuid column
        start: edit.start || null,
        end: edit.end || null,
      }
      // only Management can actually persist this — sending it as a PM would be silently stripped
      if (canEditContract && edit.contractValue !== '' && edit.contractValue != null) {
        body.contractValue = Number(edit.contractValue) || 0
      }
      await updateProject(p.id, body)
      setEditModal(false)
    } catch (e) {
      setEditErr(e?.message || 'Could not save the project.')   // surfaced BEFORE the modal closes
    } finally { setEditBusy(false) }
  }

  const saveVo = async () => {
    if (!(vo.desc || '').trim()) { setVoErr('Description is required.'); return }
    setVoErr(''); setVoBusy(true)
    try {
      await addVariation(p.id, { desc: vo.desc.trim(), amount: Number(vo.amount) || 0, status: vo.status })
      setVo({ desc: '', amount: '', status: 'Pending' })
      setVoModal(false)
    } catch (e) {
      setVoErr(e?.message || 'Could not add the variation order.')
    } finally { setVoBusy(false) }
  }

  const commitBoq = async (idx, patch) => {
    setBoqErr('')
    try { await updateBoqItem(p.id, idx, patch) } catch (e) { setBoqErr(e?.message || 'Could not update the item.') }
  }

  // raises a REAL Purchase Requisition from the Waiting BOQ lines (used to only flip statuses)
  const runSendToProcurement = async () => {
    setProcBusy(true); setProcErr(''); setProcMsg('')
    try {
      const r = await sendToProcurement(p.id)
      const n = Number(r?.items) || 0
      setProcMsg(`Raised ${r?.purchase_requisition || 'Purchase Requisition'} · ${n} item${n === 1 ? '' : 's'}`)
      await loadPrs()
    } catch (e) {
      setProcErr(e?.message || 'Could not send to Procurement.')
    } finally { setProcBusy(false) }
  }

  const markCompleted = async () => {
    setCompleteErr('')
    try { await updateProject(p.id, { status: 'Completed', progress: 100 }) }
    catch (e) { setCompleteErr(e?.message || 'Could not mark the project completed.') }
  }

  const managerOptions = [
    { value: '', label: '— Unassigned —' },
    ...teamOpts.map((m) => ({ value: m.id, label: m.label || `${m.name}${m.role ? ` · ${m.role}` : ''}` })),
  ]

  return (
    <div>
      {/* sticky project identity bar */}
      <div className="sticky top-[60px] z-30 mb-5 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-card backdrop-blur sm:flex-row sm:items-center">
        <button onClick={() => navigate('/projects/all')} title="Back to Projects"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-ink">
          <ArrowLeft size={18} />
        </button>
        <div className="flex min-w-0 items-center gap-3">
          <span className="font-display text-xl font-extrabold tracking-tight text-brand-600">{pref}</span>
          <Badge tone={statusTone(p.status)}>{p.status}</Badge>
          <span className="hidden truncate text-sm font-semibold text-ink md:inline">{p.name}</span>
        </div>
        <div className="text-xs text-muted sm:ml-auto">{p.customer} · {p.salesOrder || '—'} · PM {p.manager || 'Unassigned'} · {p.start || '—'} → {p.end || '—'}</div>
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
        <Meter label="Procurement %" pct={procurementPctOf(p)} color="#E0A82E" sub={costVisible ? `${sar(budgetCost)} committed` : 'Cost not visible to your role'} />
      </div>

      {/* budget & profitability — auto-calculated live from the BOQ item costs */}
      <div className="mt-4 card card-pad">
        <div className="mb-3 flex items-center gap-2"><TrendingUp size={18} className="text-brand-600" /><h3 className="font-bold text-ink">Budget &amp; Profitability</h3><span className="ml-auto text-xs text-muted">auto-calculated from item costs</span></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Budgeted Cost" value={costVisible ? sar(budgetCost) : '—'} />
          {costBooked
            ? <Stat label="Est. Gross Profit" value={sar(estGp)} sub={estGpPct == null ? 'No contract value' : `${estGpPct}% margin`} tone={estGpPct != null && estGpPct < 20 ? 'rose' : 'emerald'} />
            : <Stat label="Est. Gross Profit" value="—" sub="No cost booked yet — budget the BOQ lines to see margin." />}
          <Stat label="Actual Cost" value={costVisible ? sar(actualCost) : '—'} />
          {costBooked
            ? <Stat label="Actual Gross Profit" value={sar(actGp)} sub={actGpPct == null ? 'No contract value' : `${actGpPct}% margin`} tone={actGpPct != null && actGpPct < 20 ? 'rose' : 'emerald'} />
            : <Stat label="Actual Gross Profit" value="—" sub="No cost booked yet — margin cannot be calculated." />}
        </div>
      </div>

      {/* the honest reason a margin cannot be shown */}
      {boqNoBudget && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>
            <b>This project&apos;s BOQ has no budgeted cost.</b> The items it was sold from have no cost in the Item Master,
            so margin cannot be calculated. Enter a Budget Cost on the required items below (or add costs to the Item Master) to see the real GP.
          </span>
        </div>
      )}

      {/* profitability alert — only when a real cost has actually been booked */}
      {lowMargin && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle size={18} className="shrink-0" />
          <span><b>Margin alert:</b> Gross Profit is only <b>{estGpPct}%</b> (below 20% target). Review supplier costs or raise a variation order.</span>
        </div>
      )}

      {/* handover signal */}
      {p.status === 'Completed' && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={18} className="shrink-0" />
          <span><b>Project completed &amp; handed over.</b> Finance (ZATCA invoice) and Service (warranty) have been notified.</span>
        </div>
      )}

      {/* Sales → PM handover details (from the accepted quotation) */}
      <div className="mt-6 card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 p-4">
          <ClipboardList size={18} className="text-brand-600" />
          <h2 className="font-display text-lg font-bold text-ink">Sales Handover</h2>
          <span className="ml-auto text-xs text-muted">From the accepted quotation</span>
        </div>
        <div className="grid grid-cols-1 gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-3">
          <Info label="Customer" value={p.customer} />
          <Info label="Contact Person" value={p.contact_person} />
          <Info label="Phone" value={p.customer_phone} href={p.customer_phone ? `tel:${p.customer_phone}` : null} />
          <Info label="Email" value={p.customer_email} href={p.customer_email ? `mailto:${p.customer_email}` : null} />
          <Info label="Site / Location" value={p.location} />
          <Info label="Sales Order" value={p.salesOrder} />
          <Info label="Payment Terms" value={p.payment_terms} />
          <Info label="Required Delivery" value={p.delivery_date} />
          <Info label="Contract Value" value={sar(contract)} />
        </div>
        {p.notes && (
          <div className="border-t border-slate-100 p-4">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Special Requirements / Notes</p>
            <p className="whitespace-pre-wrap text-sm text-slate-600">{p.notes}</p>
          </div>
        )}
      </div>

      {/* Required Items — PM assigns; status flows automatically from each assignee's panel */}
      <div className="mt-6 card overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-ink">Required Items — assign &amp; track</h2>
            <p className="text-xs text-muted">PM assigns each item · status updates automatically as the assignee completes their part</p>
          </div>
          <span className="chip bg-emerald-50 text-emerald-600">{installed}/{boq.length} completed</span>
        </div>
        {boqErr && <p className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700">{boqErr}</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">#</th><th className="th">Required Item</th><th className="th">Qty</th>
              <th className="th">Budget Cost</th><th className="th">Actual Cost</th>
              <th className="th">Assigned To</th><th className="th">Status</th>
            </tr></thead>
            <tbody>
              {boq.map((b, i) => (
                <tr key={b.id || i} className="hover:bg-slate-50/60">
                  <td className="td text-slate-400">{i + 1}</td>
                  <td className="td font-medium text-ink">
                    {b.item}
                    <StockAvailabilityChips
                      compact
                      available={availMap[b.item_id]?.in_stock}
                      reserved={availMap[b.item_id]?.reserved}
                      incoming={availMap[b.item_id]?.in_transit}
                      from_stock={b.from_stock}
                      to_purchase={b.to_purchase}
                    />
                  </td>
                  <td className="td text-slate-600">{b.qty}</td>
                  <td className="td"><CostCell label={`Budget cost of ${b.item}`} value={b.budget_cost} onCommit={(v) => commitBoq(i, { budget_cost: v })} /></td>
                  <td className="td"><CostCell label={`Actual cost of ${b.item}`} value={b.actual_cost} onCommit={(v) => commitBoq(i, { actual_cost: v })} /></td>
                  <td className="td">
                    <select value={b.assignee_id || ''} aria-label={`Assignee for ${b.item}`}
                      onChange={(e) => { const aid = e.target.value; commitBoq(i, { assignee_id: aid || null, status: aid && b.status === 'Waiting' ? 'Assigned' : b.status }) }}
                      className="w-full min-w-[150px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium outline-none focus:border-brand-400 focus:bg-white">
                      <option value="">— Assign —</option>
                      {team.map((m) => <option key={m.id} value={m.id}>{m.name}{m.designation ? ` — ${m.designation}` : ''}</option>)}
                    </select>
                  </td>
                  <td className="td">
                    <select value={b.status || 'Waiting'} aria-label={`Status of ${b.item}`} onChange={(e) => commitBoq(i, { status: e.target.value })}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-brand-400 focus:bg-white">
                      {BOQ_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
              {boq.length === 0 && <tr><td className="td text-slate-400" colSpan={7}>No items linked from the Sales Order.</td></tr>}
            </tbody>
          </table>
        </div>
        {completeErr && <p className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700">{completeErr}</p>}
        {allDone && p.status !== 'Completed' && (
          <div className="flex flex-col gap-2 border-t border-emerald-100 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-emerald-700">✓ All required items installed — project is ready for Handover.</p>
            <button className="btn-primary !py-2" onClick={markCompleted}>Mark Project Completed</button>
          </div>
        )}
      </div>

      {/* variations + procurement */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <h3 className="font-bold text-ink">Variation Orders</h3>
            <button className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => { setVoErr(''); setVoModal(true) }}><Plus size={14} /> Add</button>
          </div>
          <div className="p-2">
            {(p.variations || []).length ? p.variations.map((x) => (
              <div key={x.id} className="flex items-center gap-3 rounded-xl p-3 hover:bg-slate-50">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-violet-50 text-violet-600"><FileText size={16} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{x.desc}</p>
                  {/* variation_orders has no readable number column — show one only if it ever gains
                      one, never the raw uuid the PM cannot use */}
                  {(x.number || x.ref) && <p className="text-xs text-muted">{x.number || x.ref}</p>}
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
            {canSeeProcurement ? (
              <>
                <Row2 k="Material Requests" v={prs.length ? `${prs.length} raised` : 'None raised'} tone={prs.length ? 'blue' : 'gray'} />
                <Row2 k="Purchase Orders"
                  v={projectPOs.length ? `${projectPOs.length} · ${sar(poValue)}` : 'None raised'}
                  tone={projectPOs.length ? 'green' : 'gray'} />
              </>
            ) : (
              <>
                <Row2 k="Material Requests" v="No access" tone="gray" />
                <Row2 k="Purchase Orders" v="No access" tone="gray" />
              </>
            )}
            <Row2 k="Committed Cost" v={costVisible ? sar(budgetCost) : '—'} tone="gray" />
          </div>

          {/* the real requisitions this project raised */}
          {canSeeProcurement && prs.length > 0 && (
            <div className="mt-4 space-y-1.5 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
              {prs.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-brand-600">{r.number}</span>
                  <span className="text-muted">{Number(r.item_count) || (r.items || []).length} item{(Number(r.item_count) || (r.items || []).length) === 1 ? '' : 's'}</span>
                  <span className="ml-auto"><Badge tone={statusTone(r.status)}>{r.status}</Badge></span>
                </div>
              ))}
            </div>
          )}

          {procMsg && (
            <p className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
              <CheckCircle2 size={14} className="shrink-0" /> {procMsg}
            </p>
          )}
          {procErr && (
            <p className="mt-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              <AlertTriangle size={14} className="shrink-0" /> {procErr}
            </p>
          )}

          {pending ? (
            <button className="btn-primary mt-5 w-full disabled:opacity-60" disabled={procBusy} onClick={runSendToProcurement}>
              <Send size={15} /> {procBusy ? 'Raising Purchase Requisition…' : `Send ${pending} Waiting item${pending === 1 ? '' : 's'} to Procurement`}
            </button>
          ) : (
            <button className="btn-ghost mt-5 w-full" onClick={() => navigate('/procurement/requests')}>Open in Procurement</button>
          )}
        </div>
      </div>

      {/* Edit Project (plan / budget) modal */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title={`Edit Project · ${pref}`} subtitle="Update the plan, manager & status"
        footer={<>
          <button className="btn-ghost" onClick={() => setEditModal(false)}>Cancel</button>
          <button className="btn-primary disabled:opacity-60" disabled={editBusy} onClick={saveEdit}>{editBusy ? 'Saving…' : 'Save Changes'}</button>
        </>}>
        {editErr && (
          <p className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
            <AlertTriangle size={14} className="shrink-0" /> {editErr}
          </p>
        )}
        <Field label="Project Name" value={edit.name} onChange={(e) => setEdit((s) => ({ ...s, name: e.target.value }))} />
        <Row>
          <Field
            label="Contract Value / Budget (SAR)" type="number" value={edit.contractValue}
            disabled={!canEditContract} readOnly={!canEditContract}
            hint={canEditContract ? undefined : 'Contract value is set by Management — it cannot be changed here.'}
            onChange={(e) => setEdit((s) => ({ ...s, contractValue: e.target.value }))} />
          <Select label="Status" value={edit.status} onChange={(e) => setEdit((s) => ({ ...s, status: e.target.value }))} options={['On Track', 'At Risk', 'Delayed', 'Completed']} />
        </Row>
        {!canEditContract && (
          <p className="-mt-2 flex items-center gap-1.5 text-[11px] text-muted"><Lock size={12} className="shrink-0" /> Ask Management to change the contract value.</p>
        )}
        <Select label="Project Manager" value={edit.manager_id || ''}
          onChange={(e) => setEdit((s) => ({ ...s, manager_id: e.target.value }))} options={managerOptions} />
        <Row>
          <Field label="Start Date" type="date" value={edit.start || ''} onChange={(e) => setEdit((s) => ({ ...s, start: e.target.value }))} />
          <Field label="End Date" type="date" value={edit.end || ''} onChange={(e) => setEdit((s) => ({ ...s, end: e.target.value }))} />
        </Row>
      </Modal>

      {/* Add Variation modal */}
      <Modal open={voModal} onClose={() => setVoModal(false)} title="Add Variation Order" subtitle={`Extra scope for ${pref}`}
        footer={<>
          <button className="btn-ghost" onClick={() => setVoModal(false)}>Cancel</button>
          <button className="btn-primary disabled:opacity-60" disabled={voBusy} onClick={saveVo}>{voBusy ? 'Adding…' : 'Add Variation'}</button>
        </>}>
        {voErr && (
          <p className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
            <AlertTriangle size={14} className="shrink-0" /> {voErr}
          </p>
        )}
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

function CostCell({ value, onCommit, label }) {
  const [v, setV] = useState(value ?? 0)
  useEffect(() => { setV(value ?? 0) }, [value])
  return (
    <input type="number" value={v} aria-label={label} title={label} onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (Number(v) !== Number(value || 0)) onCommit(Number(v) || 0) }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      className="w-24 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-right text-xs outline-none focus:border-brand-400 focus:bg-white" />
  )
}

function Stat({ label, value, sub, tone }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-extrabold text-ink">{value}</p>
      {sub && <p className={`text-xs font-semibold ${tone === 'rose' ? 'text-rose-600' : tone === 'emerald' ? 'text-emerald-600' : 'text-muted'}`}>{sub}</p>}
    </div>
  )
}

function Info({ label, value, href }) {
  return (
    <div className="bg-white p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      {href && value
        ? <a href={href} className="mt-0.5 block truncate text-sm font-semibold text-brand-600 hover:underline">{value}</a>
        : <p className="mt-0.5 truncate text-sm font-semibold text-ink">{value || '—'}</p>}
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
