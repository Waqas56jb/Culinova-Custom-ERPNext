import { Plus, Search, MessageSquarePlus } from 'lucide-react'
import { useState } from 'react'
import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'

export default function Customers() {
  const { customers, interactions, openForm } = useData()
  const [q, setQ] = useState('')
  const rows = customers.filter((c) => (c.name || '').toLowerCase().includes(q.toLowerCase()))
  const activityCount = (name) => interactions.filter((i) => i.customer === name).length
  const totalBiz = customers.reduce((s, c) => s + c.business, 0)
  const totalOut = customers.reduce((s, c) => s + c.outstanding, 0)

  return (
    <>
      <PageHeader title="Customers" subtitle="Your customer accounts & balances">
        <button className="btn-primary" onClick={() => openForm('customer')}><Plus size={16} /> New Customer</button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total Customers" value={customers.length} tone="text-ink" />
        <Stat label="Total Business" value={sar(totalBiz)} tone="text-brand-600" />
        <Stat label="Outstanding" value={sar(totalOut)} tone="text-rose-600" />
        <Stat label="Active" value={customers.length} tone="text-emerald-600" />
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-slate-100 p-4">
          <div className="relative w-full sm:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search customers…"
              className="w-full rounded-lg border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:bg-white"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr className="bg-slate-50/60">
                <th className="th">Customer</th><th className="th">Group</th><th className="th">Territory</th>
                <th className="th">Outstanding</th><th className="th">Activity</th><th className="th">Status</th><th className="th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/60">
                  <td className="td">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-gold-500 to-brand-600 text-[11px] font-bold text-white">
                        {(c.name || '?').split(' ').map((n) => n[0]).join('').slice(0, 2)}
                      </span>
                      <div>
                        <p className="font-semibold text-ink">{c.name}</p>
                        <p className="text-xs text-muted">{c.code || c.territory}</p>
                      </div>
                    </div>
                  </td>
                  <td className="td text-slate-500">{c.group}</td>
                  <td className="td text-slate-500">{c.territory}</td>
                  <td className="td">
                    <span className={c.outstanding > 0 ? 'font-semibold text-rose-600' : 'text-slate-400'}>
                      {c.outstanding > 0 ? sar(c.outstanding) : '—'}
                    </span>
                  </td>
                  <td className="td"><span className="chip bg-slate-100 text-slate-500">{activityCount(c.name)} logged</span></td>
                  <td className="td"><Badge tone={statusTone(c.status)}>{c.status}</Badge></td>
                  <td className="td">
                    <button onClick={() => openForm('interaction', { customer: c.name })}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50">
                      <MessageSquarePlus size={13} /> Log Activity
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function Stat({ label, value, tone }) {
  return (
    <div className="card card-pad animate-fade-up">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${tone}`}>{value}</p>
    </div>
  )
}
