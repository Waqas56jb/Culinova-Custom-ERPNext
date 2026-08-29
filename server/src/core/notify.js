import { supabase } from '../config/supabase.js'

const sar = (n) => 'SAR ' + Math.round(Number(n) || 0).toLocaleString('en-US')

// High-discount quotation needs sign-off → notify Management (admin) with an
// actionable approval notification (View PDF + Approve / Reject on the bell).
// Idempotent: clears any earlier pending approval notice for the same quotation first.
export async function notifyManagementApproval(q, senderName) {
  if (!q?.id) return
  await supabase.from('notifications').delete().eq('ref_id', q.id).eq('type', 'approval').eq('action_status', 'pending')
  const { data: managers } = await supabase.from('users').select('id').eq('role', 'Management')
  if (!managers?.length) return
  const rows = managers.map((u) => ({
    user_id: u.id,
    type: 'approval', ref_type: 'quotation', ref_id: q.id, action_status: 'pending',
    title: 'Discount approval needed',
    body: `Quotation ${q.number} · ${q.customer} · ${q.discount_pct}% discount · Total ${sar(q.total_amount)}. Review the PDF and Approve or Reject.`,
    sender: senderName || 'Sales',
  }))
  await supabase.from('notifications').insert(rows)
}

// Tell the salesperson (quotation owner) the outcome of their approval request.
export async function notifyOwnerDecision(quotation, decision, byName) {
  if (!quotation?.owner_id) return
  await supabase.from('notifications').insert({
    user_id: quotation.owner_id,
    title: `Quotation ${decision}`,
    body: `Quotation ${quotation.number} for ${quotation.customer} was ${decision} by ${byName}.`,
    sender: byName,
  })
}

/** Sprint 1b Block 2 — pending VR change → notify Management (actionable). */
export async function notifyVrChangeRequest(req, senderName) {
  if (!req?.id) return
  await supabase.from('notifications').delete().eq('ref_id', req.id).eq('type', 'vr_change').eq('action_status', 'pending')
  const { data: managers } = await supabase.from('users').select('id').eq('role', 'Management')
  if (!managers?.length) return
  const oldV = req.old_value != null ? Number(req.old_value) : '—'
  const newV = Number(req.new_value)
  const rows = managers.map((u) => ({
    user_id: u.id,
    type: 'vr_change', ref_type: 'vr_request', ref_id: req.id, action_status: 'pending',
    title: 'Valuation Rate approval needed',
    body: `${req.item_name || 'Item'} · VR ${oldV} → ${newV}${req.reason ? ` · ${req.reason}` : ''}. Approve or Reject.`,
    sender: senderName || req.requested_by || 'Stock',
  }))
  await supabase.from('notifications').insert(rows)
}

/** Tell the VR requester the approve/reject outcome. */
export async function notifyVrDecision(req, decision, byName) {
  if (!req?.requested_by_id) return
  await supabase.from('notifications').insert({
    user_id: req.requested_by_id,
    title: `VR change ${decision}`,
    body: `${req.item_name || 'Item'} · VR ${req.old_value ?? '—'} → ${req.new_value} was ${decision} by ${byName}.`,
    sender: byName,
  })
}
