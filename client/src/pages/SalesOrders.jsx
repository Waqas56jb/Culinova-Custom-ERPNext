import { useState } from 'react'
import { Plus, FolderKanban, FileText, CheckCircle2 } from 'lucide-react'
import { PageHeader } from '../components/ui.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'
import QuotationPreview from '../components/QuotationPreview.jsx'

export default function SalesOrders() {
  const { salesOrders, quotations, openForm } = useData()
  const [preview, setPreview] = useState(null)
  const total = salesOrders.reduce((s, o) => s + o.amount, 0)
  const delivered = salesOrders.filter((o) => o.boqTotal > 0 && o.boqDone >= o.boqTotal).length
  const inProgress = salesOrders.length - delivered

  const viewPdf = (o) => { const q = quotations.find((x) => x.id === o.quotation_id); if (q) setPreview(q); else alert('Quotation document not available.') }

  return (
    <>
      <PageHeader title="Sales Orders" subtitle="Confirmed orders — auto-linked to Projects with live installation tracking">
        <button className="btn-primary" onClick={() => openForm('order')}><Plus size={16} /> New Order</button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total Orders" value={salesOrders.length} tone="text-ink" />
        <Stat label="Order Value" value={sar(total)} tone="text-brand-600" />
        <Stat label="In Progress" value={inProgress} tone="text-amber-600" />
        <Stat label="Delivered" value={delivered} tone="text-emerald-600" />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead>
              <tr className="bg-slate-50/60">
                <th className="th">Order</th><th className="th">Customer</th><th className="th">Amount</th>
                <th className="th">Project</th><th className="th">Installation Tracking</th><th className="th text-right">Document</th>
              </tr>
            </thead>
            <tbody>
              {salesOrders.map((o) => {
                const done = o.boqTotal > 0 && o.boqDone >= o.boqTotal
                return (
                  <tr key={o.id} className="hover:bg-slate-50/60">
                    <td className="td font-semibold text-brand-600">{o.ref}</td>
                    <td className="td font-medium text-ink">{o.customer}</td>
                    <td className="td font-semibold">{sar(o.amount)}</td>
                    <td className="td"><span className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600"><FolderKanban size={13} /> {o.projectNo || '—'}</span></td>
                    <td className="td">
                      {o.boqTotal > 0 ? (
                        <div className="w-44">
                          <div className="mb-1 flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-ink">{o.boqDone}/{o.boqTotal} installed</span>
                            {done ? <span className="inline-flex items-center gap-1 font-bold text-emerald-600"><CheckCircle2 size={12} /> Delivered</span> : <span className="text-slate-400">{o.progress}%</span>}
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-slate-100"><div className={`h-1.5 rounded-full transition-all ${done ? 'bg-emerald-500' : 'bg-brand-500'}`} style={{ width: `${o.progress}%` }} /></div>
                        </div>
                      ) : <span className="text-xs text-slate-400">Awaiting items</span>}
                    </td>
                    <td className="td text-right">
                      <button onClick={() => viewPdf(o)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50"><FileText size={13} /> View PDF</button>
                    </td>
                  </tr>
                )
              })}
              {salesOrders.length === 0 && <tr><td className="td text-slate-400" colSpan={6}>No orders yet. Orders appear automatically when a customer accepts a quotation.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <QuotationPreview open={!!preview} onClose={() => setPreview(null)} quotation={preview} />
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
