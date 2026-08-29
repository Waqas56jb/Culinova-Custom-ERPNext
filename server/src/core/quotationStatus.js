/**
 * Sprint 3 Block 1 — quotation status model (CRM-004..007)
 * Status is free text (no DB enum). 'Open' is a legacy alias for 'Sent'.
 */

export const QUOTE_STATUSES = [
  'Draft',
  'Pending Approval',
  'Sent',
  'Under Negotiation',
  'Rejected',
  'Ordered',
  'Lost',
  'Expired',
]

/** Legacy read alias — treat as Sent for transitions / accept. */
export function normalizeQuoteStatus(status) {
  if (status === 'Open') return 'Sent'
  return status
}

export const LIVE_QUOTE_STATUSES = [
  'Draft',
  'Open',
  'Sent',
  'Pending Approval',
  'Under Negotiation',
  'Ordered',
]

/** acceptQuotation precondition only — do not expand internals elsewhere. */
export const ACCEPT_FROM_STATUSES = ['Sent', 'Under Negotiation', 'Open']

const ALLOWED = {
  Draft: ['Pending Approval', 'Sent', 'Lost'],
  'Pending Approval': ['Sent', 'Rejected', 'Draft'],
  Rejected: ['Draft'],
  Sent: ['Under Negotiation', 'Ordered', 'Lost', 'Expired', 'Draft'],
  'Under Negotiation': ['Sent', 'Ordered', 'Lost', 'Draft'],
  Lost: [],
  Ordered: [],
  Expired: ['Draft'],
  Open: ['Under Negotiation', 'Ordered', 'Lost', 'Expired', 'Draft'], // legacy = Sent
}

/**
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function canTransition(from, to) {
  if (!from || !to) return { ok: false, error: 'Status transition requires from and to' }
  if (from === to) return { ok: true }
  const fromN = normalizeQuoteStatus(from)
  const toN = normalizeQuoteStatus(to)
  if (fromN === toN) return { ok: true }
  const allowed = ALLOWED[from] || ALLOWED[fromN] || []
  if (allowed.includes(to) || allowed.includes(toN)) return { ok: true }
  return {
    ok: false,
    error: `Illegal status transition: ${from} → ${to}`,
  }
}

export function assertTransition(from, to) {
  const r = canTransition(from, to)
  if (!r.ok) {
    const err = new Error(r.error)
    err.status = 422
    err.code = 'ILLEGAL_STATUS_TRANSITION'
    throw err
  }
}
