const fmtDec = (n) => Number(n || 0).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const DEFAULT_EN = [
  'Kingdom of Saudi Arabia - Riyadh - Al Yarmouk District exit 8',
  'PO Box 13242 - C.R : 1010800733',
  'Tel : 00966540489341',
]
export const DEFAULT_AR = [
  'المملكة العربية السعودية الرياض - حي اليرموك مخرج 8',
  'ص.ب 13242 - س.ت : 1010800733',
  'هاتف : 00966540489341',
]

export const T = {
  en: {
    quotation: 'QUOTATION',
    to: 'To', contactPerson: 'Contact Person', contactNo: 'Contact No', email: 'Email', project: 'Project',
    ref: 'Ref', date: 'Date', salesConsultant: 'Sales Consultant',
    dear: 'Dear Valued Customer,',
    intro: 'We are pleased to present you with the quotation you requested. We hope that this proposal meets your expectations and aligns well with your needs. Our dedicated team at Culinova has worked carefully and thoughtfully to create this document.',
    disclaimer: 'It is important for you to know that the document you have received is a quotation only. This means it outlines the costs and services we can provide, but it does not mean that an order has been placed yet. Once we receive your payment, we will send you an official Order Confirmation Letter via email.',
    paymentNote: 'When you make your payment, it will serve as your acceptance of our Terms & Conditions.',
    closing: 'We thank you for your interest in Culinova and look forward to the opportunity to serve you.',
    deliveryTime: 'Delivery Time', paymentTerms: 'Payment Terms', warranty: 'Warranty', validity: 'Validity',
    area: 'Area', no: 'No.', pos: 'POS', itemCode: 'Item Code', itemName: 'Item Name',
    qty: 'Qty', price: 'Price', disc: 'Disc %', netPrice: 'Net Price', netTotal: 'Net Total',
    specsSheet: 'Specs Sheet:', specsTap: 'Tap to View',
    grandTotal: 'Grand Total', discount: 'Discount', netTotalHdr: 'Net Total', vat: 'VAT', totalWithVat: 'Total with VAT',
    bestRegards: 'Best Regards,', none: 'None',
    companyEn: 'THE FEATURED CULINOVA CONTRACTING COMPANY',
    companyAr1: 'شركة نجم الطهي المتميزة للمقاولات',
    companyAr2: 'كولينوفا',
  },
  ar: {
    quotation: 'عرض سعر',
    to: 'إلى', contactPerson: 'جهة الاتصال', contactNo: 'رقم التواصل', email: 'البريد', project: 'المشروع',
    ref: 'المرجع', date: 'التاريخ', salesConsultant: 'مستشار المبيعات',
    dear: 'عميلنا العزيز،',
    intro: 'يسعدنا تقديم عرض السعر المطلوب. نأمل أن يلبي هذا العرض توقعاتكم واحتياجاتكم. عمل فريق كولينوفا بعناية لإعداد هذا المستند.',
    disclaimer: 'هذا المستند عرض سعر فقط وليس تأكيد طلب. عند استلام الدفعة سنرسل رسالة تأكيد الطلب عبر البريد الإلكتروني.',
    paymentNote: 'الدفع يُعد قبولاً لشروط وأحكامنا.',
    closing: 'نشكركم على اهتمامكم بكولينوفا ونتطلع لخدمتكم.',
    deliveryTime: 'مدة التسليم', paymentTerms: 'شروط الدفع', warranty: 'الضمان', validity: 'صلاحية العرض',
    area: 'المنطقة', no: 'م', pos: 'POS', itemCode: 'رمز الصنف', itemName: 'اسم الصنف',
    qty: 'الكمية', price: 'السعر', disc: 'خصم %', netPrice: 'صافي السعر', netTotal: 'الإجمالي',
    specsSheet: 'ورقة المواصفات:', specsTap: 'اضغط للعرض',
    grandTotal: 'الإجمالي', discount: 'الخصم', netTotalHdr: 'الصافي', vat: 'ضريبة القيمة المضافة', totalWithVat: 'الإجمالي شامل الضريبة',
    bestRegards: 'مع أطيب التحيات،', none: 'None',
    companyEn: 'THE FEATURED CULINOVA CONTRACTING COMPANY',
    companyAr1: 'شركة نجم الطهي المتميزة للمقاولات',
    companyAr2: 'كولينوفا',
  },
}

