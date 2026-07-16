import { supabase } from '../config/supabase.js'

const REQUIRED = ['cr_number', 'vat_number', 'national_address', 'billing_address']

/** Customer commercial profile must be complete before quotation → sales order. */
export async function customerCommercialGate(customerName) {
  const name = (customerName || '').trim()
  if (!name) return { ok: false, error: 'Customer name is required', missing: REQUIRED }

  const { data } = await supabase.from('customers').select('*').ilike('name', name).limit(1).maybeSingle()
  if (!data) {
    return {
      ok: false,
      error: 'Customer commercial registration is required before order confirmation. Please provide CR number, VAT number, and billing address.',
      missing: REQUIRED,
      customer_exists: false,
    }
  }
  const missing = REQUIRED.filter((f) => !(data[f] || '').trim())
  if (missing.length) {
    return {
      ok: false,
      error: `Missing required commercial fields: ${missing.map(label).join(', ')}`,
      missing,
      customer_exists: true,
      customer_id: data.id,
    }
  }
  return { ok: true, customer: data }
}

function label(f) {
  return ({ cr_number: 'CR Number', vat_number: 'VAT Number', national_address: 'National Address', billing_address: 'Billing Address' })[f] || f
}
