import { Check, ShieldCheck } from 'lucide-react'
import { PageHeader, Badge, accessTone } from '../components/ui.jsx'
import { roles, panels, accessLevels } from '../data/adminData.js'
import { useAdmin } from '../store/AdminContext.jsx'

export default function Roles() {
  const { matrix, toggleAccess } = useAdmin()

  return (
    <>
      <PageHeader title="Roles & Access Control" subtitle="Decide which role can access which panel" />

      {/* access levels reference */}
      <div className="card card-pad mb-4">
        <div className="mb-3 flex items-center gap-2"><ShieldCheck size={18} className="text-brand-600" /><h3 className="font-bold text-ink">Access Levels</h3></div>
        <div className="flex flex-wrap gap-2">
          {accessLevels.map((a) => <Badge key={a} tone={accessTone[a]}>{a}</Badge>)}
        </div>
        <p className="mt-2 text-xs text-muted">Each user is assigned a role + an access level (View / Create / Edit / Approval / Full Admin) from User Management.</p>
      </div>

      {/* matrix */}
      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 p-4"><h3 className="font-bold text-ink">Role → Panel Access Matrix</h3><p className="text-xs text-muted">Click a cell to grant or revoke access</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="bg-slate-50/60">
                <th className="th sticky left-0 bg-slate-50/60">Role</th>
                {panels.map((p) => <th key={p} className="th text-center align-bottom"><span className="block max-w-[70px] text-[10px] leading-tight">{p}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r} className="hover:bg-slate-50/40">
                  <td className="td sticky left-0 bg-white font-semibold text-ink">{r}</td>
                  {panels.map((p) => {
                    const on = !!matrix[r]?.[p]
                    return (
                      <td key={p} className="td text-center">
                        <button onClick={() => toggleAccess(r, p)} title={on ? 'Revoke' : 'Grant'}
                          className={`grid h-7 w-7 place-items-center rounded-lg transition ${on ? 'bg-brand-500 text-white' : 'border border-slate-200 text-slate-300 hover:border-brand-300'}`}>
                          {on && <Check size={14} />}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
