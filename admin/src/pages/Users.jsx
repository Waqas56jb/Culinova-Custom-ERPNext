import { useState } from 'react'
import { Plus, Search, Pencil, Trash2, Power, KeyRound } from 'lucide-react'
import { PageHeader, Badge, accessTone } from '../components/ui.jsx'
import { Modal, Field, Select, Row } from '../components/Modal.jsx'
import { roles, accessLevels, departments } from '../data/adminData.js'
import { useAdmin } from '../store/AdminContext.jsx'

const blank = { name: '', email: '', password: '', designation: '', dept: 'Sales', role: 'Sales User', access: 'Create' }

export default function Users() {
  const { users, addUser, updateUser, deleteUser, toggleStatus, resetPassword } = useAdmin()
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [v, setV] = useState(blank)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const rows = users.filter((u) => (u.name + u.email + u.designation + u.role).toLowerCase().includes(q.toLowerCase()))
  const openNew = () => { setEditing(null); setErr(''); setV(blank); setModal(true) }
  const openEdit = (u) => { setEditing(u.id); setErr(''); setV({ name: u.name, email: u.email, password: '', designation: u.designation, dept: u.dept, role: u.role, access: u.access }); setModal(true) }
  const save = async () => {
    if (!v.name || !v.email) { setErr('Name and email are required'); return }
    if (!editing && !v.password) { setErr('Set a password for the new user'); return }
    setBusy(true); setErr('')
    try { if (editing) await updateUser(editing, v); else await addUser(v); setModal(false) }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const remove = async (u) => { if (window.confirm(`Delete user ${u.name}? This cannot be undone.`)) { try { await deleteUser(u.id) } catch (e) { alert(e.message) } } }
  const doReset = async (u) => {
    const pw = window.prompt(`Set a new password for ${u.name}:`)
    if (!pw) return
    try { await resetPassword(u.id, pw); alert(`Password updated for ${u.name}.`) } catch (e) { alert(e.message) }
  }

  return (
    <>
      <PageHeader title="User Management" subtitle="All registered employees — designation, role, access & status">
        <button className="btn-primary" onClick={openNew}><Plus size={16} /> New User</button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total Users" value={users.length} tone="text-ink" />
        <Stat label="Active" value={users.filter((u) => u.status === 'Active').length} tone="text-emerald-600" />
        <Stat label="Admins" value={users.filter((u) => u.access === 'Full Admin').length} tone="text-gold-600" />
        <Stat label="Departments" value={new Set(users.map((u) => u.dept)).size} tone="text-violet-600" />
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-slate-100 p-4">
          <div className="relative w-full sm:w-80">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users…" className="w-full rounded-lg border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:bg-white" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">Employee</th><th className="th">Designation</th><th className="th">Dept</th><th className="th">Role</th>
              <th className="th">Access Level</th><th className="th">Status</th><th className="th text-right">Actions</th>
            </tr></thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/60">
                  <td className="td">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-navy-700 to-brand-600 text-[11px] font-bold text-white">{u.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}</span>
                      <div><p className="font-semibold text-ink">{u.name}</p><p className="text-xs text-muted">{u.email}</p></div>
                    </div>
                  </td>
                  <td className="td text-slate-600">{u.designation}</td>
                  <td className="td text-slate-500">{u.dept}</td>
                  <td className="td"><Badge tone="violet">{u.role}</Badge></td>
                  <td className="td"><Badge tone={accessTone[u.access] || 'gray'}>{u.access}</Badge></td>
                  <td className="td"><Badge tone={u.status === 'Active' ? 'green' : 'gray'}>{u.status}</Badge></td>
                  <td className="td">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(u)} title="Edit / change role & email" className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Pencil size={15} /></button>
                      <button onClick={() => doReset(u)} title="Reset password" className="rounded-lg p-2 text-slate-400 hover:bg-violet-50 hover:text-violet-600"><KeyRound size={15} /></button>
                      <button onClick={() => toggleStatus(u.id)} title="Enable / disable" className="rounded-lg p-2 text-slate-400 hover:bg-amber-50 hover:text-amber-600"><Power size={15} /></button>
                      <button onClick={() => remove(u)} title="Delete" className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit User' : 'New User'} subtitle="Set email, password, role & access level"
        footer={<><button className="btn-ghost" onClick={() => setModal(false)}>Cancel</button><button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : editing ? 'Save Changes' : 'Create User'}</button></>}>
        <Row>
          <Field label="Full Name" value={v.name} onChange={(e) => setV((s) => ({ ...s, name: e.target.value }))} placeholder="e.g. Mohammed Ali" />
          <Field label="Email" type="email" value={v.email} onChange={(e) => setV((s) => ({ ...s, email: e.target.value }))} placeholder="name@culinova.sa" />
        </Row>
        {!editing && <Field label="Password" type="text" value={v.password} onChange={(e) => setV((s) => ({ ...s, password: e.target.value }))} placeholder="Set an initial password" />}
        {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{err}</p>}
        <Field label="Designation" value={v.designation} onChange={(e) => setV((s) => ({ ...s, designation: e.target.value }))} placeholder="e.g. Sales Executive" />
        <Row>
          <Select label="Department" value={v.dept} onChange={(e) => setV((s) => ({ ...s, dept: e.target.value }))} options={departments} />
          <Select label="Role" value={v.role} onChange={(e) => setV((s) => ({ ...s, role: e.target.value }))} options={roles} />
        </Row>
        <Select label="Access Level" value={v.access} onChange={(e) => setV((s) => ({ ...s, access: e.target.value }))} options={accessLevels} />
      </Modal>
    </>
  )
}

function Stat({ label, value, tone }) {
  return <div className="card card-pad animate-fade-up"><p className="text-xs text-muted">{label}</p><p className={`mt-1 text-2xl font-extrabold ${tone}`}>{value}</p></div>
}
