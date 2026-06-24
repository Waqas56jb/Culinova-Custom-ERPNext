import { Truck, FolderKanban } from 'lucide-react'
import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import PortalBanner from '../components/PortalBanner.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'

const ME = 'Gulf Kitchen Equip. Co.'
const stages = ['Preparing', 'Shipped', 'Delivered']

export default function SupplierDeliveries() {
  const { purchaseOrders, setShipment } = useData()
  const myPOs = purchaseOrders.filter((po) => po.supplier === ME && po.accepted)

  return (
    <>
      <PortalBanner who={ME} role="Supplier" />
      <PageHeader title="Deliveries" subtitle="Update the shipment status of your accepted orders" />

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">PO</th><th className="th">Item</th><th className="th">Project</th>
              <th className="th">Value</th><th className="th">Shipment</th><th className="th">Update</th>
            </tr></thead>
            <tbody>
              {myPOs.map((po) => {
                const ship = po.shipment || 'Preparing'
                return (
                  <tr key={po.id} className="hover:bg-slate-50/60">
                    <td className="td font-semibold text-brand-600">{po.id}</td>
                    <td className="td font-medium text-ink">{po.item}</td>
                    <td className="td"><span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600"><FolderKanban size={13} /> {po.project}</span></td>
                    <td className="td font-semibold">{sar(po.amount)}</td>
                    <td className="td"><Badge tone={statusTone(ship)}>{ship}</Badge></td>
                    <td className="td">
                      <select value={ship} onChange={(e) => setShipment(po.id, e.target.value)}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium outline-none focus:border-brand-400 focus:bg-white">
                        {stages.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                  </tr>
                )
              })}
              {myPOs.length === 0 && <tr><td className="td text-slate-400" colSpan={6}>No accepted orders to deliver. Accept an order first.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700">
        <Truck size={18} className="shrink-0" />
        <span>When you mark an order <b>Delivered</b>, CULINOVA's Warehouse team is notified to receive the goods.</span>
      </div>
    </>
  )
}
