/**
 * Sprint 3 Block 2 — Customer credit control (Sales Rules §8)
 *
 * Overdue = invoices where due_date < today AND (total - paid) > 0
 * (status Paid excluded). Customer matched by name (invoices.customer text).
 * Active quotations = Draft | Pending Approval | Sent | Under Negotiation | Open(legacy).
 */

import { supabase } from '../config/supabase.js'

export const ACTIVE_QUOTE_STATUSES = [
  'Draft',
  'Pending Approval',
  'Sent',
  'Under Negotiation',
  'Open', // legacy alias for Sent
]

const todayISO = () => new Date().toISOString().slice(0, 10)

/**
 * @param {string} customerName — quotations/invoices use customer name text
 * @returns {Promise<{
 *   customer: string,
 *   overdue_amount: number,
 *   overdue_invoices: Array<{id, number, due_date, outstanding, total, paid}>,
 *   overdue_invoice_count: number,
 *   active_quotations_count: number,
 *   has_overdue: boolean,
 *   blocked: boolean,
 * }>}
 */
export async function creditStatus(customerName) {
  const customer = String(customerName || '').trim()
  if (!customer) {
    return {
      customer: '',
      overdue_amount: 0,
      overdue_invoices: [],
      overdue_invoice_count: 0,
      active_quotations_count: 0,
      has_overdue: false,
      blocked: false,
    }
  }

  const today = todayISO()
  const [{ data: invs }, { data: quotes }] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, number, due_date, total, paid, status, customer')
      .ilike('customer', customer)
      .not('status', 'eq', 'Paid'),
    supabase
      .from('quotations')
      .select('id, status')
      .ilike('customer', customer)
      .in('status', ACTIVE_QUOTE_STATUSES),
  ])

  const overdue_invoices = []
  let overdue_amount = 0
  for (const inv of invs || []) {
    const outstanding = Math.max(0, (Number(inv.total) || 0) - (Number(inv.paid) || 0))
    if (outstanding <= 0) continue
    if (!inv.due_date || String(inv.due_date).slice(0, 10) >= today) continue
    overdue_amount += outstanding
    overdue_invoices.push({
      id: inv.id,
      number: inv.number,
      due_date: inv.due_date,
      outstanding: Math.round(outstanding * 100) / 100,
      total: Number(inv.total) || 0,
      paid: Number(inv.paid) || 0,
    })
  }
  overdue_amount = Math.round(overdue_amount * 100) / 100

  const active_quotations_count = (quotes || []).length
  const has_overdue = overdue_amount > 0 || overdue_invoices.length > 0
  // "blocked" = would need management approval for another active quote (already at 3+)
  const blocked = has_overdue && active_quotations_count >= 3

  return {
    customer,
    overdue_amount,
    overdue_invoices,
    overdue_invoice_count: overdue_invoices.length,
    active_quotations_count,
    has_overdue,
    blocked,
  }
}

/** True when creating one more quote would exceed the 3-active limit for an overdue customer. */
export function needsCreditOverride(credit) {
  return !!(credit?.has_overdue && (credit.active_quotations_count || 0) >= 3)
}
