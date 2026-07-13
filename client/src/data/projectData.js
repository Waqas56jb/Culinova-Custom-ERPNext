// CULINOVA ERP — Project derived helpers (pure functions, no data).
//
// GP must be MEANINGFUL-cost based and null-propagating — never presence based.
// Why: every role that can open the Projects panel (Management, System Admin, Project Manager) is a
// financial role, so committed_cost / actual_cost are ALWAYS present on the payload — they just arrive
// as 0 until a cost is actually booked (BOQ / equipment / supplier invoice). A presence check therefore
// always passed and the app confidently rendered "GP 100%" (contract − 0). A project with no cost booked
// has an UNKNOWN margin, not a 100% one → gpOf / gpPctOf return null and every consumer renders '—'.
// (A non-financial role would get the fields redacted → undefined → Number(undefined) = NaN → not > 0 →
// still null. The same predicate covers both cases honestly.)
const num = (v) => Number(v)
const booked = (raw, mapped) => num(raw) > 0 || num(mapped) > 0   // NaN/undefined/null/0 ⇒ not booked

export const hasCost = (p) =>
  !!p && (booked(p.committed_cost, p.committedCost) || booked(p.actual_cost, p.actualCost))

export const gpOf = (p) => (hasCost(p) ? (p.contractValue || 0) - (p.committedCost || 0) : null)
export const gpPctOf = (p) => (hasCost(p) && p.contractValue ? Math.round((gpOf(p) / p.contractValue) * 100) : null)
export const collectionPctOf = (p) => (p.billed ? Math.round((p.collected / p.billed) * 100) : 0)
export const procurementPctOf = (p) => (p.contractValue ? Math.round((p.committedCost / p.contractValue) * 100) : 0)

export const progressTrend = []
