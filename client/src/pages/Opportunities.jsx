import { useState } from 'react'
import { Plus, Trophy, XCircle, Loader2 } from 'lucide-react'
import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'

const stages = ['Prospecting', 'Quotation', 'Negotiation', 'Won']
const stageColor = { Prospecting: '#94a3b8', Quotation: '#3b82f6', Negotiation: '#E0A82E', Won: '#0EA99A' }

export default function Opportunities() {
  const { opportunities, openForm, wonOpportunity, lostOpportunity } = useData()
  const [busy, setBusy] = useState(null)
  const run = async (id, fn) => { setBusy(id); try { await fn() } catch (e) { alert(e.message) } finally { setBusy(null) } }
  const markLost = (o) => { const reason = window.prompt(`Mark ${o.customer} as Lost — reason is required:`); if (reason && reason.trim()) run(o.id, () => lostOpportunity(o.id, reason.trim())) }

  const lost = opportunities.filter((o) => o.stage === 'Lost')

  return (
    <>
      <PageHeader title="Opportunities" subtitle="Track deals through the pipeline · every deal needs a next-action date">
        <button className="btn-primary" onClick={() => openForm('opportunity')}><Plus size={16} /> New Opportunity</button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stages.map((stage) => {
          // first column is a catch-all for early stages (Prospecting / Qualified / Lead / …)
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
                  <div key={o.id} className="group card card-pad hover:shadow-glow transition">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-ink">{o.customer}</p>
                      <Badge tone={statusTone(o.stage)}>{o.prob}%</Badge>
                    </div>
                    <p className="mt-1 text-lg font-extrabold text-ink">{sar(o.value)}</p>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted">
                      <span>Next: {o.close || '—'}</span>
                      <span>{o.owner}</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
                      <div className="h-1.5 rounded-full" style={{ width: `${o.prob}%`, background: stageColor[stage] }} />
                    </div>
                    {stage !== 'Won' && (
                      <div className="mt-2 flex gap-1.5 opacity-0 transition group-hover:opacity-100">
                        <button onClick={() => run(o.id, () => wonOpportunity(o.id))} disabled={busy === o.id}
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-emerald-200 py-1 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 disabled:opacity-50">{busy === o.id ? <Loader2 size={12} className="animate-spin" /> : <Trophy size={12} />} Won</button>
                        <button onClick={() => markLost(o)} disabled={busy === o.id}
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-rose-200 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50">{busy === o.id ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />} Lost</button>
                      </div>
                    )}
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
    </>
  )
}
