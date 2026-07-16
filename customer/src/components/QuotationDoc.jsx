import { useState } from 'react'
import { X, Printer, Download, FileText, ExternalLink } from 'lucide-react'
import { sar } from './ui.jsx'

const fmt = (n) => sar(Math.round(Number(n) || 0))
const fmtDec = (n) => Number(n || 0).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function parseSpecs(raw) {
  if (!raw) return []
  let t = String(raw)
  if (t.trim().startsWith('{')) {
    try {
      return Object.entries(JSON.parse(t))
        .filter(([k]) => !['source', 'eos_entry_id'].includes(k))
        .map(([, v]) => String(v))
    } catch { /* fall through */ }
  }
  t = t.replace(/<[^>]*>/g, '\n').replace(/\*\*/g, '')
  return t.split(/\n|•|·|\.\s+(?=[A-Z*])/).map((s) => s.trim()).filter(Boolean).slice(0, 8)
}

export default function QuotationDoc({ open, onClose, quotation }) {
  const [lang, setLang] = useState(quotation?.language === 'ar' ? 'ar' : 'en')
  if (!open || !quotation) return null
  const q = quotation
  const rtl = lang === 'ar'
  const headerDisc = Number(q.discount_pct) || 0

  const items = (q.items || []).map((it, i) => {
    const qty = Number(it.qty) || 0
    const rate = Number(it.rate) || 0
    const disc = Number(it.discount_pct) > 0 ? Number(it.discount_pct) : headerDisc
    const netPrice = rate * (1 - disc / 100)
    const amount = it.amount != null ? Number(it.amount) : qty * netPrice
    return { idx: i + 1, ...it, qty, rate, disc, netPrice, amount, specs: parseSpecs(it.specifications || it.description) }
  })

  const net = q.net || items.reduce((s, it) => s + it.amount, 0)
  const disc = Number(q.discount_amount) || 0
  const vat = Number(q.vat) || 0
  const total = Number(q.total) || q.amount || 0

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-navy-900/60 backdrop-blur-sm p-3 sm:p-6">
      <div className="w-full max-w-4xl animate-fade-up">
        <div className="mb-3 flex items-center justify-between text-white">
          <span className="flex items-center gap-2 text-sm font-semibold"><FileText size={16} /> {q.ref}.pdf</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20">{lang === 'en' ? 'العربية' : 'English'}</button>
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"><Printer size={14} /> Print</button>
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"><Download size={14} /> Save PDF</button>
            <button type="button" onClick={onClose} className="rounded-lg bg-white/10 p-1.5 hover:bg-white/20"><X size={18} /></button>
          </div>
        </div>

        <div className={`overflow-hidden rounded-xl bg-white shadow-2xl ${rtl ? 'text-right' : ''}`} dir={rtl ? 'rtl' : 'ltr'}>
          <div className="flex items-start justify-between bg-gradient-to-br from-navy-900 to-navy-700 p-7 text-white">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-gold-500 font-display text-xl font-extrabold text-navy-900">C</div>
              <div>
                <p className="font-display text-xl font-extrabold tracking-wide">CULINOVA</p>
                <p className="text-[11px] text-brand-300/80">Commercial Kitchen Solutions · Riyadh, KSA</p>
              </div>
            </div>
            <div className={rtl ? 'text-left' : 'text-right'}>
              <p className="font-display text-2xl font-extrabold tracking-wide">{lang === 'ar' ? 'عرض سعر' : 'QUOTATION'}</p>
              <p className="text-xs text-slate-300">{q.ref}</p>
            </div>
          </div>

          <div className="p-7">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{lang === 'ar' ? 'إلى' : 'Bill To'}</p>
                <p className="mt-1 text-sm font-bold text-ink">{q.customer}</p>
                {q.contact_person && <p className="text-xs text-slate-500">{lang === 'ar' ? 'جهة الاتصال' : 'Attn'}: {q.contact_person}</p>}
                {q.project && q.project !== '—' && <p className="text-xs text-slate-500">{lang === 'ar' ? 'المشروع' : 'Project'}: {q.project}</p>}
                {q.location && <p className="text-xs text-slate-500">{q.location}</p>}
                {q.area && <p className="text-xs text-slate-500">{lang === 'ar' ? 'المنطقة' : 'Area'}: {q.area}</p>}
              </div>
              <div className={`text-xs text-slate-500 ${rtl ? 'text-left' : 'text-right'}`}>
                <p><span className="font-semibold text-ink">{lang === 'ar' ? 'التاريخ' : 'Date'}:</span> {q.date}</p>
                <p><span className="font-semibold text-ink">{lang === 'ar' ? 'صلاحية العرض' : 'Valid Till'}:</span> {q.valid_till || '—'}</p>
                {q.sales_consultant && <p><span className="font-semibold text-ink">{lang === 'ar' ? 'مستشار المبيعات' : 'Sales Consultant'}:</span> {q.sales_consultant}</p>}
                <p><span className="font-semibold text-ink">{lang === 'ar' ? 'الحالة' : 'Status'}:</span> {q.status}</p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/60 p-4 text-xs leading-relaxed text-slate-600">
              <p className="font-semibold text-ink">{lang === 'ar' ? 'عميلنا العزيز،' : 'Dear Valued Customer,'}</p>
              <p className="mt-1">{lang === 'ar'
                ? 'يسعدنا تقديم عرض السعر المطلوب. هذا المستند عرض سعر فقط — يتطلب الدفع/القبول لتأكيد الطلب.'
                : 'We are pleased to present the quotation you requested. This document is a quotation only — payment/acceptance confirms your order.'}</p>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="bg-slate-100 text-[10px] uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2 text-left">#</th>
                    <th className="px-2 py-2 text-left">{lang === 'ar' ? 'الوصف' : 'Description'}</th>
                    <th className="px-2 py-2 text-center">{lang === 'ar' ? 'الكمية' : 'Qty'}</th>
                    <th className="px-2 py-2 text-right">{lang === 'ar' ? 'السعر' : 'Rate'}</th>
                    <th className="px-2 py-2 text-right">{lang === 'ar' ? 'خصم %' : 'Disc %'}</th>
                    <th className="px-2 py-2 text-right">{lang === 'ar' ? 'الإجمالي' : 'Amount'}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.idx} className="border-b border-slate-100 align-top">
                      <td className="px-2 py-3 text-slate-400">{it.idx}</td>
                      <td className="px-2 py-3">
                        <div className="flex gap-3">
                          {it.image_url && <img src={it.image_url} alt="" className="h-14 w-14 shrink-0 rounded-lg border border-slate-100 object-cover" />}
                          <div className="min-w-0">
                            <p className="font-semibold text-ink">{it.name}</p>
                            <p className="text-[11px] text-slate-500">{[it.brand, it.model, it.item_code].filter(Boolean).join(' · ')}</p>
                            {it.specs.length > 0 && (
                              <ul className="mt-1 list-inside list-disc text-[10px] text-slate-400">
                                {it.specs.slice(0, 4).map((s, j) => <li key={j}>{s}</li>)}
                              </ul>
                            )}
                            {it.datasheet_url && (
                              <a href={it.datasheet_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-brand-600 hover:underline">
                                <ExternalLink size={10} /> {lang === 'ar' ? 'ورقة المواصفات' : 'Specs sheet'}
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-3 text-center text-slate-600">{it.qty}</td>
                      <td className="px-2 py-3 text-right text-slate-600">{fmtDec(it.rate)}</td>
                      <td className="px-2 py-3 text-right text-slate-500">{it.disc > 0 ? `${it.disc}%` : '—'}</td>
                      <td className="px-2 py-3 text-right font-semibold text-ink">{fmtDec(it.amount)}</td>
                    </tr>
                  ))}
                  {items.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-slate-400">No line items</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex justify-end">
              <div className="w-72 space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-600"><span>{lang === 'ar' ? 'الصافي' : 'Subtotal (Net)'}</span><span>{fmt(net)}</span></div>
                {disc > 0 && <div className="flex justify-between text-rose-600"><span>{lang === 'ar' ? 'الخصم' : 'Discount'} ({headerDisc}%)</span><span>− {fmt(disc)}</span></div>}
                <div className="flex justify-between text-slate-600"><span>{lang === 'ar' ? 'ضريبة القيمة المضافة' : 'VAT (15%)'}</span><span>{fmt(vat)}</span></div>
                <div className="mt-1 flex justify-between rounded-lg bg-brand-50 px-3 py-2 text-base font-extrabold text-brand-700"><span>{lang === 'ar' ? 'الإجمالي' : 'Total'}</span><span>{fmt(total)}</span></div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {q.delivery_time && (
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted">{lang === 'ar' ? 'مدة التسليم' : 'Delivery Time'}</p>
                  <p className="mt-1 text-xs text-slate-600">{q.delivery_time}</p>
                </div>
              )}
              {q.payment_terms && (
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted">{lang === 'ar' ? 'شروط الدفع' : 'Payment Terms'}</p>
                  <p className="mt-1 text-xs text-slate-600">{q.payment_terms}</p>
                </div>
              )}
              {q.warranty_terms && (
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted">{lang === 'ar' ? 'الضمان' : 'Warranty'}</p>
                  <p className="mt-1 text-xs text-slate-600">{q.warranty_terms}</p>
                </div>
              )}
            </div>

            {q.notes && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{lang === 'ar' ? 'ملاحظات' : 'Notes'}</p>
                <p className="whitespace-pre-wrap text-xs text-slate-600">{q.notes}</p>
              </div>
            )}

            <div className="mt-6 border-t border-slate-100 pt-4 text-[11px] leading-relaxed text-slate-500">
              <p className="font-semibold text-ink">{lang === 'ar' ? 'الشروط والأحكام' : 'Terms & Conditions'}</p>
              <p className="mt-1">{lang === 'ar'
                ? 'الأسعار بالريال السعودي وتشمل ضريبة القيمة المضافة 15%. الدفع يُعد قبولاً للشروط.'
                : 'Prices are in SAR and inclusive of 15% VAT. Payment serves as acceptance of our Terms & Conditions.'}</p>
              {q.sales_consultant && (
                <p className="mt-3 font-semibold text-ink">{lang === 'ar' ? 'مع أطيب التحيات،' : 'Best Regards,'}<br />{q.sales_consultant}{q.sales_consultant_phone ? ` · ${q.sales_consultant_phone}` : ''}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
