import { useState } from 'react'
import { X, Printer, Download, FileText, ExternalLink } from 'lucide-react'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'

const fmt = (n) => sar(Math.round(Number(n) || 0))
const fmtDec = (n) => Number(n || 0).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const T = {
  en: {
    quotation: 'QUOTATION',
    to: 'To',
    contactPerson: 'Contact Person',
    contactNo: 'Contact No',
    email: 'Email',
    project: 'Project',
    ref: 'Ref',
    date: 'Date',
    salesConsultant: 'Sales Consultant',
    dear: 'Dear Valued Customer,',
    intro: 'We are pleased to present you with the quotation you requested. We hope that this proposal meets your expectations and aligns well with your needs. Our dedicated team at Culinova has worked carefully and thoughtfully to create this document.',
    disclaimer: 'It is important for you to know that the document you have received is a quotation only. This means it outlines the costs and services we can provide, but it does not mean that an order has been placed yet. Once we receive your payment, we will send you an official Order Confirmation Letter via email.',
    paymentNote: 'When you make your payment, it will serve as your acceptance of our Terms & Conditions.',
    deliveryTime: 'Delivery Time',
    paymentTerms: 'Payment Terms',
    warranty: 'Warranty',
    validity: 'Validity',
    area: 'Area',
    no: 'No.',
    pos: 'POS',
    itemCode: 'Item Code',
    itemName: 'Item Name',
    qty: 'Qty',
    price: 'Price',
    disc: 'Disc %',
    netPrice: 'Net Price',
    netTotal: 'Net Total',
    specsSheet: 'Specs Sheet: Tap to View',
    grandTotal: 'Grand Total',
    discount: 'Discount',
    netTotalHdr: 'Net Total',
    vat: 'VAT',
    totalWithVat: 'Total with VAT',
    bestRegards: 'Best Regards,',
    none: 'None',
  },
  ar: {
    quotation: 'عرض سعر',
    to: 'إلى',
    contactPerson: 'جهة الاتصال',
    contactNo: 'رقم التواصل',
    email: 'البريد',
    project: 'المشروع',
    ref: 'المرجع',
    date: 'التاريخ',
    salesConsultant: 'مستشار المبيعات',
    dear: 'عميلنا العزيز،',
    intro: 'يسعدنا تقديم عرض السعر المطلوب. نأمل أن يلبي هذا العرض توقعاتكم واحتياجاتكم. عمل فريق كولينوفا بعناية لإعداد هذا المستند.',
    disclaimer: 'هذا المستند عرض سعر فقط وليس تأكيد طلب. عند استلام الدفعة سنرسل رسالة تأكيد الطلب عبر البريد الإلكتروني.',
    paymentNote: 'الدفع يُعد قبولاً لشروط وأحكامنا.',
    deliveryTime: 'مدة التسليم',
    paymentTerms: 'شروط الدفع',
    warranty: 'الضمان',
    validity: 'صلاحية العرض',
    area: 'المنطقة',
    no: 'م',
    pos: 'POS',
    itemCode: 'رمز الصنف',
    itemName: 'اسم الصنف',
    qty: 'الكمية',
    price: 'السعر',
    disc: 'خصم %',
    netPrice: 'صافي السعر',
    netTotal: 'الإجمالي',
    specsSheet: 'ورقة المواصفات: اضغط للعرض',
    grandTotal: 'الإجمالي',
    discount: 'الخصم',
    netTotalHdr: 'الصافي',
    vat: 'ضريبة القيمة المضافة',
    totalWithVat: 'الإجمالي شامل الضريبة',
    bestRegards: 'مع أطيب التحيات،',
    none: '—',
  },
}

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
  return t.split(/\n|•|·|\.\s+(?=[A-Z*])/).map((s) => s.trim()).filter(Boolean).slice(0, 12)
}

function lineDisc(it, headerDisc) {
  const d = Number(it.discount_pct)
  return d > 0 ? d : Number(headerDisc) || 0
}

