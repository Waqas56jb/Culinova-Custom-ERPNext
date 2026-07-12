import { useState, useEffect } from 'react'
import {
  ShoppingBag, FolderKanban, ShoppingCart, Boxes, Wallet, HardHat, Wrench, Users2, ArrowUpRight, Loader2,
} from 'lucide-react'
import { PageHeader } from '../components/ui.jsx'
import { api } from '../api.js'

const icons = { sales: ShoppingBag, projects: FolderKanban, procurement: ShoppingCart, stock: Boxes, finance: Wallet, site: HardHat, service: Wrench, hr: Users2 }
const accents = ['from-brand-500 to-brand-600', 'from-violet-500 to-indigo-600', 'from-gold-500 to-gold-600', 'from-emerald-500 to-teal-600', 'from-blue-500 to-blue-600', 'from-rose-500 to-rose-600', 'from-cyan-500 to-teal-600', 'from-amber-500 to-gold-600']

export default function Modules() {
  const [mods, setMods] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    api('/admin/module-stats').then(setMods).catch((e) => { setErr(e.message); setMods([]) })
  }, [])

  return (
    <>
      <PageHeader title="All Modules" subtitle="Live snapshot of every operational panel — full admin visibility" />

      {mods === null && <div className="grid place-items-center gap-2 py-16 text-sm text-muted"><Loader2 className="animate-spin" /> Loading live module data…</div>}
      {err && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{err}</div>}

      {mods && mods.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {mods.map((m, i) => {
            const Icon = icons[m.icon] || FolderKanban
            return (
              <div key={m.name} className="card card-pad animate-fade-up">
                <div className="flex items-start justify-between">
                  <div className={`grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br ${accents[i % accents.length]} text-white shadow-soft`}><Icon size={20} /></div>
                  <ArrowUpRight size={18} className="text-slate-300" />
                </div>
                <p className="mt-3 text-base font-bold text-ink">{m.name}</p>
                <p className="mt-2 text-2xl font-extrabold tracking-tight text-brand-600">{m.metric}</p>
                <p className="text-xs text-muted">{m.sub}</p>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700">
        🔗 As admin you have <b>Full Admin</b> access to all of these panels and their data. Operational work happens inside each panel; this console controls users, roles, access &amp; company-wide visibility.
      </div>
    </>
  )
}
