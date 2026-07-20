import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trophy, X, Loader2, FileText, Wrench } from 'lucide-react'
import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import { sar } from '../data/mockData.js'
import { api } from '../api.js'
import { useData } from '../store/DataContext.jsx'
import CrmDetailModal from '../components/CrmDetailModal.jsx'

const stages = ['Prospecting', 'Quotation', 'Negotiation', 'Won']
const stageColor = { Prospecting: '#94a3b8', Quotation: '#3b82f6', Negotiation: '#E0A82E', Won: '#0EA99A' }

export default function Opportunities() {
  const { opportunities, salesOrders, openForm, wonOpportunity, lostOpportunity, getOpportunityQuotationPrefill, reload } = useData()
  const [openId, setOpenId] = useState(null)   // the opportunity being viewed / edited
  const navigate = useNavigate()
  const lost = opportunities.filter((o) => o.stage === 'Lost')
  const [busy, setBusy] = useState(null)

  const run = async (id, fn) => { setBusy(id); try { await fn() } catch (e) { alert(e.message) } finally { setBusy(null) } }
  const markWon = (o) => { if (window.confirm(`Mark ${o.customer} as WON?`)) run(o.id, () => wonOpportunity(o.id)) }
  const markLost = (o) => {
    const reason = window.prompt(`Mark ${o.customer} as LOST — reason (required):`)
    if (reason == null) return
    if (!reason.trim()) { alert('A reason is required to mark an opportunity as Lost.'); return }
    run(o.id, () => lostOpportunity(o.id, reason.trim()))
  }
  const createQuote = async (o) => {
    setBusy(o.id)
    try {
      const prefill = await getOpportunityQuotationPrefill(o.id)
      navigate('/sales/quotations', { state: { quotePrefill: prefill } })
    } catch (e) { alert(e.message) } finally { setBusy(null) }
  }
  const sendEngineering = async (o) => {
    if (!window.confirm(`Send "${o.project_name || o.customer}" to Engineering?`)) return
    setBusy(o.id)
    try {
      await api(`/engineering/requests/from-opportunity/${o.id}`, { method: 'POST', body: {} })
      alert('Engineering request submitted')
    } catch (e) { alert(e.message) } finally { setBusy(null) }
  }

  return (
    <>
      <PageHeader title="Opportunities" subtitle="Lead → Opportunity → Quotation — project info flows automatically">
        <button className="btn-primary" onClick={() => openForm('opportunity')}><Plus size={16} /> New Opportunity</button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stages.map((stage) => {
          const items = stage === 'Prospecting'
            ? opportunities.filter((o) => o.stage !== 'Lost' && !['Quotation', 'Negotiation', 'Won'].includes(o.stage))
            : opportunities.filter((o) => o.stage === stage)
          const total = items.reduce((s, o) => s + (o.value || 0), 0)
          return (
            <div key={stage} className="rounded-2xl bg-slate-100/70 p-3 animate-fade-up">
              <div className="mb-3 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: stageColor[stage] }} />
                  <span className="text-sm font-bold text-ink">{stage}</span>
                  <span className="chip bg-white text-slate-500">{items.length}</span>
                </div>
              </div>
              <p className="mb-3 px-1 text-xs font-semibold text-muted">{sar(total)}</p>
              <div className="space-y-3">
                {items.map((o) => (
                  <div
                    key={o.id}
                    onClick={() => setOpenId(o.id)}
                    className="group card card-pad cursor-pointer transition hover:shadow-glow"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-ink">{o.customer}</p>
                      <Badge tone={statusTone(o.stage)}>{o.prob}%</Badge>
                    </div>
                    {o.project_name && <p className="mt-0.5 text-[11px] font-medium text-brand-600">{o.project_name}</p>}
                    {o.opportunity_type && <p className="text-[10px] text-slate-400">{o.opportunity_type}</p>}
                    {o.location && <p className="text-[10px] text-slate-400">{o.location}</p>}
                    <p className="mt-1 text-lg font-extrabold text-ink">{sar(o.value)}</p>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted">
                      <span>Next: {o.close || '—'}</span>
                      <span>{o.owner}</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
                      <div className="h-1.5 rounded-full" style={{ width: `${o.prob}%`, background: stageColor[stage] }} />
                    </div>
                    {stage !== 'Won' && (
                      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2.5">
                        {o.opportunity_type === 'Project Requiring Engineering' ? (
                          <button onClick={(e) => { e.stopPropagation(); sendEngineering(o) }} disabled={busy === o.id}
                            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-violet-50 px-2 py-1.5 text-[11px] font-bold text-violet-700 transition hover:bg-violet-100 disabled:opacity-50">
                            {busy === o.id ? <Loader2 size={12} className="animate-spin" /> : <Wrench size={12} />} Engineering
                          </button>
                        ) : (
                          <button onClick={(e) => { e.stopPropagation(); createQuote(o) }} disabled={busy === o.id}
                            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-brand-50 px-2 py-1.5 text-[11px] font-bold text-brand-700 transition hover:bg-brand-100 disabled:opacity-50">
                            {busy === o.id ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />} Quotation
                          </button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); markWon(o) }} disabled={busy === o.id}
                          className="inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-50 px-2 py-1.5 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50">
                          <Trophy size={12} /> Won
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); markLost(o) }} disabled={busy === o.id}
                          className="inline-flex items-center justify-center gap-1 rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50">
                          <X size={12} /> Lost
                        </button>
                      </div>
                    )}
                    {stage === 'Won' && (() => {
                      const order = salesOrders.find((s) => s.customer === o.customer)
                      if (!order || !order.boqTotal) return <p className="mt-2 text-[11px] font-semibold text-emerald-600">Won — project starting</p>
                      const done = order.boqDone >= order.boqTotal
                      return (
                        <div className="mt-2 rounded-lg bg-emerald-50 p-2">
                          <div className="flex items-center justify-between text-[11px] font-semibold"><span className="text-emerald-700">Installation · {order.projectNo}</span><span className={done ? 'text-emerald-700' : 'text-slate-500'}>{done ? 'Delivered ✓' : `${order.boqDone}/${order.boqTotal}`}</span></div>
                          <div className="mt-1 h-1.5 w-full rounded-full bg-white"><div className="h-1.5 rounded-full bg-emerald-500 transition-all" style={{ width: `${order.progress}%` }} /></div>
                        </div>
                      )
                    })()}
                  </div>
                ))}
                {items.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 py-6 text-center text-xs text-slate-400">No deals</p>}
              </div>
            </div>
          )
        })}
      </div>

      {lost.length > 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Lost ({lost.length})</p>
          <div className="space-y-1.5">
            {lost.map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="font-medium text-slate-600">{o.customer} · {sar(o.value)}</span>
                <span className="text-xs text-rose-500">Reason: {o.lost_reason || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <CrmDetailModal
        kind="opportunity"
        id={openId}
        open={!!openId}
        onClose={() => setOpenId(null)}
        onSaved={() => reload('opportunities')}
      />
    </>
  )
}
