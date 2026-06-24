import { useNavigate } from 'react-router-dom'
import { ClipboardList, Clock, CheckCircle2, ChevronRight } from 'lucide-react'
import { Badge, statusTone } from '../components/ui.jsx'
import { useTech } from '../store/TechContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

export default function Home() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { tasks, visits } = useTech()
  const open = tasks.filter((t) => t.status === 'Open').length
  const prog = tasks.filter((t) => t.status === 'In Progress').length
  const done = tasks.filter((t) => t.status === 'Installed').length
  const todays = tasks.filter((t) => t.status !== 'Installed')

  return (
    <div className="space-y-4 animate-fade-up">
      <div>
        <p className="text-sm text-muted">Good day,</p>
        <h1 className="font-display text-xl font-extrabold text-ink">{user?.name} 👷</h1>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { l: 'Assigned', v: open, c: 'text-slate-700', i: ClipboardList },
          { l: 'In Progress', v: prog, c: 'text-blue-600', i: Clock },
          { l: 'Done', v: done, c: 'text-emerald-600', i: CheckCircle2 },
        ].map((s) => (
          <div key={s.l} className="card p-3 text-center">
            <s.i size={18} className={`mx-auto mb-1 ${s.c}`} />
            <p className={`text-xl font-extrabold ${s.c}`}>{s.v}</p>
            <p className="text-[10px] text-muted">{s.l}</p>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-bold text-ink">Today's Jobs</h2><button onClick={() => navigate('/tasks')} className="text-xs font-semibold text-brand-600">See all</button></div>
        <div className="space-y-2">
          {todays.map((t) => (
            <button key={t.id} onClick={() => navigate('/tasks')} className="card flex w-full items-center gap-3 p-3 text-left">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600"><ClipboardList size={18} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{t.item}</p>
                <p className="text-xs text-muted">{t.project} · {t.customer}</p>
              </div>
              <Badge tone={statusTone(t.status)}>{t.status}</Badge>
              <ChevronRight size={16} className="text-slate-300" />
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-gradient-to-r from-navy-800 to-brand-700 p-4 text-white">
        <p className="text-sm font-bold">📅 {visits.filter((v) => v.status === 'Scheduled').length} maintenance visits scheduled</p>
        <button onClick={() => navigate('/visits')} className="mt-2 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold">View visits</button>
      </div>
    </div>
  )
}
