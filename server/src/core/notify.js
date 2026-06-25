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
