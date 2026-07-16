import { useMemo } from 'react'
import { X, Printer, Download, FileText } from 'lucide-react'
import { QuotationPrintBody, QuotationPrintStyles, buildQuotationPrintModel } from '@shared/QuotationPrint.jsx'

// Read-only quotation PDF for the admin approval flow (takes the raw quotation row).
export default function QuotationDoc({ open, onClose, q }) {
  const model = useMemo(() => {
    if (!q) return null
    return buildQuotationPrintModel(q, { vatPct: 15 })
  }, [q])

  if (!open || !q || !model) return null

  return (
    <div className="fixed inset-0 z-[95] flex items-start justify-center overflow-y-auto bg-navy-900/60 p-3 backdrop-blur-sm sm:p-6 print:bg-white print:p-0">
      <QuotationPrintStyles />

      <div className="w-full max-w-[820px] px-1 sm:px-0 animate-fade-up">
        <div className="no-print mb-3 flex items-center justify-between text-white">
          <span className="flex items-center gap-2 text-sm font-semibold"><FileText size={16} /> {model.ref}.pdf</span>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"><Printer size={14} /> Print</button>
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"><Download size={14} /> Save PDF</button>
            <button onClick={onClose} className="rounded-lg bg-white/10 p-1.5 hover:bg-white/20"><X size={18} /></button>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl shadow-2xl print:rounded-none print:shadow-none">
          <QuotationPrintBody q={model} lang="en" enLines={model.enLines} />
        </div>
      </div>
    </div>
  )
}
