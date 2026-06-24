import { supabase } from '../config/supabase.js'

// Stage pipeline order — automation only ever moves an opportunity FORWARD.
const ORDER = { Lead: 0, Prospecting: 1, Qualified: 1, Quotation: 2, Negotiation: 3, Won: 4, Lost: 4 }
const PROB = { Prospecting: 20, Quotation: 50, Negotiation: 70 }
const plus = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)

// the customer's current OPEN opportunity (not Won/Lost) — re-engagement after a closed
// deal starts a brand-new opportunity, so closed ones are ignored here.
async function openOpp(customer) {
  const { data } = await supabase.from('opportunities').select('id, stage')
    .ilike('customer', customer).neq('stage', 'Won').neq('stage', 'Lost')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data || null
}

// New contact / re-engagement → ensure a Lead (once) + an OPEN Opportunity (Prospecting).
export async function ensureLeadAndOpportunity({ name }) {
  if (!name) return
  const { data: lead } = await supabase.from('leads').select('id').ilike('company', name).limit(1).maybeSingle()
  if (!lead) await supabase.from('leads').insert({ name, company: name, source: 'Chat', status: 'Open' })
  if (!(await openOpp(name))) {
    await supabase.from('opportunities').insert({ customer: name, stage: 'Prospecting', value: 0, probability: PROB.Prospecting, next_action_date: plus(7) })
  }
}

// Move the OPEN opportunity FORWARD to a stage (never backward).
export async function advanceOpportunity(customer, toStage) {
  if (!customer) return
  const o = await openOpp(customer)
  if (o && (ORDER[o.stage] ?? 0) < (ORDER[toStage] ?? 0)) {
    await supabase.from('opportunities').update({ stage: toStage, ...(PROB[toStage] ? { probability: PROB[toStage] } : {}) }).eq('id', o.id)
  }
}

// Deal closed-won (win the open one, or create a Won record if somehow none is open).
export async function winOpportunityForCustomer(customer, value) {
  if (!customer) return
  const o = await openOpp(customer)
  if (o) await supabase.from('opportunities').update({ stage: 'Won', probability: 100 }).eq('id', o.id)
  else await supabase.from('opportunities').insert({ customer, stage: 'Won', value: Number(value) || 0, probability: 100, next_action_date: plus(1) })
}

// Deal closed-lost
export async function loseOpportunityForCustomer(customer, reason) {
  if (!customer) return
  const o = await openOpp(customer)
  if (o) await supabase.from('opportunities').update({ stage: 'Lost', lost_reason: reason || 'Quotation rejected' }).eq('id', o.id)
}
