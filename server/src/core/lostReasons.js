/**
 * Sprint 3 Block 1 — fixed Lost reasons (Sales Rules §13)
 */

export const LOST_REASONS = [
  'Price',
  'Competitor',
  'Budget',
  'Brand Preference',
  'Project Cancelled',
  'Delayed Response',
  'Customer Decision',
  'Other',
]

/**
 * @param {{ reason?: string, note?: string }} body
 * @returns {{ ok: true, reason: string, note: string|null } | { ok: false, error: string }}
 */
export function validateLostReason(body = {}) {
  const reason = String(body.reason || '').trim()
  const note = String(body.note || body.lost_reason_note || '').trim()
  if (!reason) return { ok: false, error: 'A lost reason is required' }
  if (!LOST_REASONS.includes(reason)) {
    return { ok: false, error: `Invalid lost reason. Allowed: ${LOST_REASONS.join(', ')}` }
  }
  if (reason === 'Other' && !note) {
    return { ok: false, error: 'Please provide details when lost reason is Other' }
  }
  return { ok: true, reason, note: note || null }
}
