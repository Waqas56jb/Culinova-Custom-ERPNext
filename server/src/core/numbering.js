import { supabase } from '../config/supabase.js'

// Map a table to its numbering-series doc_type (Company Settings → Numbering Series).
export const TABLE_DOCTYPE = {
  sales_orders: 'Sales Order', invoices: 'Invoice', purchase_orders: 'Purchase Order', rfqs: 'RFQ',
  delivery_notes: 'Delivery Note', goods_receipts: 'Goods Receipt', projects: 'Project', payments: 'Payment',
  quotations: 'Quotation',
  // Phase 2
  purchase_requisitions: 'Purchase Requisition', boqs: 'BOQ', cost_sheets: 'Cost Sheet',
  // CRM — leads/opportunities are documents too; without a number the UI had to print the raw uuid
  leads: 'Lead', opportunities: 'Opportunity',
}

// Consume the next document number. Uses the editable numbering_series table when a series exists
// for the doc type (prefix / padding / include-year / separator all DB-driven, NOT hardcoded);
// otherwise falls back to a safe generated reference.
export async function nextNumber(table, fallbackPrefix) {
  const docType = TABLE_DOCTYPE[table]
  if (docType) {
    const { data: s } = await supabase.from('numbering_series').select('*').eq('doc_type', docType).eq('is_active', true).maybeSingle()
    if (s) {
      const n = Number(s.next_number) || 1
      await supabase.from('numbering_series').update({ next_number: n + 1 }).eq('id', s.id)
      const year = new Date().getFullYear()
      const sep = s.separator ?? '-'
      return `${s.prefix}${sep}${s.include_year ? year + sep : ''}${String(n).padStart(s.padding || 6, '0')}`
    }
  }
  return `${fallbackPrefix}-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`
}
