import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import { useData } from '../store/DataContext.jsx'

export default function Commissioning() {
  const { commissioning, updateTest } = useData()
  const projects = [...new Set(commissioning.map((t) => t.project))]

  return (
    <>
      <PageHeader title="Testing & Commissioning" subtitle="Run checks before handover — all must pass" />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Total Tests" value={commissioning.length} tone="text-ink" />
        <Stat label="Passed" value={commissioning.filter((t) => t.status === 'Passed').length} tone="text-emerald-600" />
        <Stat label="Pending / Failed" value={commissioning.filter((t) => t.status !== 'Passed').length} tone="text-amber-600" />
      </div>

      <div className="space-y-4">
        {projects.map((pid) => {
          const tests = commissioning.filter((t) => t.project === pid)
          const passed = tests.filter((t) => t.status === 'Passed').length
          const allPassed = passed === tests.length
          return (
            <div key={pid} className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 p-4">
                <span className="font-display text-lg font-extrabold text-brand-600">{pid}</span>
                <span className={`chip ${allPassed ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{passed}/{tests.length} passed{allPassed ? ' · ready for handover' : ''}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {tests.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-sm font-medium text-ink flex-1">{t.test}</span>
                    <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                    <select value={t.status} onChange={(e) => updateTest(t.id, e.target.value)}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium outline-none focus:border-brand-400 focus:bg-white">
                      {['Pending', 'Passed', 'Failed'].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

function Stat({ label, value, tone }) {
  return <div className="card card-pad animate-fade-up"><p className="text-xs text-muted">{label}</p><p className={`mt-1 text-2xl font-extrabold ${tone}`}>{value}</p></div>
}
