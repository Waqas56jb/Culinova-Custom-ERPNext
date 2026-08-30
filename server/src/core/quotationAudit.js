/**
 * Sprint 3 Block 3 — quotation audit trail helpers
 */
import { supabase } from '../config/supabase.js'
import { canSeeFinancials, isManagement } from '../rbac/permissions.js'

const FINANCIAL_AUDIT_DETAIL_KEYS = [
  'amount', 'total', 'total_amount', 'net_amount', 'cost', 'cost_amount',
  'gp_percent', 'gross_profit', 'channels', 'overdue_amount', 'credit_warning',
]

/** Strip financial amounts from audit details for Sales viewers. */
export function stripAuditForSales(entry) {
  if (!entry || typeof entry !== 'object') return entry
  const details = entry.details
  if (!details || typeof details !== 'object') return entry
  const clean = { ...details }
  for (const k of FINANCIAL_AUDIT_DETAIL_KEYS) delete clean[k]
  if (clean.channels && typeof clean.channels === 'object') {
    clean.channels = { portal: !!clean.channels.portal, email: clean.channels.email, pdf: clean.channels.pdf }
  }
  return { ...entry, details: clean }
}

/**
 * Merged trail: audit_log + quotation_revisions + approval-flavoured rows, newest first.
 */
export async function quotationAuditTrail(quotationId, viewerRole) {
  const [{ data: audits }, { data: revs }] = await Promise.all([
    supabase.from('audit_log').select('*')
      .eq('entity', 'quotation').eq('entity_id', String(quotationId))
      .order('created_at', { ascending: false }).limit(100),
    supabase.from('quotation_revisions').select('*')
      .eq('quotation_id', quotationId)
      .order('created_at', { ascending: false }).limit(100),
  ])

  const items = []
  for (const a of audits || []) {
    items.push({
      kind: 'audit',
      id: a.id,
      at: a.created_at,
      action: a.action,
      actor: a.user_name,
      actor_id: a.user_id,
      details: a.details || null,
    })
  }
  for (const r of revs || []) {
    const c = r.changes || {}
    items.push({
      kind: 'revision',
      id: r.id,
      at: r.created_at,
      action: c.action || 'revision',
      actor: c.by || null,
      actor_id: r.changed_by,
      revision: r.revision,
      reason: c.reason || (c.action === 'auto: edit' || c.reason === 'auto: edit' ? 'auto: edit' : (c.note ? 'manual' : null)),
      note: c.note || null,
      details: {
        reason: c.reason || null,
        note: c.note || null,
        diff: c.diff || null,
        from_status: c.from_status || null,
        // snapshot totals only for financial roles
        snapshot_total: c.snapshot?.header?.total_amount,
        snapshot_gp: c.snapshot?.header?.gp_percent,
      },
    })
  }

  items.sort((a, b) => new Date(b.at) - new Date(a.at))

  const seeFin = canSeeFinancials(viewerRole) || isManagement(viewerRole)
  if (seeFin) return items
  return items.map((e) => {
    const stripped = stripAuditForSales(e)
    if (stripped.details) {
      delete stripped.details.snapshot_total
      delete stripped.details.snapshot_gp
      delete stripped.details.diff // may contain cost fields
    }
    return stripped
  })
}
