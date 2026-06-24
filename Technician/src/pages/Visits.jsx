import { CalendarClock, Check, MapPin } from 'lucide-react'
import { Badge, statusTone } from '../components/ui.jsx'
import { useTech } from '../store/TechContext.jsx'

export default function Visits() {
  const { visits, completeVisit } = useTech()

  return (
    <div className="space-y-3 animate-fade-up">
      <h1 className="font-display text-xl font-extrabold text-ink">Maintenance Visits</h1>

      {visits.map((v) => (
        <div key={v.id} className="card p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600"><CalendarClock size={18} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{v.type} visit</p>
              <p className="text-xs text-muted"><MapPin size={11} className="mb-0.5 mr-1 inline" />{v.customer} · {v.date}</p>
            </div>
            <Badge tone={statusTone(v.status)}>{v.status}</Badge>
          </div>
          {v.status === 'Scheduled' && (
            <button onClick={() => completeVisit(v.id)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-2.5 text-sm font-semibold text-white"><Check size={16} /> Mark Completed</button>
          )}
        </div>
      ))}
    </div>
  )
}
