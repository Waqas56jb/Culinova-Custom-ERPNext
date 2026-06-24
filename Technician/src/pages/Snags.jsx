import { useState } from 'react'
import { Plus, AlertTriangle } from 'lucide-react'
import { Badge, statusTone } from '../components/ui.jsx'
import { Sheet, Field, Select, TextArea } from '../components/Sheet.jsx'
import { useTech } from '../store/TechContext.jsx'

export default function Snags() {
  const { snags, addSnag } = useTech()
  const [open, setOpen] = useState(false)
  const [v, setV] = useState({ project: '', item: '', desc: '', severity: 'Low' })
  const save = () => { if (v.desc) addSnag(v); setV({ project: '', item: '', desc: '', severity: 'Low' }); setOpen(false) }

  return (
    <div className="space-y-3 animate-fade-up">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-extrabold text-ink">Snags</h1>
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-xl bg-brand-500 px-3 py-2 text-xs font-semibold text-white"><Plus size={15} /> Log Snag</button>
      </div>

      {snags.map((s) => (
        <div key={s.id} className="card p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600"><AlertTriangle size={18} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{s.desc}</p>
              <p className="text-xs text-muted">{s.project} · {s.item}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2"><Badge tone={statusTone(s.severity)}>{s.severity}</Badge><Badge tone={statusTone(s.status)}>{s.status}</Badge></div>
        </div>
      ))}
      {snags.length === 0 && <p className="py-10 text-center text-sm text-slate-400">No snags logged.</p>}

      <Sheet open={open} onClose={() => setOpen(false)} title="Log a Snag"
        footer={<><button onClick={() => setOpen(false)} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-500">Cancel</button><button onClick={save} className="flex-1 rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white">Save</button></>}>
        <Field label="Project" value={v.project} onChange={(e) => setV((s) => ({ ...s, project: e.target.value }))} placeholder="PRJ-0042" />
        <Field label="Item" value={v.item} onChange={(e) => setV((s) => ({ ...s, item: e.target.value }))} placeholder="Exhaust Hood" />
        <TextArea label="Description" value={v.desc} onChange={(e) => setV((s) => ({ ...s, desc: e.target.value }))} placeholder="Describe the defect…" />
        <Select label="Severity" value={v.severity} onChange={(e) => setV((s) => ({ ...s, severity: e.target.value }))} options={['Low', 'Medium', 'High']} />
      </Sheet>
    </div>
  )
}
