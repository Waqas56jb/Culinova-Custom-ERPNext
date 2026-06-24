import { Plus, FolderKanban } from 'lucide-react'
import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'

export default function SalesOrders() {
  const { salesOrders, openForm } = useData()
  const total = salesOrders.reduce((s, o) => s + o.amount, 0)
  const toDeliver = salesOrders.filter((o) => o.delivery !== 'Fully Delivered').length
  const toBill = salesOrders.filter((o) => o.billing !== 'Fully Billed').length
  return (
    <>
      <PageHeader title="Sales Orders" subtitle="Confirmed orders — auto-linked to Projects">
        <button className="btn-primary" onClick={() => openForm('order')}><Plus size={16} /> New Order</button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total Orders" value={salesOrders.length} tone="text-ink" />
        <Stat label="Order Value" value={sar(total)} tone="text-brand-600" />
        <Stat label="To Deliver" value={toDeliver} tone="text-amber-600" />
        <Stat label="To Bill" value={toBill} tone="text-blue-600" />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead>
              <tr className="bg-slate-50/60">
                <th className="th">Order</th><th className="th">Customer</th><th className="th">Amount</th>
                <th className="th">Delivery</th><th className="th">Billing</th><th className="th">Project</th><th className="th">Date</th>
              </tr>
            </thead>
            <tbody>
              {salesOrders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50/60">
                  <td className="td font-semibold text-brand-600">{o.id}</td>
                  <td className="td font-medium text-ink">{o.customer}</td>
                  <td className="td font-semibold">{sar(o.amount)}</td>
                  <td className="td"><Badge tone={statusTone(o.delivery)}>{o.delivery}</Badge></td>
                  <td className="td"><Badge tone={statusTone(o.billing)}>{o.billing}</Badge></td>
                  <td className="td">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600">
                      <FolderKanban size={13} /> {o.project}
                    </span>
                  </td>
                  <td className="td text-slate-500">{o.date}</td>
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
