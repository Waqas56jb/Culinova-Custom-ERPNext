import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'
import { notifyOwnerDecision } from '../../core/notify.js'
import { approveVrRequest, rejectVrRequest } from '../../core/vrApproval.js'
import { isManagement } from '../../rbac/permissions.js'
import { redactFinancials } from '../../middleware/rbac.js'
import { decideCreditOverride } from '../../core/creditOverride.js'
import { logAudit } from '../../core/audit.js'

const r = Router()

// ── recipient's own feed (any logged-in user) ──
r.get('/', authRequired, asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('notifications').select('*')
    .eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(50)
  if (error) throw error
  const items = data || []
  res.json({ items, unread: items.filter((n) => !n.read).length })
}))

r.post('/read-all', authRequired, asyncWrap(async (req, res) => {
  await supabase.from('notifications').update({ read: true }).eq('user_id', req.user.id).eq('read', false)
  res.json({ ok: true })
}))

r.post('/:id/read', authRequired, asyncWrap(async (req, res) => {
  await supabase.from('notifications').update({ read: true }).eq('id', req.params.id).eq('user_id', req.user.id)
  res.json({ ok: true })
}))

// ── approval notifications: fetch the referenced quotation (for the PDF) ──
r.get('/:id/quotation', authRequired, asyncWrap(async (req, res) => {
  const { data: n } = await supabase.from('notifications').select('*').eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle()
  if (!n || n.ref_type !== 'quotation' || !n.ref_id) return res.status(404).json({ error: 'Not found' })
  const { data: q, error } = await supabase.from('quotations').select('*, quotation_items(*)').eq('id', n.ref_id).single()
  if (error) throw error
  // G-notif: never leak cost / margin / override internals to non-Management readers
  res.json(redactFinancials(req.user.role, q))
}))

// ── actionable notifications: Approve / Reject (quotation discount OR VR change) ──
r.post('/:id/act', authRequired, asyncWrap(async (req, res) => {
  const decision = req.body.decision // 'approved' | 'rejected'
  if (!['approved', 'rejected'].includes(decision)) return res.status(422).json({ error: 'decision must be approved or rejected' })
  if (!isManagement(req.user.role)) return res.status(403).json({ error: 'Only Management can approve or reject' })
  const { data: n } = await supabase.from('notifications').select('*').eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle()
  if (!n || n.action_status !== 'pending') {
    if (!n) return res.status(404).json({ error: 'Not found' })
    return res.status(422).json({ error: 'This request was already actioned' })
  }

  const auditDecision = async (extra = {}) => {
    await logAudit(req.user, n.ref_type || 'notification', n.ref_id, 'approval_decision', {
      type: n.type,
      decision,
      target_id: n.ref_id,
      notification_id: n.id,
      ...extra,
    })
  }

  // Quotation discount approval (existing)
  if (n.type === 'approval' && n.ref_type === 'quotation') {
    const patch = decision === 'approved'
      ? { approval_status: 'Approved', status: 'Sent', approved_by: req.user.id }
      : { approval_status: 'Rejected', status: 'Rejected' }
    const { data: q, error } = await supabase.from('quotations').update(patch).eq('id', n.ref_id).select('number, customer, owner_id').single()
    if (error) throw error
    await supabase.from('notifications').update({ action_status: decision, read: true }).eq('ref_id', n.ref_id).eq('type', 'approval')
    await notifyOwnerDecision(q, decision, req.user.name)
    await auditDecision({ quotation_number: q?.number })
    return res.json({ ok: true, decision })
  }

  // Credit override — 4th+ quotation for overdue customer (Sprint 3 Block 2)
  if (n.type === 'credit_override' && n.ref_type === 'credit_override') {
    try {
      await decideCreditOverride(n.ref_id, decision, req.user)
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message })
    }
    await auditDecision()
    return res.json({ ok: true, decision })
  }

  // VR change approval (Sprint 1b Block 2)
  if (n.type === 'vr_change' && n.ref_type === 'vr_request') {
    try {
      if (decision === 'approved') await approveVrRequest(n.ref_id, req.user)
      else {
        const reason = String(req.body?.reason || req.body?.decision_note || '').trim() || 'Rejected from notification'
        await rejectVrRequest(n.ref_id, req.user, reason)
      }
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message })
    }
    await supabase.from('notifications').update({ action_status: decision, read: true }).eq('ref_id', n.ref_id).eq('type', 'vr_change')
    await auditDecision()
    return res.json({ ok: true, decision })
  }

  return res.status(404).json({ error: 'Not an actionable notification' })
}))

// ── admin: audience metadata (designations + live counts) for the compose form ──
r.get('/audiences', authRequired, authorize('admin', 'read'), asyncWrap(async (req, res) => {
  const { data } = await supabase.from('users').select('role, designation')
  const all = data || []
  res.json({
    customers: all.filter((u) => u.role === 'Customer').length,
    employees: all.filter((u) => u.role !== 'Customer').length,
    designations: [...new Set(all.filter((u) => u.role !== 'Customer' && u.designation).map((u) => u.designation))].sort(),
  })
}))

// ── admin: send a notification / announcement to a target audience ──
r.post('/send', authRequired, authorize('admin', 'create'), asyncWrap(async (req, res) => {
  const { audience, value, title, body } = req.body
  const msg = (body || '').trim()
  if (!msg) return res.status(422).json({ error: 'Message is required' })

  let q = supabase.from('users').select('id')
  if (audience === 'all_customers') q = q.eq('role', 'Customer')
  else if (audience === 'all_employees') q = q.neq('role', 'Customer')
  else if (audience === 'designation') {
    if (!value) return res.status(422).json({ error: 'Pick a designation' })
    q = q.neq('role', 'Customer').ilike('designation', value)
  } else if (audience === 'email') {
    if (!value) return res.status(422).json({ error: 'Enter the recipient email' })
    q = q.ilike('email', value.trim())
  } else return res.status(422).json({ error: 'Choose who should receive this' })

  const { data: recipients, error } = await q
  if (error) throw error
  if (!recipients?.length) return res.status(404).json({ error: 'No matching recipients found' })

  const rows = recipients.map((u) => ({ user_id: u.id, title: (title || 'Announcement').trim(), body: msg, sender: req.user.name }))
  const { error: e2 } = await supabase.from('notifications').insert(rows)
  if (e2) throw e2
  res.status(201).json({ ok: true, sent: rows.length })
}))

export default r