function specValue(v) {
  if (v == null) return ''
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.map(specValue).filter(Boolean).join(', ')
  if (typeof v === 'object') {
    return Object.entries(v)
      .filter(([k]) => !['source', 'eos_entry_id', 'id'].includes(k))
      .map(([k, val]) => `${k.replace(/_/g, ' ')}: ${specValue(val)}`)
      .join(' · ')
  }
  return String(v)
}

export function parseSpecs(raw) {
  if (!raw) return []
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return Object.entries(raw)
      .filter(([k]) => !['source', 'eos_entry_id', 'id'].includes(k))
      .map(([k, v]) => {
        const val = specValue(v)
        return val ? `${k.replace(/_/g, ' ')}: ${val}` : k.replace(/_/g, ' ')
      })
      .filter(Boolean)
      .slice(0, 14)
  }
  let t = String(raw)
  if (t.trim().startsWith('{') || t.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(t)
      if (Array.isArray(parsed)) return parsed.map(specValue).filter(Boolean).slice(0, 14)
      return parseSpecs(parsed)
    } catch { /* fall through */ }
  }
  t = t.replace(/<[^>]*>/g, '\n').replace(/\*\*/g, '')
  return t.split(/\n|•|·|\.\s+(?=[A-Z*])/).map((s) => s.trim()).filter(Boolean).slice(0, 14)
}

/** Compact inline logo — fixed size, never scales huge */
function CulinovaLogo() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 132 32"
      width="132"
      height="32"
      className="block shrink-0"
      aria-label="CULINOVA"
      style={{ maxWidth: 132, maxHeight: 32, width: 132, height: 32 }}
    >
      <rect x="0.5" y="0.5" width="28" height="28" stroke="#C5A059" strokeWidth="1.5" fill="none" />
      <rect x="28.5" y="0.5" width="1.5" height="28" fill="#C5A059" />
      <text x="14.5" y="21" textAnchor="middle" fontFamily="Arial,Helvetica,sans-serif" fontSize="17" fontWeight="700" fill="#C5A059">C</text>
      <text x="36" y="21" fontFamily="Arial,Helvetica,sans-serif" fontSize="15" fontWeight="700" fill="#1a1a1a" letterSpacing="0.5">ULINOVA</text>
    </svg>
  )
}

function GoldRule() {
  return <div className="quote-rule" />
}

function HeaderPattern({ children }) {
  return (
    <div className="quote-header-band">
      <div className="quote-header-band-bg" aria-hidden />
      <div className="quote-header-band-inner">{children}</div>
    </div>
  )
}

