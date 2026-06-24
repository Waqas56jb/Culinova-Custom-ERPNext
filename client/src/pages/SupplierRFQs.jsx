import { useState } from 'react'
import { Send, CheckCircle2 } from 'lucide-react'
import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import PortalBanner from '../components/PortalBanner.jsx'
import { Modal, Field } from '../components/Modal.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'

const ME = 'Gulf Kitchen Equip. Co.'

export default function SupplierRFQs() {
  const { rfqs, submitSupplierQuote } = useData()
  const [open, setOpen] = useState(null)
  const [price, setPrice] = useState('')
  const rfq = rfqs.find((r) => r.id === open)
  const myQuote = (r) => r.suppliers?.find((s) => s.name === ME)?.quote

  const submit = () => { submitSupplierQuote(open, ME, price); setOpen(null); setPrice('') }

  return (
    <>
      <PortalBanner who={ME} role="Supplier" />
      <PageHeader title="Quote Requests (RFQ)" subtitle="Submit your best price for CULINOVA's requirements" />

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">RFQ</th><th className="th">Item</th><th className="th">Qty</th>
              <th className="th">My Quote</th><th className="th">Status</th><th className="th text-right">Action</th>
            </tr></thead>
            <tbody>
              {rfqs.map((r) => {
                const q = myQuote(r)
                const ordered = r.status === 'Ordered'
                const won = ordered && r.awarded === ME
                return (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="td font-semibold text-brand-600">{r.id}</td>
                    <td className="td font-medium text-ink">{r.item}</td>
                    <td className="td text-slate-600">{r.qty}</td>
                    <td className="td font-semibold">{q ? sar(q) : <span className="text-slate-300">—</span>}</td>
                    <td className="td"><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
                    <td className="td text-right">
                      {ordered ? (
                        <span className={`chip ${won ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                          {won ? <><CheckCircle2 size={12} /> You won</> : 'Awarded to other'}
                        </span>
                      ) : (
                        <button onClick={() => { setOpen(r.id); setPrice(q || '') }} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-500 hover:text-white">
                          <Send size={13} /> {q ? 'Update Quote' : 'Submit Quote'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={!!rfq} onClose={() => setOpen(null)} title="Submit Quote" subtitle={rfq ? `${rfq.item} · Qty ${rfq.qty}` : ''}
        footer={<><button className="btn-ghost" onClick={() => setOpen(null)}>Cancel</button><button className="btn-primary" onClick={submit}>Submit Quote</button></>}>
        <Field label="Your Price (SAR)" type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 195000" hint="CULINOVA will compare all supplier quotes and award the best value." />
      </Modal>
    </>
  )
}
