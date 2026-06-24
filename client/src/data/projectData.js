// CULINOVA ERP — Project derived helpers (pure functions, no data).
export const gpOf = (p) => (p.contractValue || 0) - (p.committedCost || 0)
export const gpPctOf = (p) => (p.contractValue ? Math.round((gpOf(p) / p.contractValue) * 100) : 0)
export const collectionPctOf = (p) => (p.billed ? Math.round((p.collected / p.billed) * 100) : 0)
export const procurementPctOf = (p) => (p.contractValue ? Math.round((p.committedCost / p.contractValue) * 100) : 0)

export const progressTrend = []
