import { FolderKanban } from 'lucide-react'
import { PageHeader, Badge, statusTone, sar } from '../components/ui.jsx'
import { useCustomer } from '../store/CustomerContext.jsx'

export default function Projects() {
  const { projects } = useCustomer()

  return (
    <>
      <PageHeader title="My Projects" subtitle="Live status of your projects with CULINOVA" />

      <div className="space-y-5">
        {projects.map((p) => {
          const done = p.items.filter((i) => i.status === 'Installed').length
          return (
            <div key={p.id} className="card overflow-hidden animate-fade-up">
              <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-navy-700 to-brand-600 text-white"><FolderKanban size={20} /></span>
                  <div>
                    <p className="font-display text-lg font-extrabold text-ink">{p.name}</p>
                    <p className="text-xs text-muted">{p.id} · {sar(p.value)} · {p.start} → {p.end}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                  <div className="w-40"><div className="mb-1 flex justify-between text-xs"><span className="font-semibold text-ink">{p.progress}%</span><span className="text-muted">{done}/{p.items.length} done</span></div><div className="h-2 w-full rounded-full bg-slate-100"><div className="h-2 rounded-full bg-brand-500" style={{ width: `${p.progress}%` }} /></div></div>
                </div>
              </div>
              <div className="p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Scope of Supply</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {p.items.map((it) => (
                    <div key={it.item} className="flex items-center justify-between rounded-xl border border-slate-100 p-3">
                      <span className="truncate pr-2 text-sm font-medium text-ink">{it.item}</span>
                      <Badge tone={statusTone(it.status)}>{it.status}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
