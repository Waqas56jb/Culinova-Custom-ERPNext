import { useState, useMemo, useEffect } from 'react'
import { X, Printer, Download, FileText, Loader2 } from 'lucide-react'
import { api } from '../api.js'
import { useData } from '../store/DataContext.jsx'
import { QuotationPrintBody, QuotationPrintStyles, buildQuotationPrintModel } from '@shared/QuotationPrint.jsx'

export default function QuotationPreview({ open, onClose, quotation }) {
  const { settings } = useData()
  const [lang, setLang] = useState(quotation?.language === 'ar' ? 'ar' : 'en')
  const [full, setFull] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !quotation?.id) { setFull(null); return }
    setLoading(true)
    api(`/quotations/${quotation.id}`)
      .then((row) => setFull(row))
      .catch(() => setFull(quotation))
      .finally(() => setLoading(false))
  }, [open, quotation?.id])

  // The modal is mounted once (with quotation===null) and only toggled via `open`, so the useState
  // initializer above ran when there was no quotation and locked lang to 'en'. Re-derive the default
  // language every time a different quotation is previewed, otherwise an Arabic quotation always
  // opened in English until the user hit AR by hand.
  useEffect(() => {
    if (open && quotation) setLang(quotation.language === 'ar' ? 'ar' : 'en')
  }, [open, quotation?.id, quotation?.language])

  const company = (settings?.companies || [])[0] || {}
  const vs = settings?.vatSettings || []
  const vatPct = Number(vs.find((v) => v.is_active && v.is_default)?.rate ?? vs.find((v) => v.is_active)?.rate ?? 15)

  const source = full || quotation
  const model = useMemo(() => {
    if (!source) return null
    return buildQuotationPrintModel(source, { vatPct, company })
  }, [source, vatPct, company])

  if (!open || !quotation) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-navy-900/60 backdrop-blur-sm p-3 sm:p-6 print:bg-white print:p-0">
      <QuotationPrintStyles />

      <div className="w-full max-w-[820px] px-1 sm:px-0 animate-fade-up">
        <div className="no-print mb-3 flex items-center justify-between text-white">
          <span className="flex items-center gap-2 text-sm font-semibold"><FileText size={16} /> {(model?.ref || quotation.ref)}.pdf</span>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-white/10 p-0.5">
              <button onClick={() => setLang('en')} className={`rounded-md px-3 py-1 text-xs font-bold ${lang === 'en' ? 'bg-white text-navy-900' : 'text-white/80'}`}>EN</button>
              <button onClick={() => setLang('ar')} className={`rounded-md px-3 py-1 text-xs font-bold ${lang === 'ar' ? 'bg-white text-navy-900' : 'text-white/80'}`}>AR</button>
            </div>
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"><Printer size={14} /> Print</button>
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"><Download size={14} /> Save PDF</button>
            <button onClick={onClose} className="rounded-lg bg-white/10 p-1.5 hover:bg-white/20"><X size={18} /></button>
          </div>
        </div>

        {loading || !model ? (
          <div className="flex items-center justify-center rounded-xl bg-white py-24 text-slate-500">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl shadow-2xl print:rounded-none print:shadow-none">
            <QuotationPrintBody q={model} lang={lang} enLines={model.enLines} />
          </div>
        )}
      </div>
    </div>
  )
}
