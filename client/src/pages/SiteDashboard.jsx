import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { HardHat, Wrench, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react'
import { PageHeader, KpiCard, ChartCard, Badge, statusTone } from '../components/ui.jsx'
import { useData } from '../store/DataContext.jsx'

export default function SiteDashboard() {
  const navigate = useNavigate()
  const d = useData()
  const { projects, snags, commissioning } = d
  // resolve a snag's project_id (uuid) → readable label via the shared lookup (any internal role)
  const [projMap, setProjMap] = useState({})
  useEffect(() => {
    d.lookupProjects().then((rows) => {
      const m = {}; for (const p of rows || []) m[p.id] = p.label || p.ref || p.name
      setProjMap(m)
    }).catch(() => setProjMap({}))
  }, [d])
  const projLabel = (pid) => projMap[pid] || (pid ? '—' : '')
  const activeSites = projects.filter((p) => p.status !== 'Completed')
  const toInstall = projects.flatMap((p) => (p.boq || []).filter((b) => b.status === 'Delivered')).length
  const openSnags = snags.filter((s) => s.status === 'Open').length
  const tcPending = commissioning.filter((t) => t.status === 'Pending').length

  return (
    <>
      <PageHeader title="Site Execution Dashboard" subtitle="Installation, site progress, snags & commissioning" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Active Sites" value={activeSites.length} sub="in execution" icon={HardHat} accent="brand" />
        <KpiCard label="Items to Install" value={toInstall} sub="delivered, awaiting fit" icon={Wrench} accent="violet" />
        <KpiCard label="Open Snags" value={openSnags} sub="defects to fix" icon={AlertTriangle} accent="gold" />
        <KpiCard label="T&C Pending" value={tcPending} sub="tests to pass" icon={CheckCircle2} accent="emerald" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Active Sites" action={<button onClick={() => navigate('/site/installations')} className="text-xs font-semibold text-brand-600">Installations</button>}>
          <div className="divide-y divide-slate-100">
            {activeSites.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600"><HardHat size={16} /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{p.name}</p><p className="text-xs text-muted">{p.ref || p.number || '—'} · {p.progress}% complete</p></div>
                <Badge tone={statusTone(p.status)}>{p.status}</Badge>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Recent Snags" action={<button onClick={() => navigate('/site/snags')} className="text-xs font-semibold text-brand-600">View all</button>}>
          <div className="divide-y divide-slate-100">
            {snags.slice(0, 5).map((s) => (
              <div key={s.id} className="flex items-center gap-3 py-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-50 text-amber-600"><AlertTriangle size={16} /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{s.description}</p><p className="text-xs text-muted">{[projLabel(s.project), s.item].filter(Boolean).join(' · ')}</p></div>
                <Badge tone={statusTone(s.severity)}>{s.severity}</Badge>
                <Badge tone={statusTone(s.status)}>{s.status}</Badge>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>
    </>
  )
}
