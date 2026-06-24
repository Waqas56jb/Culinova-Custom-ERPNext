import { useState } from 'react'
import { Send, CheckCircle2 } from 'lucide-react'
import { PageHeader, Badge, statusTone, sar } from '../components/ui.jsx'
import { Modal, Field } from '../components/Modal.jsx'
import { useSupplier } from '../store/SupplierContext.jsx'

export default function RFQs() {
  const { rfqs, submitQuote } = useSupplier()
  const [open, setOpen] = useState(null)
  const [price, setPrice] = useState('')
  const rfq = rfqs.find((r) => r.id === open)
  const submit = () => { submitQuote(open, price); setOpen(null); setPrice('') }

  return (
    <>
      <PageHeader title="Quote Requests (RFQ)" subtitle="Submit your best price for CULINOVA's requirements" />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total" value={rfqs.length} tone="text-ink" />
        <Stat label="Open" value={rfqs.filter((r) => r.status === 'Open').length} tone="text-blue-600" />
        <Stat label="Quoted" value={rfqs.filter((r) => r.status === 'Quoted').length} tone="text-amber-600" />
        <Stat label="Awarded" value={rfqs.filter((r) => r.status === 'Awarded').length} tone="text-emerald-600" />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">RFQ</th><th className="th">Item</th><th className="th">Qty</th><th className="th">My Quote</th>
              <th className="th">Due</th><th className="th">Status</th><th className="th text-right">Action</th>
            </tr></thead>
            <tbody>
              {rfqs.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="td font-semibold text-brand-600">{r.id}</td>
                  <td className="td font-medium text-ink">{r.item}</td>
                  <td className="td text-slate-600">{r.qty}</td>
                  <td className="td font-semibold">{r.myQuote ? sar(r.myQuote) : <span className="text-slate-300">—</span>}</td>
                  <td className="td text-slate-500">{r.due}</td>
                  <td className="td"><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
                  <td className="td text-right">
                    {r.status === 'Awarded' ? (
                      <span className="chip bg-emerald-50 text-emerald-600"><CheckCircle2 size={12} /> You won</span>
                    ) : (
                      <button onClick={() => { setOpen(r.id); setPrice(r.myQuote || '') }} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-500 hover:text-white"><Send size={13} /> {r.myQuote ? 'Update Quote' : 'Submit Quote'}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={!!rfq} onClose={() => setOpen(null)} title="Submit Quote" subtitle={rfq ? `${rfq.item} · Qty ${rfq.qty}` : ''}
        footer={<><button className="btn-ghost" onClick={() => setOpen(null)}>Cancel</button><button className="btn-primary" onClick={submit}>Submit Quote</button></>}>
        <Field label="Your Price (SAR)" type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 195000" hint="CULINOVA compares all supplier quotes and awards the best value." />
      </Modal>
    </>
  )
}

function Stat({ label, value, tone }) {
  return <div className="card card-pad animate-fade-up"><p className="text-xs text-muted">{label}</p><p className={`mt-1 text-2xl font-extrabold ${tone}`}>{value}</p></div>
}
