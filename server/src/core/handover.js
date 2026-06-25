import { supabase } from '../config/supabase.js'

// Build the Sales → PM handover fields for a Project from an accepted quotation.
// Phone is pulled from the customer's signup record (users.phone) by email.
export async function projectFieldsFromQuote(q) {
  let phone = null
  if (q.customer_email) {
    const { data } = await supabase.from('users').select('phone').ilike('email', q.customer_email).maybeSingle()
    phone = data?.phone || null
  }
  return {
    contact_person: q.contact_person || null,
    customer_email: q.customer_email || null,
    customer_phone: phone,
    location: q.project_location || null,
    payment_terms: q.payment_terms || null,
    delivery_date: q.delivery_date || null,
    notes: q.notes || null,
  }
}
