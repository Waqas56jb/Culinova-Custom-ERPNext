import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ArrowRight, ListChecks, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import { useData } from '../store/DataContext.jsx'

const cols = [
  { key: 'Open', label: 'To Do', color: '#94a3b8', soft: 'bg-slate-100 text-slate-600' },
  { key: 'Working', label: 'In Progress', color: '#3b82f6', soft: 'bg-blue-50 text-blue-600' },
  { key: 'Review', label: 'Review', color: '#E0A82E', soft: 'bg-amber-50 text-amber-600' },
  { key: 'Done', label: 'Done', color: '#0EA99A', soft: 'bg-emerald-50 text-emerald-600' },
]
const statusFilters = ['All', 'On Track', 'At Risk', 'Delayed', 'Completed']

export default function Tasks() {
  const navigate = useNavigate()
  const { projects } = useData()
  const [q, setQ] = useState('')
  const [sf, setSf] = useState('All')

  const ql = q.toLowerCase()
  const matches = (p) => {
    if (sf !== 'All' && p.status !== sf) return false
    if (!ql) return true
    const inProject = (p.id + p.name + p.customer + p.salesOrder).toLowerCase().includes(ql)
    const inTask = p.tasks.some((t) => `${t.name || ''} ${t.assignee || ''}`.toLowerCase().includes(ql))
    return inProject || inTask
  }
  const shown = projects.filter(matches)

  // company-wide summary
  const allTasks = projects.flatMap((p) => p.tasks)
  const summary = {
    total: allTasks.length,
    progress: allTasks.filter((t) => t.status === 'Working').length,
    done: allTasks.filter((t) => t.status === 'Done').length,
    overdue: allTasks.filter((t) => t.status === 'Overdue').length,
  }

  return (
    <>
      <PageHeader title="Task Board" subtitle="Tasks grouped by project — see completion at a glance" />

      {/* summary chips */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard icon={ListChecks} label="Total Tasks" value={summary.total} accent="from-violet-500 to-indigo-600" />
        <SummaryCard icon={Clock} label="In Progress" value={summary.progress} accent="from-blue-500 to-blue-600" />
        <SummaryCard icon={CheckCircle2} label="Completed" value={summary.done} accent="from-emerald-500 to-teal-600" />
        <SummaryCard icon={AlertTriangle} label="Overdue" value={summary.overdue} accent="from-rose-500 to-rose-600" />
      </div>

      {/* toolbar */}
      <div className="card mb-4 flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by project name, number, sales order, customer or assignee…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:bg-white" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {statusFilters.map((x) => (
            <button key={x} onClick={() => setSf(x)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${sf === x ? 'bg-brand-500 text-white shadow-soft' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{x}</button>
          ))}
        </div>
      </div>

      {/* project groups */}
      <div className="space-y-5">
        {shown.map((p) => {
          const total = p.tasks.length
          const done = p.tasks.filter((t) => t.status === 'Done').length
          const pct = total ? Math.round((done / total) * 100) : 0
          return (
            <div key={p.id} className="card overflow-hidden animate-fade-up">
              {/* group header */}
              <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 p-4 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="font-display text-xl font-extrabold tracking-tight text-brand-600">{p.id}</span>
                    <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-sm font-semibold text-ink">{p.name}</p>
                  <p className="text-xs text-muted">{p.customer} · {p.salesOrder}</p>
                </div>
                <div className="flex items-center gap-4 lg:w-80">
                  <div className="flex-1">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-semibold text-ink">{done} / {total} tasks done</span>
                      <span className="text-muted">{pct}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100"><div className="h-2 rounded-full bg-brand-500" style={{ width: `${pct}%` }} /></div>
                  </div>
                  <button onClick={() => navigate(`/projects/${p.id}`)} className="btn-ghost !px-3 !py-2 text-xs">Open <ArrowRight size={13} /></button>
                </div>
              </div>

              {/* mini board */}
              <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-2 xl:grid-cols-4">
                {cols.map((col) => {
                  const items = p.tasks.filter((t) => t.status === col.key || (col.key === 'Open' && t.status === 'Overdue'))
                  return (
                    <div key={col.key} className="rounded-xl bg-slate-50/70 p-2.5">
                      <div className="mb-2 flex items-center gap-2 px-1">
                        <span className="h-2 w-2 rounded-full" style={{ background: col.color }} />
                        <span className="text-xs font-bold text-ink">{col.label}</span>
                        <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${col.soft}`}>{items.length}</span>
                      </div>
                      <div className="space-y-2">
                        {items.map((t) => {
                          const overdue = t.status === 'Overdue'
                          return (
                            <div key={t.id} className="rounded-lg border border-slate-200/70 bg-white p-2.5 shadow-soft">
                              <p className="text-[13px] font-semibold leading-snug text-ink">{t.name}</p>
                              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
                                {t.assignee
                                  ? <><span className="grid h-5 w-5 place-items-center rounded-full bg-gradient-to-br from-navy-700 to-brand-600 text-[8px] font-bold text-white">{t.assignee.slice(0, 2)}</span>{t.assignee}</>
                                  : <span className="text-slate-400">Unassigned</span>}
                                <span className={`ml-auto ${overdue ? 'font-semibold text-rose-600' : ''}`}>{overdue ? 'Overdue' : (t.due_date || '')}</span>
                              </div>
                            </div>
                          )
                        })}
                        {items.length === 0 && <p className="py-3 text-center text-[11px] text-slate-300">—</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {shown.length === 0 && (
          <div className="card grid place-items-center py-20 text-center text-sm text-slate-400">
            <Search size={36} className="mb-3 text-slate-300" /> No projects match your search
          </div>
        )}
      </div>
    </>
  )
}

function SummaryCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="card card-pad flex items-center gap-3 animate-fade-up">
      <div className={`grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br ${accent} text-white`}><Icon size={18} /></div>
      <div>
        <p className="text-xl font-extrabold text-ink">{value}</p>
        <p className="text-xs text-muted">{label}</p>
      </div>
    </div>
  )
}
