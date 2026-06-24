import { useNavigate } from 'react-router-dom'
import { FileText, Send, ShoppingCart, Wallet, ArrowRight } from 'lucide-react'
import { PageHeader, KpiCard, ChartCard, Badge, statusTone, sar } from '../components/ui.jsx'
import { useSupplier } from '../store/SupplierContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { rfqs, orders } = useSupplier()
  const newReq = rfqs.filter((r) => r.status === 'Open')
  const submitted = rfqs.filter((r) => r.status === 'Quoted')
  const awarded = orders.reduce((s, o) => s + o.amount, 0)

  return (
    <>
      <div className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-r from-navy-900 to-gold-600 p-6 text-white shadow-card animate-fade-up">
        <h1 className="font-display text-2xl font-extrabold">{user?.name}</h1>
        <p className="mt-1 text-sm text-gold-100/90">Your quote requests, purchase orders and deliveries with CULINOVA.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="New Quote Requests" value={newReq.length} sub="awaiting your quote" icon={FileText} accent="brand" />
        <KpiCard label="Quotes Submitted" value={submitted.length} sub="under review" icon={Send} accent="gold" />
        <KpiCard label="Active Orders" value={orders.filter((o) => o.status !== 'Billed').length} sub="awarded POs" icon={ShoppingCart} accent="violet" />
        <KpiCard label="Awarded Value" value={sar(awarded)} sub="total business" icon={Wallet} accent="emerald" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Quote Requests to Respond" action={<button onClick={() => navigate('/rfqs')} className="text-xs font-semibold text-brand-600">View all</button>}>
          <div className="divide-y divide-slate-100">
            {newReq.map((r) => (
              <div key={r.id} className="flex items-center gap-3 py-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600"><FileText size={16} /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{r.item}</p><p className="text-xs text-muted">{r.id} · Qty {r.qty} · due {r.due}</p></div>
                <button onClick={() => navigate('/rfqs')} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600">Quote <ArrowRight size={12} /></button>
              </div>
            ))}
            {newReq.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No new requests</p>}
          </div>
        </ChartCard>

        <ChartCard title="My Orders" action={<button onClick={() => navigate('/orders')} className="text-xs font-semibold text-brand-600">View all</button>}>
          <div className="divide-y divide-slate-100">
            {orders.map((o) => (
              <div key={o.id} className="flex items-center gap-3 py-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-violet-50 text-violet-600"><ShoppingCart size={16} /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{o.id} · {sar(o.amount)}</p><p className="truncate text-xs text-muted">{o.item}</p></div>
                <Badge tone={statusTone(o.status)}>{o.status}</Badge>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>
    </>
  )
}
