import { useState } from 'react'
import { Send, CheckCircle2, Award } from 'lucide-react'
import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import { Modal } from '../components/Modal.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'

export default function RFQs() {
  const { rfqs, requestQuotes, awardPO } = useData()
  const [open, setOpen] = useState(null)
  const rfq = rfqs.find((r) => r.id === open)
  const best = rfq?.suppliers?.length ? Math.min(...rfq.suppliers.map((s) => s.quote)) : null

  return (
    <>
      <PageHeader title="Requests for Quotation (RFQ)" subtitle="Send to suppliers, compare quotes & award the best" />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total RFQs" value={rfqs.length} tone="text-ink" />
        <Stat label="Open" value={rfqs.filter((r) => r.status === 'Open').length} tone="text-blue-600" />
        <Stat label="Quoted" value={rfqs.filter((r) => r.status === 'Quoted').length} tone="text-amber-600" />
        <Stat label="Ordered" value={rfqs.filter((r) => r.status === 'Ordered').length} tone="text-emerald-600" />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">RFQ</th><th className="th">Item</th><th className="th">Project</th><th className="th">Qty</th>
              <th className="th">Quotes</th><th className="th">Status</th><th className="th text-right">Action</th>
            </tr></thead>
            <tbody>
              {rfqs.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="td font-semibold text-brand-600">{r.ref}</td>
                  <td className="td font-medium text-ink">{r.item}</td>
                  <td className="td"><span className="text-xs font-semibold text-violet-600">{r.project}</span></td>
                  <td className="td text-slate-600">{r.qty}</td>
                  <td className="td text-slate-600">{r.suppliers?.length || 0}</td>
                  <td className="td"><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
                  <td className="td text-right">
                    {r.status === 'Open' ? (
                      <button onClick={() => requestQuotes(r.id)} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-500 hover:text-white"><Send size={13} /> Request Quotes</button>
                    ) : r.status === 'Ordered' ? (
                      <span className="chip bg-emerald-50 text-emerald-600"><CheckCircle2 size={12} /> {r.awarded}</span>
                    ) : (
                      <button onClick={() => setOpen(r.id)} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-500 hover:text-white"><Award size={13} /> Compare &amp; Award</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* comparison + award modal */}
      <Modal open={!!rfq} onClose={() => setOpen(null)} title={`Compare Quotes · ${rfq?.id || ''}`} subtitle={rfq ? `${rfq.item} · ${rfq.project}` : ''}
        footer={<button className="btn-ghost" onClick={() => setOpen(null)}>Close</button>}>
        {rfq && (
          <div className="space-y-2">
            {[...rfq.suppliers].sort((a, b) => a.quote - b.quote).map((s) => {
              const isBest = s.quote === best
              return (
                <div key={s.name} className={`flex items-center gap-3 rounded-xl border p-3 ${isBest ? 'border-brand-300 bg-brand-50' : 'border-slate-200'}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{s.name}</p>
                    {isBest && <span className="text-[11px] font-semibold text-brand-600">Lowest quote · best value</span>}
                  </div>
                  <span className="text-sm font-bold text-ink">{sar(s.quote)}</span>
                  <button onClick={() => { awardPO(rfq, s); setOpen(null) }} className="btn-primary !py-1.5 !px-3 text-xs"><Award size={13} /> Award PO</button>
                </div>
              )
            })}
            <p className="pt-2 text-xs text-muted">Awarding creates a Purchase Order and pushes the cost into the linked project (updating its Actual Cost &amp; GP).</p>
          </div>
        )}
      </Modal>
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
