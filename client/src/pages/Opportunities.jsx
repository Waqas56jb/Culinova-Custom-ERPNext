import { Plus } from 'lucide-react'
import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'

const stages = ['Prospecting', 'Quotation', 'Negotiation', 'Won']
const stageColor = { Prospecting: '#94a3b8', Quotation: '#3b82f6', Negotiation: '#E0A82E', Won: '#0EA99A' }

export default function Opportunities() {
  const { opportunities, openForm } = useData()
  return (
    <>
      <PageHeader title="Opportunities" subtitle="Track deals through the sales pipeline (Kanban)">
        <button className="btn-primary" onClick={() => openForm('opportunity')}><Plus size={16} /> New Opportunity</button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stages.map((stage) => {
          const items = opportunities.filter((o) => o.stage === stage)
          const total = items.reduce((s, o) => s + o.value, 0)
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
                  <div key={o.id} className="card card-pad cursor-pointer hover:shadow-glow transition">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-brand-600">{o.id}</span>
                      <Badge tone={statusTone(o.stage)}>{o.prob}%</Badge>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-ink">{o.customer}</p>
                    <p className="mt-1 text-lg font-extrabold text-ink">{sar(o.value)}</p>
                    <div className="mt-3 flex items-center justify-between text-xs text-muted">
                      <span>Close: {o.close}</span>
                      <span>{o.owner}</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
                      <div className="h-1.5 rounded-full" style={{ width: `${o.prob}%`, background: stageColor[stage] }} />
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <p className="rounded-xl border border-dashed border-slate-300 py-6 text-center text-xs text-slate-400">No deals</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
