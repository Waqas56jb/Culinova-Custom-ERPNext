/**
 * Sprint 3 Block 2 — credit override requests (4th+ active quote for overdue customer)
 */

import { supabase } from '../config/supabase.js'

const sar = (n) => 'SAR ' + Math.round(Number(n) || 0).toLocaleString('en-US')

export async function findApprovedCreditOverride(customer) {
  const name = String(customer || '').trim()
  if (!name) return null
  const { data } = await supabase
    .from('credit_override_requests')
    .select('*')
    .ilike('customer', name)
    .eq('status', 'Approved')
    .is('consumed_at', null)
    .order('decided_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data || null
}

export async function consumeCreditOverride(id) {
  if (!id) return
  await supabase
    .from('credit_override_requests')
    .update({ consumed_at: new Date().toISOString(), status: 'Consumed' })
    .eq('id', id)
}

/**
 * Create pending override + notify Management. Returns the request row.
 */
export async function requestCreditOverride({ customer, requestedBy, credit, note }) {
  const { data: req, error } = await supabase
    .from('credit_override_requests')
    .insert({
      customer: String(customer).trim(),
      requested_by: requestedBy?.id || null,
      status: 'Pending',
      note: note || null,
      overdue_amount: credit?.overdue_amount || 0,
      active_quotations_count: credit?.active_quotations_count || 0,
    })
    .select()
    .single()
  if (error) throw error

  await supabase.from('notifications').delete()
    .eq('ref_id', req.id).eq('type', 'credit_override').eq('action_status', 'pending')

  const { data: managers } = await supabase.from('users').select('id')
    .or('role.eq.Management,role.eq.System Admin')
  if (managers?.length) {
    const rows = managers.map((u) => ({
      user_id: u.id,
      type: 'credit_override',
      ref_type: 'credit_override',
      ref_id: req.id,
      action_status: 'pending',
      title: 'Credit override — 4th quotation',
      body: `${customer} has overdue ${sar(credit?.overdue_amount)} and ${credit?.active_quotations_count || 0} active quotes. Approve to allow another quotation.`,
      sender: requestedBy?.name || 'Sales',
    }))
    await supabase.from('notifications').insert(rows)
  }
  return req
}

export async function decideCreditOverride(requestId, decision, actor) {
  const { data: req } = await supabase.from('credit_override_requests').select('*').eq('id', requestId).maybeSingle()
  if (!req) {
    const err = new Error('Credit override request not found')
    err.status = 404
    throw err
  }
  if (req.status !== 'Pending') {
    const err = new Error('This credit override was already actioned')
    err.status = 422
    throw err
  }
  const status = decision === 'approved' ? 'Approved' : 'Rejected'
  const { data: updated, error } = await supabase.from('credit_override_requests').update({
    status,
    decided_by: actor?.id || null,
    decided_at: new Date().toISOString(),
  }).eq('id', requestId).select().single()
  if (error) throw error

  await supabase.from('notifications').update({ action_status: decision, read: true })
    .eq('ref_id', requestId).eq('type', 'credit_override')

  if (req.requested_by) {
    await supabase.from('notifications').insert({
      user_id: req.requested_by,
      title: `Credit override ${status.toLowerCase()}`,
      body: `Credit override for ${req.customer} was ${status.toLowerCase()} by ${actor?.name || 'Management'}.`,
      sender: actor?.name || 'Management',
    })
  }
  return updated
}
