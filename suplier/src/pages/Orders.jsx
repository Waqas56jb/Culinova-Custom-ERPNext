import { CheckCircle2 } from 'lucide-react'
import { PageHeader, Badge, statusTone, sar } from '../components/ui.jsx'
import { useSupplier } from '../store/SupplierContext.jsx'

export default function Orders() {
  const { orders, acceptOrder } = useSupplier()
  const total = orders.reduce((s, o) => s + o.amount, 0)

  return (
    <>
      <PageHeader title="Purchase Orders" subtitle="Orders awarded to you by CULINOVA" />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Total Orders" value={orders.length} tone="text-ink" />
        <Stat label="Order Value" value={sar(total)} tone="text-brand-600" />
        <Stat label="To Accept" value={orders.filter((o) => !o.accepted).length} tone="text-amber-600" />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">PO</th><th className="th">Item</th><th className="th">Qty</th><th className="th">Amount</th>
              <th className="th">Date</th><th className="th">Status</th><th className="th text-right">Action</th>
            </tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50/60">
                  <td className="td font-semibold text-brand-600">{o.id}</td>
                  <td className="td font-medium text-ink">{o.item}</td>
                  <td className="td text-slate-600">{o.qty}</td>
                  <td className="td font-semibold">{sar(o.amount)}</td>
                  <td className="td text-slate-500">{o.date}</td>
                  <td className="td"><Badge tone={statusTone(o.status)}>{o.status}</Badge></td>
                  <td className="td text-right">
                    {o.accepted ? (
                      <span className="chip bg-emerald-50 text-emerald-600"><CheckCircle2 size={12} /> Accepted</span>
                    ) : (
                      <button onClick={() => acceptOrder(o.id)} className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600">Accept Order</button>
                    )}
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
  return <div className="card card-pad animate-fade-up"><p className="text-xs text-muted">{label}</p><p className={`mt-1 text-2xl font-extrabold ${tone}`}>{value}</p></div>
}
