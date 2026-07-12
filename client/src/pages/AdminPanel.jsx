import { useState, useEffect, useCallback } from 'react'
import { Users2, ShieldCheck, ScrollText, CheckSquare, Plus, Pencil, KeyRound, Loader2, Check, X } from 'lucide-react'
import { PageHeader, Badge } from '../components/ui.jsx'
import { Modal, Field, Select } from '../components/Modal.jsx'
import { useData } from '../store/DataContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

export default function AdminPanel() {
  const [tab, setTab] = useState('Users')
  const TABS = [
    { key: 'Users', icon: Users2 },
    { key: 'Roles & Permissions', icon: ShieldCheck },
    { key: 'Audit Trail', icon: ScrollText },
    { key: 'Approvals', icon: CheckSquare },
  ]
  return (
    <>
      <PageHeader title="Administration" subtitle="Users · roles & permissions · audit trail · approvals" />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map(({ key, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${tab === key ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
            <Icon size={14} /> {key}
          </button>
        ))}
      </div>
      {tab === 'Users' && <UsersTab />}
      {tab === 'Roles & Permissions' && <RolesTab />}
      {tab === 'Audit Trail' && <AuditTab />}
      {tab === 'Approvals' && <ApprovalsTab />}
    </>
  )
}

function UsersTab() {
  const d = useData()
  const [users, setUsers] = useState([])
  const [rbac, setRbac] = useState(null)
  const [depts, setDepts] = useState([])
  const [modal, setModal] = useState(null)
  const [pw, setPw] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const load = useCallback(() => { d.adminUsers().then(setUsers).catch(() => setUsers([])) }, [d])
  useEffect(() => {
    load()
    d.adminRbac().then(setRbac).catch(() => {})
    // Departments master is readable by every internal role — never a free-text field.
    d.resList('settings/departments').then((r) => setDepts(Array.isArray(r) ? r : [])).catch(() => setDepts(d.settings?.departments || []))
  }, [load, d])

  const roles = rbac ? Object.keys(rbac.rolePanels) : ['Management', 'Sales User', 'Project Manager', 'Stock User', 'Accounts User']
  const levels = rbac ? Object.keys(rbac.levelActions) : ['View Only', 'Create', 'Edit', 'Approval', 'Full Admin']
  const deptOptions = [{ value: '', label: '— none —' }, ...depts.map((dp) => ({ value: dp.name, label: dp.name }))]
  const blank = () => ({ name: '', email: '', password: '', role: 'Sales User', access_level: 'Create', department: '', status: 'Active' })

  const save = async () => {
    setBusy(true); setErr('')
    try {
      if (modal.id) { const { password, ...rest } = modal; await d.adminUpdateUser(modal.id, rest) }
      else await d.adminAddUser(modal)
      setModal(null); load()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const doReset = async () => { setBusy(true); setErr(''); try { await d.adminResetPassword(pw.id, pw.newPassword); setPw(null) } catch (e) { setErr(e.message) } finally { setBusy(false) } }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 p-4">
        <h3 className="text-[15px] font-bold text-ink">Users ({users.length})</h3>
        <button className="btn-primary" onClick={() => { setErr(''); setModal(blank()) }}><Plus size={16} /> Add User</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="bg-slate-50/60"><th className="th">Name</th><th className="th">Email</th><th className="th">Role</th><th className="th">Access</th><th className="th">Department</th><th className="th">Status</th><th className="th text-right">Actions</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50/60">
                <td className="td font-semibold text-ink">{u.name}</td>
                <td className="td text-slate-500">{u.email}</td>
                <td className="td"><Badge tone="violet">{u.role}</Badge></td>
                <td className="td text-slate-500">{u.access_level}</td>
                <td className="td text-slate-500">{u.department || '—'}</td>
                <td className="td"><Badge tone={u.status === 'Active' ? 'green' : 'gray'}>{u.status || 'Active'}</Badge></td>
                <td className="td text-right">
                  <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600" title="Edit" onClick={() => { setErr(''); setModal({ ...blank(), ...u }) }}><Pencil size={15} /></button>
                  <button className="rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-600" title="Reset password" onClick={() => { setErr(''); setPw({ id: u.id, newPassword: '' }) }}><KeyRound size={15} /></button>
                </td>
              </tr>
            ))}
            {users.length === 0 && <tr><td className="td text-slate-400" colSpan={7}>No users.</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit User' : 'Add User'} subtitle="Role + access level drive what this user can see and do"
        footer={<><button className="btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn-primary" disabled={busy} onClick={save}>{busy ? <Loader2 size={16} className="animate-spin" /> : null} Save</button></>}>
        {modal && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Full Name *" value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} />
            <Field label="Email *" value={modal.email} onChange={(e) => setModal({ ...modal, email: e.target.value })} />
            {!modal.id && <Field label="Password *" type="password" value={modal.password} onChange={(e) => setModal({ ...modal, password: e.target.value })} />}
            <Select label="Role" value={modal.role} onChange={(e) => setModal({ ...modal, role: e.target.value })} options={roles} />
            <Select label="Access Level" value={modal.access_level} onChange={(e) => setModal({ ...modal, access_level: e.target.value })} options={levels} />
            <Select label="Department" value={modal.department || ''} onChange={(e) => setModal({ ...modal, department: e.target.value })} options={deptOptions} />
            <Select label="Status" value={modal.status || 'Active'} onChange={(e) => setModal({ ...modal, status: e.target.value })} options={['Active', 'Inactive']} />
            {err && <div className="sm:col-span-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{err}</div>}
          </div>
        )}
      </Modal>

      <Modal open={!!pw} onClose={() => setPw(null)} title="Reset Password"
        footer={<><button className="btn-ghost" onClick={() => setPw(null)}>Cancel</button><button className="btn-primary" disabled={busy || !pw?.newPassword} onClick={doReset}>{busy ? <Loader2 size={16} className="animate-spin" /> : null} Reset</button></>}>
        {pw && <><Field label="New Password (min 6)" type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />{err && <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{err}</div>}</>}
      </Modal>
    </div>
  )
}

