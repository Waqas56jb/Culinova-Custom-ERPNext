import { X, Printer, Download, FileText } from 'lucide-react'
import { sar } from '../data/mockData.js'

export default function QuotationPreview({ open, onClose, quotation }) {
  if (!open || !quotation) return null
  // Use the ACTUAL BOQ items entered by the salesperson (no auto-invented items)
  const src = quotation.items?.length
    ? quotation.items
    : [{ name: 'As per attached BOQ', qty: 1, rate: (Number(quotation.amount) || 0) / 1.15 }]
  const items = src.map((it, i) => ({
    idx: i + 1, name: it.name, qty: Number(it.qty) || 0, rate: Number(it.rate) || 0,
    amount: (Number(it.qty) || 0) * (Number(it.rate) || 0),
  }))
  const net = items.reduce((s, it) => s + it.amount, 0)
  const vat = net * 0.15
  const total = net + vat

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-navy-900/60 backdrop-blur-sm p-3 sm:p-6">
      <div className="w-full max-w-3xl animate-fade-up">
        {/* toolbar */}
        <div className="mb-3 flex items-center justify-between text-white">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <FileText size={16} /> {quotation.id}.pdf
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"><Printer size={14} /> Print</button>
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"><Download size={14} /> Save PDF</button>
            <button onClick={onClose} className="rounded-lg bg-white/10 p-1.5 hover:bg-white/20"><X size={18} /></button>
          </div>
        </div>

        {/* the "PDF page" */}
        <div className="overflow-hidden rounded-xl bg-white shadow-2xl">
          {/* letterhead */}
          <div className="flex items-start justify-between bg-gradient-to-br from-navy-900 to-navy-700 p-7 text-white">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-gold-500 font-display text-xl font-extrabold text-navy-900">C</div>
              <div>
                <p className="font-display text-xl font-extrabold tracking-wide">CULINOVA</p>
                <p className="text-[11px] text-brand-300/80">Commercial Kitchen Solutions · Riyadh, KSA</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-display text-2xl font-extrabold tracking-wide">QUOTATION</p>
              <p className="text-xs text-slate-300">{quotation.id}</p>
            </div>
          </div>

          <div className="p-7">
            {/* meta */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Bill To</p>
                <p className="mt-1 text-sm font-bold text-ink">{quotation.customer}</p>
                {quotation.email && <p className="text-xs text-slate-500">{quotation.email}</p>}
                <p className="text-xs text-slate-500">Kingdom of Saudi Arabia</p>
              </div>
              <div className="text-right text-xs text-slate-500">
                <p><span className="font-semibold text-ink">Date:</span> {new Date().toISOString().slice(0, 10)}</p>
                <p><span className="font-semibold text-ink">Valid Till:</span> {quotation.valid || '—'}</p>
                <p><span className="font-semibold text-ink">Prepared By:</span> {quotation.owner || 'Ahmed'}</p>
                <p><span className="font-semibold text-ink">VAT No:</span> 3001234567800003</p>
              </div>
            </div>

            {/* items */}
            <table className="mt-6 w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-center">Qty</th>
                  <th className="px-3 py-2 text-right">Unit Rate</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.idx} className="border-b border-slate-100">
                    <td className="px-3 py-2.5 text-slate-400">{it.idx}</td>
                    <td className="px-3 py-2.5 font-medium text-ink">{it.name}</td>
                    <td className="px-3 py-2.5 text-center text-slate-600">{it.qty}</td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{sar(Math.round(it.rate))}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-ink">{sar(Math.round(it.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* totals */}
            <div className="mt-5 flex justify-end">
              <div className="w-64 space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-600"><span>Subtotal (Net)</span><span>{sar(Math.round(net))}</span></div>
                <div className="flex justify-between text-slate-600"><span>VAT (15%)</span><span>{sar(Math.round(vat))}</span></div>
                <div className="mt-1 flex justify-between rounded-lg bg-brand-50 px-3 py-2 text-base font-extrabold text-brand-700">
                  <span>Total</span><span>{sar(total)}</span>
                </div>
              </div>
            </div>

            {/* terms */}
            <div className="mt-7 border-t border-slate-100 pt-4 text-[11px] leading-relaxed text-slate-500">
              <p className="mb-1 font-semibold text-ink">Terms &amp; Conditions</p>
              <p>• Prices are in SAR and inclusive of 15% VAT. • Validity: 30 days from quotation date. • Payment: 50% advance, 50% on delivery. • Delivery &amp; installation as per agreed schedule. • Warranty: 12 months on supplied equipment.</p>
              <p className="mt-3 text-slate-400">This is a system-generated quotation by CULINOVA ERP. ZATCA-compliant tax invoice will be issued on order confirmation.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
