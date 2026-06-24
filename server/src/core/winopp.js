import { supabase } from '../config/supabase.js'

// When a quotation is accepted → the customer's open opportunity is automatically WON.
export async function winOpportunityForCustomer(customer) {
  if (!customer) return
  await supabase.from('opportunities')
    .update({ stage: 'Won', probability: 100 })
    .ilike('customer', customer)
    .neq('stage', 'Won')
    .neq('stage', 'Lost')
}