function RolesTab() {
  const d = useData()
  const [rbac, setRbac] = useState(null)
  useEffect(() => { d.adminRbac().then(setRbac).catch(() => {}) }, [d])
  if (!rbac) return <div className="card card-pad text-sm text-muted">Loading…</div>
  const has = (panels, p) => panels.includes('*') || panels.includes(p)
  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 p-4"><h3 className="text-[15px] font-bold text-ink">Role → Panel access</h3><p className="text-xs text-muted">Which modules each role can open (single source of truth)</p></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50/60"><th className="th sticky left-0 bg-slate-50/60">Role</th>{rbac.panels.map((p) => <th key={p} className="th text-center capitalize">{p}</th>)}</tr></thead>
            <tbody>
              {Object.entries(rbac.rolePanels).map(([role, panels]) => (
                <tr key={role} className="hover:bg-slate-50/60">
                  <td className="td sticky left-0 bg-white font-semibold text-ink">{role}</td>
                  {rbac.panels.map((p) => <td key={p} className="td text-center">{has(panels, p) ? <Check size={15} className="mx-auto text-emerald-500" /> : <X size={13} className="mx-auto text-slate-200" />}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 p-4"><h3 className="text-[15px] font-bold text-ink">Access Level → Actions</h3></div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><tbody>
          {Object.entries(rbac.levelActions).map(([lvl, acts]) => (
            <tr key={lvl} className="hover:bg-slate-50/60 border-b border-slate-50 last:border-0"><td className="td font-semibold text-ink w-40">{lvl}</td><td className="td">{acts.map((a) => <span key={a} className="mr-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 capitalize">{a}</span>)}</td></tr>
          ))}
        </tbody></table></div>
      </div>
    </div>
  )
}

function AuditTab() {
  const d = useData()
  const [rows, setRows] = useState([])
  useEffect(() => { d.adminAudit('limit=200').then(setRows).catch(() => setRows([])) }, [d])
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-100 p-4"><h3 className="text-[15px] font-bold text-ink">Audit Trail</h3><p className="text-xs text-muted">Every create / update / delete across the system</p></div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-50/60"><th className="th">When</th><th className="th">User</th><th className="th">Entity</th><th className="th">Action</th><th className="th">Reference</th></tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50/60 border-b border-slate-50 last:border-0">
                <td className="td text-slate-500 whitespace-nowrap">{new Date(a.created_at).toLocaleString()}</td>
                <td className="td font-medium text-ink">{a.user_name}</td>
                <td className="td"><Badge tone="gray">{a.entity}</Badge></td>
                <td className="td text-slate-600">{a.action}</td>
                <td className="td font-mono text-[11px] text-slate-400">{a.entity_id ? String(a.entity_id).slice(0, 8) : '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="td text-slate-400" colSpan={5}>No audit entries yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ApprovalsTab() {
  const d = useData()
  const { user, canSee } = useAuth()
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState('')
  const load = useCallback(() => { d.adminApprovals().then(setRows).catch(() => setRows([])) }, [d])
  useEffect(() => { load() }, [load])
  const canDecide = canSee('admin') && ['Approval', 'Full Admin'].includes(user?.access_level)
  const decide = async (id, decision) => { setBusy(id); try { await d.adminDecideApproval(id, decision, ''); load() } finally { setBusy('') } }
  const tone = { pending: 'amber', approved: 'green', rejected: 'red' }
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-100 p-4"><h3 className="text-[15px] font-bold text-ink">Approval Requests</h3><p className="text-xs text-muted">Discounts, purchases and other actions awaiting a decision</p></div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-50/60"><th className="th">Request</th><th className="th">Type</th><th className="th">Amount</th><th className="th">By</th><th className="th">Status</th><th className="th text-right">Decision</th></tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50/60 border-b border-slate-50 last:border-0">
                <td className="td font-medium text-ink">{a.title}{a.reason && <span className="block text-[11px] text-muted">{a.reason}</span>}</td>
                <td className="td"><Badge tone="gray">{a.entity_type}</Badge></td>
                <td className="td text-slate-600">{a.amount != null ? Number(a.amount).toLocaleString() : '—'}</td>
                <td className="td text-slate-500">{a.requested_by_name}</td>
                <td className="td"><Badge tone={tone[a.status]}>{a.status}</Badge></td>
                <td className="td text-right">
                  {a.status === 'pending' && canDecide ? (
                    <div className="flex justify-end gap-1.5">
                      <button className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-600 hover:bg-emerald-100" disabled={busy === a.id} onClick={() => decide(a.id, 'approved')}>Approve</button>
                      <button className="rounded-lg bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-100" disabled={busy === a.id} onClick={() => decide(a.id, 'rejected')}>Reject</button>
                    </div>
                  ) : a.status !== 'pending' ? <span className="text-[11px] text-muted">by {a.decided_by_name || '—'}</span> : <span className="text-[11px] text-muted">—</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="td text-slate-400" colSpan={6}>No approval requests.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
