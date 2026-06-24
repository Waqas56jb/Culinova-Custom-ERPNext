import { useNavigate } from 'react-router-dom'
import { FileText, Send, ShoppingCart, Wallet, ArrowRight } from 'lucide-react'
import { PageHeader, KpiCard, ChartCard, Badge, statusTone } from '../components/ui.jsx'
import PortalBanner from '../components/PortalBanner.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'

const ME = 'Gulf Kitchen Equip. Co.'

export default function SupplierDashboard() {
  const navigate = useNavigate()
  const { rfqs, purchaseOrders } = useData()
  const hasQuoted = (r) => r.suppliers?.some((s) => s.name === ME)
  const newReq = rfqs.filter((r) => r.status !== 'Ordered' && !hasQuoted(r))
  const submitted = rfqs.filter(hasQuoted)
  const myPOs = purchaseOrders.filter((po) => po.supplier === ME)
  const awarded = myPOs.reduce((s, p) => s + p.amount, 0)

  return (
    <>
      <PortalBanner who={ME} role="Supplier" />
      <PageHeader title="Supplier Dashboard" subtitle="Your quote requests, orders & deliveries with CULINOVA" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="New Quote Requests" value={newReq.length} sub="awaiting your quote" icon={FileText} accent="brand" />
        <KpiCard label="Quotes Submitted" value={submitted.length} sub="under review" icon={Send} accent="gold" />
        <KpiCard label="Active Orders" value={myPOs.filter((p) => p.status !== 'Billed').length} sub="POs awarded" icon={ShoppingCart} accent="violet" />
        <KpiCard label="Awarded Value" value={sar(awarded)} sub="total business" icon={Wallet} accent="emerald" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Quote Requests to Respond" action={<button onClick={() => navigate('/supplier/rfqs')} className="text-xs font-semibold text-brand-600">View all</button>}>
          <div className="divide-y divide-slate-100">
            {newReq.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center gap-3 py-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600"><FileText size={16} /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{r.item}</p><p className="text-xs text-muted">{r.id} · Qty {r.qty}</p></div>
                <button onClick={() => navigate('/supplier/rfqs')} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600">Quote <ArrowRight size={12} /></button>
              </div>
            ))}
            {newReq.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No new requests</p>}
          </div>
        </ChartCard>

        <ChartCard title="My Recent Orders" action={<button onClick={() => navigate('/supplier/orders')} className="text-xs font-semibold text-brand-600">View all</button>}>
          <div className="divide-y divide-slate-100">
            {myPOs.slice(0, 5).map((po) => (
              <div key={po.id} className="flex items-center gap-3 py-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-violet-50 text-violet-600"><ShoppingCart size={16} /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{po.id} · {sar(po.amount)}</p><p className="truncate text-xs text-muted">{po.item}</p></div>
                <Badge tone={statusTone(po.status)}>{po.status}</Badge>
              </div>
            ))}
            {myPOs.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No orders yet</p>}
          </div>
        </ChartCard>
      </div>
    </>
  )
}
