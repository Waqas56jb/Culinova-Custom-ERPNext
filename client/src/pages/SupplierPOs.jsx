import { CheckCircle2, FolderKanban } from 'lucide-react'
import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import PortalBanner from '../components/PortalBanner.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'

const ME = 'Gulf Kitchen Equip. Co.'

export default function SupplierPOs() {
  const { purchaseOrders, acceptPO } = useData()
  const myPOs = purchaseOrders.filter((po) => po.supplier === ME)
  const total = myPOs.reduce((s, p) => s + p.amount, 0)

  return (
    <>
      <PortalBanner who={ME} role="Supplier" />
      <PageHeader title="My Purchase Orders" subtitle="Orders awarded to you by CULINOVA" />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Total Orders" value={myPOs.length} tone="text-ink" />
        <Stat label="Order Value" value={sar(total)} tone="text-brand-600" />
        <Stat label="To Accept" value={myPOs.filter((p) => !p.accepted).length} tone="text-amber-600" />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">PO</th><th className="th">Item</th><th className="th">Project</th><th className="th">Amount</th>
              <th className="th">Date</th><th className="th">Status</th><th className="th text-right">Action</th>
            </tr></thead>
            <tbody>
              {myPOs.map((po) => (
                <tr key={po.id} className="hover:bg-slate-50/60">
                  <td className="td font-semibold text-brand-600">{po.id}</td>
                  <td className="td font-medium text-ink">{po.item}</td>
                  <td className="td"><span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600"><FolderKanban size={13} /> {po.project}</span></td>
                  <td className="td font-semibold">{sar(po.amount)}</td>
                  <td className="td text-slate-500">{po.date}</td>
                  <td className="td"><Badge tone={statusTone(po.status)}>{po.status}</Badge></td>
                  <td className="td text-right">
                    {po.accepted ? (
                      <span className="chip bg-emerald-50 text-emerald-600"><CheckCircle2 size={12} /> Accepted</span>
                    ) : (
                      <button onClick={() => acceptPO(po.id)} className="rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-500 hover:text-white">Accept Order</button>
                    )}
                  </td>
                </tr>
              ))}
              {myPOs.length === 0 && <tr><td className="td text-slate-400" colSpan={7}>No orders yet.</td></tr>}
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