export default function QuotationPreview({ open, onClose, quotation }) {
  const { settings } = useData()
  const [lang, setLang] = useState(quotation?.language === 'ar' ? 'ar' : 'en')
  if (!open || !quotation) return null

  const company = (settings?.companies || [])[0] || {}
  const vs = settings?.vatSettings || []
  const vatPct = Number(vs.find((v) => v.is_active && v.is_default)?.rate ?? vs.find((v) => v.is_active)?.rate ?? 15)
  const t = T[lang]
  const rtl = lang === 'ar'

  const src = quotation.items?.length
    ? quotation.items
    : [{ name: 'As per attached BOQ', qty: 1, rate: Number(quotation.net_amount) || 0 }]

  const headerDisc = Number(quotation.discount ?? quotation.discount_pct) || 0
  const items = src.map((it, i) => {
    const qty = Number(it.qty) || 0
    const rate = Number(it.rate) || 0
    const disc = lineDisc(it, headerDisc)
    const netPrice = rate * (1 - disc / 100)
    const amount = it.amount != null ? Number(it.amount) : qty * netPrice
    return {
      idx: i + 1,
      pos: it.pos || it.area || null,
      code: it.item_code || it.model || it.code || '—',
      name: it.item_name || it.name,
      brand: it.brand,
      model: it.model,
      description: it.description,
      specifications: it.specifications,
      image_url: it.image_url,
      datasheet_url: it.datasheet_url,
      qty, rate, disc, netPrice, amount,
    }
  })

  const ref = quotation.ref || quotation.number || 'Quotation'
  const issued = quotation.date || (quotation.created_at || '').slice(0, 10) || '—'
  const grandTotal = items.reduce((s, it) => s + it.qty * it.rate, 0)
  const netLineTotal = items.reduce((s, it) => s + it.amount, 0)
  const discountAmount = quotation.discount_amount != null
    ? Number(quotation.discount_amount)
    : Math.max(0, grandTotal - netLineTotal)
  const netAfter = netLineTotal - (quotation.discount_amount != null && headerDisc === 0 ? 0 : 0)
  const subtotal = netLineTotal
  const discFinal = quotation.discount_amount != null ? Number(quotation.discount_amount) : discountAmount
  const afterDisc = subtotal - (headerDisc > 0 && items.every((it) => lineDisc(it, headerDisc) > 0) ? 0 : discFinal)
  const netAfterDisc = subtotal - discFinal
  const vat = quotation.vat_amount != null ? Number(quotation.vat_amount) : (netAfterDisc * vatPct) / 100
  const total = quotation.total_amount != null ? Number(quotation.total_amount) : netAfterDisc + vat

  const consultant = quotation.sales_consultant || quotation.owner || '—'
  const consultantPhone = quotation.sales_consultant_phone || '—'
  const consultantEmail = quotation.sales_consultant_email || company.email || 'sales@culinova.sa'

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-navy-900/60 backdrop-blur-sm p-3 sm:p-6 print:bg-white print:p-0">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .quote-print-root, .quote-print-root * { visibility: visible; }
          .quote-print-root { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
        .quote-table th { background: #c4a574; color: #1a1a1a; font-size: 10px; font-weight: 700; padding: 8px 6px; border: 1px solid #b8956a; }
        .quote-table td { border: 1px solid #ddd; padding: 8px 6px; vertical-align: top; font-size: 11px; }
        .quote-table tr:nth-child(even) td { background: #faf8f5; }
      `}</style>

      <div className="w-full max-w-[900px] animate-fade-up">
        <div className="no-print mb-3 flex items-center justify-between text-white">
          <span className="flex items-center gap-2 text-sm font-semibold"><FileText size={16} /> {ref}.pdf</span>
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

        <div className={`quote-print-root overflow-hidden rounded-xl bg-white shadow-2xl print:shadow-none ${rtl ? 'text-right' : ''}`} dir={rtl ? 'rtl' : 'ltr'}>
          {/* Letterhead */}
          <div className="border-b-4 border-[#c4a574] px-8 py-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="grid h-16 w-16 place-items-center rounded-lg bg-gradient-to-br from-[#1a2744] to-[#2d4a7c] text-2xl font-extrabold text-[#c4a574]">C</div>
                <div>
                  <p className="text-lg font-extrabold tracking-wide text-[#1a2744]">THE FEATURED CULINOVA CONTRACTING COMPANY</p>
                  <p className="text-sm font-semibold text-[#c4a574]">شركة كولينوفا المتخصصة للمقاولات</p>
                  <p className="mt-1 text-[10px] text-slate-500">{company.address || 'Riyadh, Kingdom of Saudi Arabia'}</p>
                  {company.phone && <p className="text-[10px] text-slate-500">Tel: {company.phone}</p>}
                </div>
              </div>
              <div className={`${rtl ? 'text-left' : 'text-right'}`}>
                <p className="text-2xl font-extrabold tracking-widest text-[#c4a574]">{t.quotation}</p>
              </div>
            </div>
          </div>

          <div className="px-8 py-6">
            {/* Meta grid */}
            <div className="mb-6 grid grid-cols-2 gap-6 text-xs">
              <div className="space-y-1">
                <p><span className="font-bold text-[#1a2744]">{t.to}:</span> {quotation.customer}</p>
                <p><span className="font-bold text-[#1a2744]">{t.contactPerson}:</span> {quotation.contact_person || t.none}</p>
                <p><span className="font-bold text-[#1a2744]">{t.contactNo}:</span> {quotation.customer_phone || t.none}</p>
                <p><span className="font-bold text-[#1a2744]">{t.email}:</span> {quotation.email || quotation.customer_email || t.none}</p>
                <p><span className="font-bold text-[#1a2744]">{t.project}:</span> {quotation.project_name || t.none}</p>
              </div>
              <div className={`space-y-1 ${rtl ? '' : 'text-right'}`}>
                <p><span className="font-bold text-[#1a2744]">{t.ref}:</span> {ref}</p>
                <p><span className="font-bold text-[#1a2744]">{t.date}:</span> {issued}</p>
                <p><span className="font-bold text-[#1a2744]">{t.salesConsultant}:</span> {consultant}</p>
                <p><span className="font-bold text-[#1a2744]">{t.contactNo}:</span> {consultantPhone}</p>
                <p><span className="font-bold text-[#1a2744]">{t.email}:</span> {consultantEmail}</p>
              </div>
            </div>

            {/* Cover letter */}
            <div className="mb-6 space-y-3 text-[11px] leading-relaxed text-slate-700">
              <p className="font-semibold text-[#1a2744]">{t.dear}</p>
              <p>{t.intro}</p>
              <p>{t.disclaimer}</p>
              <p>{t.paymentNote}</p>
            </div>

            {/* Commercial terms strip */}
            <div className="mb-6 space-y-1 rounded-lg border border-[#c4a574]/40 bg-[#faf8f5] p-4 text-[11px]">
              <p><span className="font-bold text-[#1a2744]">{t.deliveryTime}:</span> {quotation.delivery_time || '5-7 Days After Approval'}</p>
              <p><span className="font-bold text-[#1a2744]">{t.paymentTerms}:</span> {quotation.payment_terms || '100% Advanced Payment'}</p>
              <p><span className="font-bold text-[#1a2744]">{t.warranty}:</span> {quotation.warranty_terms || 'Two-years warranty: 1st year covers labor & parts, 2nd year covers labor only (excludes parts). Misuse not covered'}</p>
              <p><span className="font-bold text-[#1a2744]">{t.validity}:</span> {quotation.valid_till || `${quotation.validity_days || 30} days`}</p>
            </div>

            <p className="mb-2 text-xs font-bold text-[#1a2744]">{t.area}: {quotation.area || quotation.project_location || t.none}</p>

            {/* Items table */}
            <table className="quote-table w-full border-collapse">
              <thead>
                <tr>
                  <th>{t.no}</th><th>{t.pos}</th><th>{t.itemCode}</th><th>{t.itemName}</th>
                  <th>{t.qty}</th><th>{t.price}</th><th>{t.disc}</th><th>{t.netPrice}</th><th>{t.netTotal}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const specs = parseSpecs(it.specifications || it.description)
                  return (
                    <tr key={it.idx}>
                      <td className="text-center font-semibold">{it.idx}</td>
                      <td className="text-center text-slate-400">{it.pos || t.none}</td>
                      <td className="font-mono text-[10px] font-semibold">{it.code}</td>
                      <td className="min-w-[220px]">
                        <div className="flex gap-3">
                          {it.image_url && (
                            <img src={it.image_url} alt="" className="h-16 w-16 shrink-0 rounded border border-slate-200 object-contain bg-white" onError={(e) => { e.target.style.display = 'none' }} />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-bold uppercase text-[#1a2744]">{it.name}</p>
                            {it.brand && <p className="text-[10px] font-semibold text-[#c4a574]">{it.brand}{it.model ? ` · ${it.model}` : ''}</p>}
                            <ul className="mt-1 list-disc pl-4 text-[10px] text-slate-600">
                              {specs.map((s, j) => <li key={j}>{s}</li>)}
                            </ul>
                            {it.datasheet_url && (
                              <a href={it.datasheet_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-brand-600 hover:underline">
                                {t.specsSheet} <ExternalLink size={10} />
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="text-center">{fmtDec(it.qty)}</td>
                      <td className={`whitespace-nowrap ${rtl ? 'text-left' : 'text-right'}`}>{fmtDec(it.rate)}</td>
                      <td className="text-center">{fmtDec(it.disc)}</td>
                      <td className={`whitespace-nowrap ${rtl ? 'text-left' : 'text-right'}`}>{fmtDec(it.netPrice)}</td>
                      <td className={`whitespace-nowrap font-semibold ${rtl ? 'text-left' : 'text-right'}`}>{fmtDec(it.amount)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Totals */}
            <div className={`mt-6 flex ${rtl ? 'justify-start' : 'justify-end'}`}>
              <table className="w-72 text-sm">
                <tbody>
                  <tr><td className="py-1 text-slate-600">{t.grandTotal}</td><td className={`py-1 font-semibold ${rtl ? 'text-left pl-4' : 'text-right pl-4'}`}>SAR {fmtDec(grandTotal || subtotal + discFinal)}</td></tr>
                  <tr><td className="py-1 text-rose-600">{t.discount}</td><td className={`py-1 text-rose-600 ${rtl ? 'text-left pl-4' : 'text-right pl-4'}`}>SAR {fmtDec(discFinal)}</td></tr>
                  <tr><td className="py-1 font-semibold text-[#1a2744]">{t.netTotalHdr}</td><td className={`py-1 font-semibold ${rtl ? 'text-left pl-4' : 'text-right pl-4'}`}>SAR {fmtDec(netAfterDisc)}</td></tr>
                  <tr><td className="py-1 text-slate-600">{t.vat} ({vatPct}%)</td><td className={`py-1 ${rtl ? 'text-left pl-4' : 'text-right pl-4'}`}>SAR {fmtDec(vat)}</td></tr>
                  <tr className="border-t-2 border-[#c4a574]">
                    <td className="py-2 text-base font-extrabold text-[#1a2744]">{t.totalWithVat}</td>
                    <td className={`py-2 text-base font-extrabold text-[#c4a574] ${rtl ? 'text-left pl-4' : 'text-right pl-4'}`}>SAR {fmtDec(total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-10 text-sm">
              <p className="font-semibold text-[#1a2744]">{t.bestRegards}</p>
              <p className="mt-1 font-bold text-[#c4a574]">{consultant}</p>
            </div>

            {quotation.terms_text && (
              <div className="mt-6 border-t border-slate-200 pt-4 text-[10px] text-slate-500 whitespace-pre-wrap">{quotation.terms_text}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
