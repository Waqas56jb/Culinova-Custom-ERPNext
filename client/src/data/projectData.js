// CULINOVA ERP — Project derived helpers (pure functions, no data).
// Cost fields (committed_cost / actual_cost) are REDACTED server-side for non-management
// roles → they arrive absent (the raw snake_case keys are undefined). GP must be presence-based
// and null-propagating: never subtract an absent cost from the contract and report a confident 0.
export const hasCost = (p) => !!p && (p.committed_cost != null || p.actual_cost != null)
export const gpOf = (p) => (hasCost(p) ? (p.contractValue || 0) - (p.committedCost || 0) : null)
export const gpPctOf = (p) => (hasCost(p) && p.contractValue ? Math.round((gpOf(p) / p.contractValue) * 100) : null)
export const collectionPctOf = (p) => (p.billed ? Math.round((p.collected / p.billed) * 100) : 0)
export const procurementPctOf = (p) => (p.contractValue ? Math.round((p.committedCost / p.contractValue) * 100) : 0)

export const progressTrend = []
