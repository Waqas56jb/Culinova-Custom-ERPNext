import { FolderKanban } from 'lucide-react'
import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'

export default function PurchaseOrders() {
  const { purchaseOrders, updatePOStatus } = useData()
  const total = purchaseOrders.reduce((s, p) => s + p.amount, 0)

  return (
    <>
      <PageHeader title="Purchase Orders" subtitle="Issued orders · cost flows into the linked project" />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total POs" value={purchaseOrders.length} tone="text-ink" />
        <Stat label="PO Value" value={sar(total)} tone="text-brand-600" />
        <Stat label="Pending" value={purchaseOrders.filter((p) => p.status === 'Pending').length} tone="text-amber-600" />
        <Stat label="Received" value={purchaseOrders.filter((p) => p.status === 'Received').length} tone="text-emerald-600" />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">PO</th><th className="th">Supplier</th><th className="th">Item</th><th className="th">Project</th>
              <th className="th">Cost</th><th className="th">Date</th><th className="th">Status</th><th className="th">Update</th>
            </tr></thead>
            <tbody>
              {purchaseOrders.map((po) => (
                <tr key={po.id} className="hover:bg-slate-50/60">
                  <td className="td font-semibold text-brand-600">{po.ref}</td>
                  <td className="td font-medium text-ink">{po.supplier}</td>
                  <td className="td text-slate-600">{po.item}</td>
                  <td className="td"><span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600"><FolderKanban size={13} /> {po.project}</span></td>
                  <td className="td font-semibold">{sar(po.amount)}</td>
                  <td className="td text-slate-500">{po.date}</td>
                  <td className="td"><Badge tone={statusTone(po.status)}>{po.status}</Badge></td>
                  <td className="td">
                    <select value={po.status} onChange={(e) => updatePOStatus(po.id, e.target.value)}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium outline-none focus:border-brand-400 focus:bg-white">
                      {['Pending', 'Received', 'Billed'].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
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
