import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import { Modal, Field, Select, Row } from '../components/Modal.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'

export default function Employees() {
  const { employees, addEmployee, settings } = useData()
  const deptOptions = (settings?.departments || []).map((x) => x.name)
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(false)
  const [v, setV] = useState({ name: '', role: '', department: 'Sales', salary: '' })
  const rows = employees.filter((e) => (e.name + e.role + e.department).toLowerCase().includes(q.toLowerCase()))
  const save = () => { if (v.name) addEmployee(v); setV({ name: '', role: '', department: 'Sales', salary: '' }); setModal(false) }

  return (
    <>
      <PageHeader title="Employees" subtitle="Company directory">
        <button className="btn-primary" onClick={() => setModal(true)}><Plus size={16} /> New Employee</button>
      </PageHeader>

      <div className="card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-slate-100 p-4">
          <div className="relative w-full sm:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employees…" className="w-full rounded-lg border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:bg-white" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">Employee</th><th className="th">Role</th><th className="th">Department</th><th className="th">Salary</th><th className="th">Today</th>
            </tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50/60">
                  <td className="td">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-navy-700 to-brand-600 text-[11px] font-bold text-white">{e.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}</span>
                      <div><p className="font-semibold text-ink">{e.name}</p><p className="text-xs text-muted">{e.id}</p></div>
                    </div>
                  </td>
                  <td className="td text-slate-600">{e.role}</td>
                  <td className="td text-slate-500">{e.department}</td>
                  <td className="td font-semibold">{sar(e.salary)}</td>
                  <td className="td"><Badge tone={statusTone(e.today)}>{e.today}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="New Employee" subtitle="Add to the directory"
        footer={<><button className="btn-ghost" onClick={() => setModal(false)}>Cancel</button><button className="btn-primary" onClick={save}>Create Employee</button></>}>
        <Field label="Full Name" value={v.name} onChange={(e) => setV((s) => ({ ...s, name: e.target.value }))} placeholder="e.g. Mohammed Ali" />
        <Row>
          <Field label="Role" value={v.role} onChange={(e) => setV((s) => ({ ...s, role: e.target.value }))} placeholder="e.g. Technician" />
          <Select label="Department" value={v.department} onChange={(e) => setV((s) => ({ ...s, department: e.target.value }))} options={deptOptions.length ? deptOptions : ['Management', 'Sales', 'Procurement', 'Warehouse', 'Projects', 'Finance', 'Service', 'HR']} />
        </Row>
        <Field label="Monthly Salary (SAR)" type="number" value={v.salary} onChange={(e) => setV((s) => ({ ...s, salary: e.target.value }))} placeholder="9000" />
      </Modal>
    </>
  )
}
