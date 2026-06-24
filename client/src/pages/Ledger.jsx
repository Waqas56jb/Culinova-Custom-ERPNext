import { useState } from 'react'
import { Coins, CheckCircle2 } from 'lucide-react'
import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import { Modal, Field } from '../components/Modal.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'

export default function Ledger() {
  const { invoices, payables, recordPayment, paySupplier } = useData()
  const ar = invoices.filter((i) => i.total - i.paid > 0)
  const ap = payables.filter((p) => p.amount - p.paid > 0)
  const totalAR = ar.reduce((s, i) => s + (i.total - i.paid), 0)
  const totalAP = ap.reduce((s, p) => s + (p.amount - p.paid), 0)
  const [pay, setPay] = useState(null)
  const [amt, setAmt] = useState('')
  const inv = invoices.find((i) => i.id === pay)

  return (
    <>
      <PageHeader title="Receivables & Payables" subtitle="Who owes us · who we owe" />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat label="Receivables (AR)" value={sar(totalAR)} tone="text-amber-600" sub={`${ar.length} customers`} />
        <Stat label="Payables (AP)" value={sar(totalAP)} tone="text-rose-600" sub={`${ap.length} suppliers`} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* AR */}
        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 p-4"><h3 className="font-bold text-ink">Accounts Receivable</h3><p className="text-xs text-muted">Customers to collect from</p></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px]">
              <thead><tr className="bg-slate-50/60"><th className="th">Invoice</th><th className="th">Customer</th><th className="th">Balance</th><th className="th text-right">Action</th></tr></thead>
              <tbody>
                {ar.map((i) => (
                  <tr key={i.id} className="hover:bg-slate-50/60">
                    <td className="td font-semibold text-brand-600">{i.id}</td>
                    <td className="td text-ink">{i.customer}</td>
                    <td className="td font-semibold text-rose-600">{sar(i.total - i.paid)}</td>
                    <td className="td text-right"><button onClick={() => { setPay(i.id); setAmt(i.total - i.paid) }} className="rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-500 hover:text-white">Collect</button></td>
                  </tr>
                ))}
                {ar.length === 0 && <tr><td className="td text-slate-400" colSpan={4}>All collected ✓</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* AP */}
        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 p-4"><h3 className="font-bold text-ink">Accounts Payable</h3><p className="text-xs text-muted">Suppliers to pay</p></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px]">
              <thead><tr className="bg-slate-50/60"><th className="th">Bill</th><th className="th">Supplier</th><th className="th">Balance</th><th className="th text-right">Action</th></tr></thead>
              <tbody>
                {ap.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60">
                    <td className="td font-semibold text-brand-600">{p.id}</td>
                    <td className="td text-ink">{p.supplier}</td>
                    <td className="td font-semibold text-rose-600">{sar(p.amount - p.paid)}</td>
                    <td className="td text-right"><button onClick={() => paySupplier(p.id)} className="rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-500 hover:text-white">Pay</button></td>
                  </tr>
                ))}
                {ap.length === 0 && <tr><td className="td text-slate-400" colSpan={4}>Nothing payable ✓</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal open={!!inv} onClose={() => setPay(null)} title="Collect Payment" subtitle={inv ? `${inv.id} · ${inv.customer}` : ''}
        footer={<><button className="btn-ghost" onClick={() => setPay(null)}>Cancel</button><button className="btn-primary" onClick={() => { recordPayment(pay, amt); setPay(null) }}><Coins size={15} /> Record</button></>}>
        {inv && <><div className="mb-2 flex justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"><span className="text-muted">Outstanding</span><span className="font-bold">{sar(inv.total - inv.paid)}</span></div><Field label="Amount (SAR)" type="number" value={amt} onChange={(e) => setAmt(e.target.value)} /></>}
      </Modal>
    </>
  )
}

function Stat({ label, value, tone, sub }) {
  return <div className="card card-pad animate-fade-up"><p className="text-xs text-muted">{label}</p><p className={`mt-1 text-2xl font-extrabold ${tone}`}>{value}</p>{sub && <p className="text-xs text-muted">{sub}</p>}</div>
}