export function QuotationPrintStyles() {
  return (
    <style>{`
      .quote-doc {
        width: 100%;
        max-width: 794px;
        margin: 0 auto;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 11px;
        line-height: 1.45;
        color: #1a1a1a;
      }
      .quote-rule {
        height: 1px;
        background: #C5A059;
        margin: 12px 0;
      }
      .quote-header-band {
        position: relative;
        margin-top: 10px;
        overflow: hidden;
        border-top: 1px solid #C5A059;
        border-bottom: 1px solid #C5A059;
        background: #faf6ef;
        padding: 8px 0;
      }
      .quote-header-band-bg {
        position: absolute;
        inset: 0;
        opacity: 0.35;
        pointer-events: none;
        background: linear-gradient(105deg, transparent 0%, #e8dcc8 18%, #f0e6d4 42%, #e8dcc8 68%, transparent 100%);
      }
      .quote-header-band-inner {
        position: relative;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        padding: 0 12px;
        font-size: 8.5px;
        line-height: 1.5;
      }
      .quote-title {
        text-align: center;
        font-size: 18px;
        font-weight: 800;
        letter-spacing: 0.28em;
        color: #C5A059;
        margin: 8px 0;
      }
      .quote-meta {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px 24px;
        font-size: 10px;
      }
      .quote-meta-right { text-align: right; }
      .quote-table-wrap {
        width: 100%;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        margin-top: 16px;
      }
      .quote-table {
        border-collapse: collapse;
        width: 100%;
        min-width: 680px;
        table-layout: fixed;
        border: 1px solid #C0A033;
        font-size: 9px;
      }
      .quote-table th {
        background: #D6C99C;
        color: #1a1a1a;
        font-weight: 700;
        padding: 6px 3px;
        border: 1px solid #C0A033;
        text-align: center;
        word-wrap: break-word;
      }
      .quote-table td {
        border: 1px solid #C0A033;
        padding: 5px 4px;
        vertical-align: top;
        word-wrap: break-word;
        overflow-wrap: anywhere;
      }
      .quote-col-no { width: 4%; }
      .quote-col-pos { width: 5%; }
      .quote-col-code { width: 10%; }
      .quote-col-name { width: 34%; }
      .quote-col-num { width: 8%; }
      .quote-area-row td {
        background: #D6C99C;
        font-weight: 700;
        font-size: 10px;
        padding: 6px 8px;
      }
      .quote-item-title {
        font-weight: 700;
        text-transform: uppercase;
        font-size: 9px;
        line-height: 1.35;
        margin-bottom: 4px;
      }
      .quote-item-body {
        display: flex;
        gap: 6px;
        align-items: flex-start;
      }
      .quote-item-img {
        width: 48px;
        height: 48px;
        flex-shrink: 0;
        object-fit: contain;
        border: 1px solid #ddd;
        background: #fff;
      }
      .quote-item-specs {
        margin: 0;
        padding-left: 14px;
        font-size: 8px;
        line-height: 1.4;
        color: #444;
      }
      .quote-totals-wrap {
        display: flex;
        justify-content: flex-end;
        margin-top: 16px;
      }
      .quote-totals {
        border-collapse: collapse;
        border: 1px solid #C0A033;
        font-size: 10px;
        min-width: 240px;
        max-width: 100%;
      }
      .quote-totals td {
        border: 1px solid #C0A033;
        padding: 5px 10px;
      }
      .quote-totals .lbl { background: #D6C99C; font-weight: 600; }
      .quote-totals .val { background: #fff; font-weight: 700; text-align: right; white-space: nowrap; }
      .quote-totals .total-lbl { background: #D6C99C; font-weight: 800; font-size: 11px; }
      .quote-totals .total-val { background: #fff; font-weight: 800; font-size: 11px; color: #C5A059; text-align: right; }
      .quote-body-text { font-size: 10px; line-height: 1.6; }
      .quote-body-text p + p { margin-top: 8px; }
      .quote-page-num { text-align: center; font-size: 9px; color: #999; margin-top: 8px; }
      @media (max-width: 640px) {
        .quote-doc { font-size: 10px; }
        .quote-meta { grid-template-columns: 1fr; }
        .quote-meta-right { text-align: left; }
        .quote-header-band-inner { grid-template-columns: 1fr; }
        .quote-letterhead { padding-left: 12px !important; padding-right: 12px !important; }
        .quote-content { padding-left: 12px !important; padding-right: 12px !important; }
      }
      @media print {
        body * { visibility: hidden; }
        .quote-print-root, .quote-print-root * { visibility: visible; }
        .quote-print-root { position: absolute; left: 0; top: 0; width: 100%; }
        .no-print { display: none !important; }
        .quote-table-wrap { overflow: visible; }
        .quote-letterhead, .quote-table th, .quote-area-row, .quote-totals td, .quote-header-band {
          -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }
        .quote-table-page { page-break-before: always; }
      }
      @media screen {
        .quote-table-page { page-break-before: auto; }
      }
    `}</style>
  )
}

