import { Truck, FolderKanban, CheckCircle2 } from 'lucide-react'
import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'

export default function GoodsReceipt() {
  const { purchaseOrders, receivePO } = useData()
  const toReceive = purchaseOrders.filter((po) => po.status === 'Pending')
  const received = purchaseOrders.filter((po) => po.status !== 'Pending')

  return (
    <>
      <PageHeader title="Goods Receipt" subtitle="Receive supplier deliveries into stock (from Purchase Orders)" />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Awaiting Receipt" value={toReceive.length} tone="text-amber-600" />
        <Stat label="Received" value={received.length} tone="text-emerald-600" />
        <Stat label="Incoming Value" value={sar(toReceive.reduce((s, p) => s + p.amount, 0))} tone="text-brand-600" />
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 p-4"><h3 className="font-bold text-ink">Pending Receipts</h3><p className="text-xs text-muted">Mark items as received → stock increases automatically</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">PO</th><th className="th">Supplier</th><th className="th">Item</th><th className="th">Qty</th>
              <th className="th">Project</th><th className="th">Value</th><th className="th">Shipment</th><th className="th text-right">Action</th>
            </tr></thead>
            <tbody>
              {toReceive.map((po) => (
                <tr key={po.id} className="hover:bg-slate-50/60">
                  <td className="td font-semibold text-brand-600">{po.id}</td>
                  <td className="td font-medium text-ink">{po.supplier}</td>
                  <td className="td text-slate-600">{po.item}</td>
                  <td className="td text-slate-600">{po.qty || 1}</td>
                  <td className="td"><span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600"><FolderKanban size={13} /> {po.project}</span></td>
                  <td className="td font-semibold">{sar(po.amount)}</td>
                  <td className="td"><Badge tone={statusTone(po.shipment || 'Preparing')}>{po.shipment || 'Preparing'}</Badge></td>
                  <td className="td text-right">
                    <button onClick={() => receivePO(po.id)} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-500 hover:text-white">
                      <Truck size={13} /> Receive into Stock
                    </button>
                  </td>
                </tr>
              ))}
              {toReceive.length === 0 && <tr><td className="td text-slate-400" colSpan={8}>No pending receipts.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mt-4 overflow-hidden">
        <div className="border-b border-slate-100 p-4"><h3 className="font-bold text-ink">Received</h3></div>
        <div className="divide-y divide-slate-100">
          {received.map((po) => (
            <div key={po.id} className="flex items-center gap-3 px-4 py-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><CheckCircle2 size={16} /></span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{po.item}</p><p className="text-xs text-muted">{po.id} · {po.supplier}</p></div>
              <span className="text-sm font-semibold text-ink">{sar(po.amount)}</span>
              <Badge tone={statusTone(po.status)}>{po.status}</Badge>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function Stat({ label, value, tone }) {
  return <div className="card card-pad animate-fade-up"><p className="text-xs text-muted">{label}</p><p className={`mt-1 text-2xl font-extrabold ${tone}`}>{value}</p></div>
}
