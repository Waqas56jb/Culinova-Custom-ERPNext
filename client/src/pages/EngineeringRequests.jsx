import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Plus, Loader2, Send, FileText, RefreshCw, Info } from 'lucide-react'
import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import { Modal, Field, TextArea, Row } from '../components/Modal.jsx'
import { api } from '../api.js'
import { useData } from '../store/DataContext.jsx'

const STATUSES = ['Pending Engineering Review', 'Under Design', 'Awaiting Information', 'Equipment Selection Completed', 'Ready for Quotation']
const ENG_TYPE = 'Project Requiring Engineering'

export default function EngineeringRequests() {
  const { opportunities, reload, openForm } = useData()
  const navigate = useNavigate()
  const location = useLocation()
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(null)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({ opportunity_id: '', boq_text: '', sales_notes: '', required_date: '' })

  const load = () => api('/engineering/requests').then(setRows).catch(() => setRows([]))
  useEffect(() => { load() }, [])

  const openCreate = async (opportunityId = '') => {
    setForm({ opportunity_id: opportunityId, boq_text: '', sales_notes: '', required_date: '' })
    setModal(true)
    try { await reload('opportunities') } catch { /* list may still be cached */ }
  }

  // Arriving from an Opportunity ("Send to Engineering") pre-selects that opportunity, so the sales
  // person only adds the requirements and attachments — they never re-pick what they came from.
  useEffect(() => {
    const oppId = location.state?.opportunityId
    if (oppId) {
      openCreate(oppId)
      navigate(location.pathname, { replace: true, state: {} }) // consume it so a refresh doesn't re-open
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  // Client rule: only "Project Requiring Engineering" opps go to EOS — Retail Sale skips engineering
  const engOpps = useMemo(() => {
    const openEngOppIds = new Set(
      rows.filter((r) => r.opportunity_id && r.status !== 'Ready for Quotation').map((r) => r.opportunity_id),
    )
    return opportunities.filter(
      (o) => o.opportunity_type === ENG_TYPE
        && !['Won', 'Lost'].includes(o.stage)
        && !openEngOppIds.has(o.id),
    )
  }, [opportunities, rows])

  const retailOpen = opportunities.filter(
    (o) => o.opportunity_type !== ENG_TYPE && !['Won', 'Lost'].includes(o.stage),
  ).length

  const submit = async () => {
    if (!form.opportunity_id) { alert('Select an opportunity'); return }
    setBusy('create')
    try {
      await api(`/engineering/requests/from-opportunity/${form.opportunity_id}`, {
        method: 'POST',
        body: { boq_text: form.boq_text, sales_notes: form.sales_notes, required_date: form.required_date || null },
      })
      setModal(null)
      await load()
    } catch (e) { alert(e.message) } finally { setBusy(null) }
  }

  const refresh = async (id) => {
    setBusy(id)
    try { await api(`/engineering/requests/${id}`); await load() } catch (e) { alert(e.message) } finally { setBusy(null) }
  }

  const createQuote = async (er) => {
    setBusy(er.id)
    try {
      const prefill = await api(`/engineering/requests/${er.id}/quotation-prefill`)
      navigate('/sales/quotations', { state: { quotePrefill: prefill } })
    } catch (e) { alert(e.message) } finally { setBusy(null) }
  }

  return (
    <>
      <PageHeader title="Engineering Requests" subtitle="Sales → EOS handoff for project-based equipment selection">
        <button className="btn-primary" onClick={openCreate}>
          <Plus size={16} /> New Request
        </button>
      </PageHeader>

      <div className="card overflow-hidden">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="bg-slate-50/60">
              <th className="th">Ref</th><th className="th">Customer</th><th className="th">Project</th>
              <th className="th">Location</th><th className="th">Required</th><th className="th">Status</th><th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/60">
                <td className="td font-semibold text-brand-600">{r.number}</td>
                <td className="td">{r.customer}</td>
                <td className="td">{r.project_name || '—'}</td>
                <td className="td text-slate-500">{r.project_location || '—'}</td>
                <td className="td text-slate-500">{r.required_date || '—'}</td>
                <td className="td"><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
                <td className="td">
                  <div className="flex gap-1.5">
                    <button onClick={() => refresh(r.id)} disabled={busy === r.id} className="text-xs font-semibold text-slate-500 hover:text-brand-600">
                      {busy === r.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    </button>
                    {r.status === 'Ready for Quotation' && (
                      <button onClick={() => createQuote(r)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600">
                        <FileText size={13} /> Quotation
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="td text-center text-slate-400">No engineering requests yet</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title="Send Engineering Request" subtitle="Hand off to EOS for equipment selection & BOQ"
        footer={<><button className="btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn-primary" onClick={submit} disabled={busy === 'create'}>{busy === 'create' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Submit to Engineering</button></>}>
        <Row>
          <label className="block flex-1">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Opportunity *</span>
            <select value={form.opportunity_id} onChange={(e) => setForm((s) => ({ ...s, opportunity_id: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
              <option value="">— select —</option>
              {engOpps.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.ref || o.number} · {o.customer}{o.project_name ? ` · ${o.project_name}` : ''} · {o.stage}
                </option>
              ))}
            </select>
            {engOpps.length === 0 && (
              <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-[11px] leading-relaxed text-amber-900">
                <p className="flex items-start gap-1.5 font-semibold"><Info size={14} className="mt-0.5 shrink-0" /> No engineering opportunities available</p>
                <p className="mt-1.5 text-amber-800">
                  Client workflow: create an Opportunity with type <b>Project Requiring Engineering</b> (not Retail Sale).
                  Sales fills BOQ / drawings here → EOS engineering team selects equipment → returns approved BOQ → you create Quotation.
                </p>
                <p className="mt-1.5 text-amber-700">
                  {retailOpen > 0
                    ? `You have ${retailOpen} open Retail Sale opportunit${retailOpen === 1 ? 'y' : 'ies'} — those go straight to Quotation, not Engineering.`
                    : 'Convert a Lead or add a new Opportunity first, then pick the engineering type.'}
                </p>
                <button type="button" onClick={() => { setModal(null); openForm('opportunity') }} className="mt-2 font-bold text-brand-600 hover:underline">
                  + New Opportunity (Project Requiring Engineering)
                </button>
              </div>
            )}
          </label>
          <Field label="Required Date" type="date" value={form.required_date} onChange={(e) => setForm((s) => ({ ...s, required_date: e.target.value }))} />
        </Row>
        <TextArea label="Engineering Requirements" value={form.boq_text} onChange={(e) => setForm((s) => ({ ...s, boq_text: e.target.value }))} rows={4} placeholder="Equipment list, quantities, areas…" />
        <TextArea label="Sales Instructions to Engineering" value={form.sales_notes} onChange={(e) => setForm((s) => ({ ...s, sales_notes: e.target.value }))} rows={3} placeholder="Client preferences, drawings received, site visit notes…" />
      </Modal>
    </>
  )
}