export function QuotationPrintBody({ q, lang = 'en', enLines = DEFAULT_EN }) {
  const t = T[lang] || T.en
  const rtl = lang === 'ar'
  const vatPct = Number(q.vatPct) || 15
  const items = q.items || []

  const grandTotal = q.grandTotal ?? items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0)
  const netAfterDisc = Number(q.netAfterDisc ?? q.net_amount ?? items.reduce((s, it) => s + (Number(it.amount) || 0), 0))
  const discFinal = Number(q.discFinal ?? q.discount_amount ?? Math.max(0, grandTotal - netAfterDisc))
  const vat = Number(q.vat ?? q.vat_amount ?? (netAfterDisc * vatPct) / 100)
  const total = Number(q.total ?? q.total_amount ?? netAfterDisc + vat)

  const consultant = q.sales_consultant || '—'
  const consultantPhone = q.sales_consultant_phone || '0549120621'
  const consultantEmail = q.sales_consultant_email || 'sales@culinova.sa'

  return (
    <div className={`quote-print-root quote-doc bg-white ${rtl ? 'text-right' : ''}`} dir={rtl ? 'rtl' : 'ltr'}>
      <div className="quote-letterhead" style={{ padding: '20px 28px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <CulinovaLogo />
          <div style={{ textAlign: rtl ? 'left' : 'right', flex: '1 1 auto', minWidth: 0 }}>
            <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', lineHeight: 1.35 }}>{t.companyEn}</p>
            <p style={{ fontSize: 9, fontWeight: 600, lineHeight: 1.35 }}>{t.companyAr1}</p>
            <p style={{ fontSize: 10, fontWeight: 700 }}>{t.companyAr2}</p>
          </div>
        </div>

        <HeaderPattern>
          <div>{enLines.map((line, i) => <p key={i}>{line}</p>)}</div>
          <div style={{ textAlign: 'right' }} dir="rtl">
            {DEFAULT_AR.map((line, i) => <p key={i}>{line}</p>)}
          </div>
        </HeaderPattern>

        <GoldRule />
        <p className="quote-title">{t.quotation}</p>
        <GoldRule />
      </div>

      <div className="quote-content" style={{ padding: '0 28px 32px' }}>
        <div className={`quote-meta ${rtl ? '' : ''}`}>
          <div>
            <p><b>{t.to}:</b> {q.customer}</p>
            <p><b>{t.contactPerson}:</b> {q.contact_person || t.none}</p>
            <p><b>{t.contactNo}:</b> {q.customer_phone || t.none}</p>
            <p><b>{t.email}:</b> {q.customer_email || q.email || t.none}</p>
            <p><b>{t.project}:</b> {q.project_name || q.project || t.none}</p>
          </div>
          <div className={rtl ? '' : 'quote-meta-right'}>
            <p><b>{t.ref}:</b> {q.ref}</p>
            <p><b>{t.date}:</b> {q.date}</p>
            <p><b>{t.salesConsultant}:</b> {consultant}</p>
            <p><b>{t.contactNo}:</b> {consultantPhone}</p>
            <p><b>{t.email}:</b> {consultantEmail}</p>
          </div>
        </div>

        <GoldRule />

        <div className="quote-body-text">
          <p><b>{t.dear}</b></p>
          <p>{t.intro}</p>
          <p>{t.disclaimer}</p>
          <p>{t.paymentNote}</p>
        </div>

        <GoldRule />

        <div className="quote-body-text">
          <p><b>{t.deliveryTime}:</b> {q.delivery_time || '5-7 Days After Approval'}</p>
          <p><b>{t.paymentTerms}:</b> {q.payment_terms || '100% Advanced Payment'}</p>
          <p><b>{t.warranty}:</b> {q.warranty_terms || 'Two-years warranty: 1st year covers labor & parts, 2nd year covers labor only (excludes parts). Misuse not covered'}</p>
          <p><b>{t.validity}:</b> {q.valid_till || '—'}</p>
          <p style={{ marginTop: 10 }}>{t.closing}</p>
        </div>

        <GoldRule />
        <p className="quote-page-num">Page 1</p>

        <div className="quote-table-page quote-table-wrap">
          <table className="quote-table">
            <thead>
              <tr>
                <th className="quote-col-no">{t.no}</th>
                <th className="quote-col-pos">{t.pos}</th>
                <th className="quote-col-code">{t.itemCode}</th>
                <th className="quote-col-name">{t.itemName}</th>
                <th className="quote-col-num">{t.qty}</th>
                <th className="quote-col-num">{t.price}</th>
                <th className="quote-col-num">{t.disc}</th>
                <th className="quote-col-num">{t.netPrice}</th>
                <th className="quote-col-num">{t.netTotal}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="quote-area-row">
                <td colSpan={9}>{t.area}: {q.area || q.project_location || t.none}</td>
              </tr>
              {items.map((it) => {
                const specs = parseSpecs(it.specifications)
                const descOnly = !specs.length && it.description
                  ? String(it.description).replace(/<[^>]*>/g, ' ').trim()
                  : ''
                const code = it.code || it.item_code || it.model || '—'
                return (
                  <tr key={it.idx}>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{it.idx}</td>
                    <td style={{ textAlign: 'center' }}>{it.pos || t.none}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 8 }}>{code}</td>
                    <td>
                      <p className="quote-item-title">{it.name}</p>
                      <div className="quote-item-body">
                        {it.image_url && (
                          <div style={{ flexShrink: 0, width: 48 }}>
                            <img
                              src={it.image_url}
                              alt=""
                              className="quote-item-img"
                              onError={(e) => { e.target.style.display = 'none' }}
                            />
                            {it.brand && (
                              <p style={{ fontSize: 7, fontWeight: 700, textTransform: 'uppercase', textAlign: 'center', marginTop: 2 }}>{it.brand}</p>
                            )}
                          </div>
                        )}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          {it.brand && !it.image_url && (
                            <p style={{ fontSize: 8, fontWeight: 600, color: '#C5A059', marginBottom: 2 }}>
                              {[it.brand, it.model].filter(Boolean).join(' · ')}
                            </p>
                          )}
                          {specs.length > 0 && (
                            <ul className="quote-item-specs">
                              {specs.map((s, j) => <li key={j}>{s}</li>)}
                            </ul>
                          )}
                          {descOnly && (
                            <p style={{ fontSize: 8, lineHeight: 1.45, color: '#444', marginTop: 4, whiteSpace: 'pre-wrap' }}>{descOnly}</p>
                          )}
                          {it.datasheet_url && (
                            <p style={{ marginTop: 4, fontSize: 8 }}>
                              {t.specsSheet}{' '}
                              <a href={it.datasheet_url} target="_blank" rel="noreferrer" style={{ color: '#e67e22', fontWeight: 600 }}>
                                {t.specsTap}
                              </a>
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>{fmtDec(it.qty)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtDec(it.rate)}</td>
                    <td style={{ textAlign: 'center' }}>{fmtDec(it.disc ?? it.discount_pct ?? 0)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtDec(it.netPrice ?? it.rate)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtDec(it.amount)}</td>
                  </tr>
                )
              })}
              {items.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 16, color: '#999' }}>No line items</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="quote-totals-wrap">
          <table className="quote-totals">
            <tbody>
              <tr><td className="lbl">{t.grandTotal}</td><td className="val">SAR {fmtDec(grandTotal || netAfterDisc + discFinal)}</td></tr>
              <tr><td className="lbl">{t.discount}</td><td className="val">SAR {fmtDec(discFinal)}</td></tr>
              <tr><td className="lbl">{t.netTotalHdr}</td><td className="val">SAR {fmtDec(netAfterDisc)}</td></tr>
              <tr><td className="lbl">{t.vat} ({vatPct}%)</td><td className="val">SAR {fmtDec(vat)}</td></tr>
              <tr><td className="total-lbl">{t.totalWithVat}</td><td className="total-val">SAR {fmtDec(total)}</td></tr>
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 24, fontSize: 10 }}>
          <p style={{ fontWeight: 600 }}>{t.bestRegards}</p>
          <p style={{ fontWeight: 700, marginTop: 2 }}>{consultant}</p>
        </div>

        {q.terms_text && (
          <div style={{ marginTop: 20, paddingTop: 12, borderTop: '1px solid #e5e5e5', fontSize: 9, color: '#666', whiteSpace: 'pre-wrap' }}>{q.terms_text}</div>
        )}
      </div>
    </div>
  )
}

