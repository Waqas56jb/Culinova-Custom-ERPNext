import { useState } from 'react'
import { Camera, Check, FolderKanban } from 'lucide-react'
import { Badge, statusTone } from '../components/ui.jsx'
import { Sheet } from '../components/Sheet.jsx'
import { useTech } from '../store/TechContext.jsx'

const steps = ['Open', 'In Progress', 'Installed']
const boqSteps = ['Assigned', 'In Progress', 'Installed']

export default function Tasks() {
  const { tasks, boq, updateTask, updateBoq, addPhoto } = useTech()
  const [open, setOpen] = useState(null)
  const t = tasks.find((x) => x.id === open)

  return (
    <div className="space-y-3 animate-fade-up">
      {/* Installation work assigned by the Project Manager */}
      {boq.length > 0 && (
        <div className="space-y-3">
          <h1 className="font-display text-xl font-extrabold text-ink">Installation Work</h1>
          {boq.map((b) => (
            <div key={b.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-ink">{b.item} <span className="text-xs font-normal text-muted">× {b.qty}</span></p>
                <Badge tone={statusTone(b.status)}>{b.status}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted"><FolderKanban size={11} className="mb-0.5 mr-1 inline" />{b.project} · {b.customer}{b.location ? ` · ${b.location}` : ''}</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {boqSteps.map((s) => (
                  <button key={s} onClick={() => updateBoq(b.id, s)} className={`rounded-xl border py-2 text-xs font-semibold transition ${b.status === s ? 'border-brand-500 bg-brand-50 text-brand-600' : 'border-slate-200 text-slate-500'}`}>{s}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <h1 className="font-display text-xl font-extrabold text-ink">My Tasks</h1>

      {tasks.map((task) => (
        <div key={task.id} className="card p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-ink">{task.item}</p>
            <Badge tone={statusTone(task.status)}>{task.status}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted"><FolderKanban size={11} className="mb-0.5 mr-1 inline" />{task.project} · {task.customer} · due {task.due}</p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${task.progress}%` }} /></div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-muted">📷 {task.photos || 0} photos</span>
            {task.status !== 'Installed' ? (
              <button onClick={() => setOpen(task.id)} className="ml-auto rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white">Update</button>
            ) : <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><Check size={13} /> Done</span>}
          </div>
        </div>
      ))}

      <Sheet open={!!t} onClose={() => setOpen(null)} title={t?.item}
        footer={<button onClick={() => setOpen(null)} className="w-full rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white">Done</button>}>
        {t && (
          <>
            <p className="text-xs text-muted">{t.project} · {t.customer}</p>
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-600">Update Status</p>
              <div className="grid grid-cols-3 gap-2">
                {steps.map((s) => (
                  <button key={s} onClick={() => updateTask(t.id, s)} className={`rounded-xl border py-2.5 text-xs font-semibold transition ${t.status === s ? 'border-brand-500 bg-brand-50 text-brand-600' : 'border-slate-200 text-slate-500'}`}>{s}</button>
                ))}
              </div>
            </div>
            <button onClick={() => addPhoto(t.id)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-500">
              <Camera size={17} /> Add Photo ({t.photos || 0})
            </button>
          </>
        )}
      </Sheet>
    </div>
  )
}
