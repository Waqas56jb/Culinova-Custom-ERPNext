import { supabase } from '../config/supabase.js'

// Stage pipeline order — automation only ever moves an opportunity FORWARD.
const ORDER = { Lead: 0, Prospecting: 1, Qualified: 1, Quotation: 2, Negotiation: 3, Won: 4, Lost: 4 }
const PROB = { Prospecting: 20, Quotation: 50, Negotiation: 70 }
const plus = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)

// New contact → auto-capture a Lead + an Opportunity (Prospecting). Idempotent per customer.
export async function ensureLeadAndOpportunity({ name, email }) {
  if (!name) return
  const { data: existing } = await supabase.from('opportunities').select('id').ilike('customer', name).limit(1).maybeSingle()
  if (existing) return
  await supabase.from('leads').insert({ name, company: name, source: 'Chat', status: 'Open' })
  await supabase.from('opportunities').insert({ customer: name, stage: 'Prospecting', value: 0, probability: PROB.Prospecting, next_action_date: plus(7) })
}

// Move the customer's open opportunity FORWARD to a stage (never backward).
export async function advanceOpportunity(customer, toStage) {
  if (!customer) return
  const { data: opps } = await supabase.from('opportunities').select('id,stage').ilike('customer', customer).neq('stage', 'Won').neq('stage', 'Lost')
  for (const o of opps || []) {
    if ((ORDER[o.stage] ?? 0) < (ORDER[toStage] ?? 0)) {
      await supabase.from('opportunities').update({ stage: toStage, ...(PROB[toStage] ? { probability: PROB[toStage] } : {}) }).eq('id', o.id)
    }
  }
}

// Deal closed-won
export async function winOpportunityForCustomer(customer) {
  if (!customer) return
  await supabase.from('opportunities').update({ stage: 'Won', probability: 100 }).ilike('customer', customer).neq('stage', 'Won').neq('stage', 'Lost')
}

// Deal closed-lost
export async function loseOpportunityForCustomer(customer, reason) {
  if (!customer) return
  await supabase.from('opportunities').update({ stage: 'Lost', lost_reason: reason || 'Quotation rejected' }).ilike('customer', customer).neq('stage', 'Won').neq('stage', 'Lost')
}
