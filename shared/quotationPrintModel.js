/** Pure print-model builder (no JSX) — used by QuotationPrint UI + verify scripts. */

export const DEFAULT_EN = [
  'Kingdom of Saudi Arabia - Riyadh - Al Yarmouk District exit 8',
  'PO Box 13242 - C.R : 1010800733',
  'Tel : 00966540489341',
]

/** Fields that must NEVER appear in print / customer payloads (Sprint 1b redaction). */
export const PRINT_FORBIDDEN_FIELDS = [
  'add_margin_pct', 'override_reason', 'discount_source',
  'estimated_cost', 'pricing_basis', 'needs_rate',
  'cost', 'cost_amount', 'gp_percent', 'valuation_rate',
  'exchange_factor', 'price_factor',
]

export function collectKeys(obj, out = new Set()) {
  if (!obj || typeof obj !== 'object') return out
  if (Array.isArray(obj)) {
    for (const v of obj) collectKeys(v, out)
    return out
  }
  for (const [k, v] of Object.entries(obj)) {
    out.add(k)
    if (v && typeof v === 'object') collectKeys(v, out)
  }
  return out
}

export function printModelHasForbidden(model) {
  const keys = collectKeys(model)
  return PRINT_FORBIDDEN_FIELDS.filter((f) => keys.has(f))
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

  const validityDays = Number(raw.validity_days) || null
  const validTill = raw.valid_till || raw.valid || null
  const validityLabel = validTill
    ? (validityDays > 0 ? `${validTill} (${validityDays} days)` : String(validTill))
    : (validityDays > 0 ? `${validityDays} days` : '—')

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
    valid_till: validityLabel,
    validity_days: validityDays,
    terms_text: raw.terms_text || raw.notes,
    language: raw.language,
    items,
    grandTotal, netAfterDisc, discFinal, vat, total, vatPct,
    enLines,
  }
}