export function buildQuotationPrintModel(raw, { vatPct = 15, company } = {}) {
  const headerDisc = Number(raw.discount ?? raw.discount_pct) || 0
  const src = raw.items?.length ? raw.items : (raw.quotation_items || [])
  const items = src.map((it, i) => {
    const qty = Number(it.qty) || 0
    const rate = Number(it.rate) || 0
    const disc = Number(it.discount_pct) > 0 ? Number(it.discount_pct) : headerDisc
    const netPrice = rate * (1 - disc / 100)
    const amount = it.amount != null ? Number(it.amount) : qty * netPrice
    return {
      idx: i + 1,
      pos: it.pos || it.area || null,
      code: it.item_code || it.code || it.model || null,
      item_code: it.item_code,
      name: it.item_name || it.name,
      brand: it.brand, model: it.model,
      description: it.description, specifications: it.specifications,
      image_url: it.image_url, datasheet_url: it.datasheet_url,
      qty, rate, disc, netPrice, amount,
    }
  })

  const grandTotal = items.reduce((s, it) => s + it.qty * it.rate, 0)
  const netLineTotal = items.reduce((s, it) => s + it.amount, 0)
  const discFinal = raw.discount_amount != null ? Number(raw.discount_amount) : Math.max(0, grandTotal - netLineTotal)
  const netAfterDisc = Number(raw.net_amount ?? raw.net ?? netLineTotal)
  const vat = raw.vat_amount != null ? Number(raw.vat_amount) : raw.vat != null ? Number(raw.vat) : (netAfterDisc * vatPct) / 100
  const total = raw.total_amount != null ? Number(raw.total_amount) : raw.total != null ? Number(raw.total) : raw.amount != null ? Number(raw.amount) : netAfterDisc + vat

  const enLines = company?.address
    ? [company.address, company.phone ? `Tel : ${company.phone}` : null, company.cr_number ? `C.R : ${company.cr_number}` : null].filter(Boolean)
    : DEFAULT_EN

  return {
    ref: raw.ref || raw.number || 'Quotation',
    date: raw.date || (raw.created_at || '').slice(0, 10) || '—',
    customer: raw.customer,
    contact_person: raw.contact_person,
    customer_phone: raw.customer_phone,
    customer_email: raw.customer_email || raw.email,
    email: raw.email,
    project_name: raw.project_name || raw.project,
    project: raw.project,
    area: raw.area,
    project_location: raw.project_location || raw.location,
    sales_consultant: raw.sales_consultant || raw.owner,
    sales_consultant_phone: raw.sales_consultant_phone,
    sales_consultant_email: raw.sales_consultant_email,
    delivery_time: raw.delivery_time,
    payment_terms: raw.payment_terms,
    warranty_terms: raw.warranty_terms,
    valid_till: raw.valid_till || raw.valid,
    terms_text: raw.terms_text || raw.notes,
    language: raw.language,
    items,
    grandTotal, netAfterDisc, discFinal, vat, total, vatPct,
    enLines,
  }
}
