import { useState, useMemo } from 'react'
import { X, Printer, Download, FileText } from 'lucide-react'
import { QuotationPrintBody, QuotationPrintStyles, buildQuotationPrintModel } from '@shared/QuotationPrint.jsx'

export default function QuotationDoc({ open, onClose, quotation }) {
  const [lang, setLang] = useState(quotation?.language === 'ar' ? 'ar' : 'en')

  const model = useMemo(() => {
    if (!quotation) return null
    return buildQuotationPrintModel(quotation, { vatPct: 15 })
  }, [quotation])

  if (!open || !quotation || !model) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-navy-900/60 backdrop-blur-sm p-3 sm:p-6 print:bg-white print:p-0">
      <QuotationPrintStyles />

      <div className="w-full max-w-[820px] px-1 sm:px-0 animate-fade-up">
        <div className="no-print mb-3 flex items-center justify-between text-white">
          <span className="flex items-center gap-2 text-sm font-semibold"><FileText size={16} /> {model.ref}.pdf</span>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-white/10 p-0.5">
              <button type="button" onClick={() => setLang('en')} className={`rounded-md px-3 py-1 text-xs font-bold ${lang === 'en' ? 'bg-white text-navy-900' : 'text-white/80'}`}>EN</button>
              <button type="button" onClick={() => setLang('ar')} className={`rounded-md px-3 py-1 text-xs font-bold ${lang === 'ar' ? 'bg-white text-navy-900' : 'text-white/80'}`}>AR</button>
            </div>
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"><Printer size={14} /> Print</button>
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"><Download size={14} /> Save PDF</button>
            <button type="button" onClick={onClose} className="rounded-lg bg-white/10 p-1.5 hover:bg-white/20"><X size={18} /></button>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl shadow-2xl print:rounded-none print:shadow-none">
          <QuotationPrintBody q={model} lang={lang} enLines={model.enLines} />
        </div>
      </div>
    </div>
  )
}
