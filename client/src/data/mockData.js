// CULINOVA ERP — shared formatter + chart-series placeholders.
// All record/series data now comes live from the backend (Supabase) via DataContext.
// These named exports remain (empty) only so chart components keep resolving until
// real aggregation endpoints are added.

export const sar = (n) => 'SAR ' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })

export const kpis = []
export const miniStats = []
export const salesTrend = []
export const pipelineFunnel = []
export const quotationStatus = []
export const leadSources = []
export const topCustomers = []
export const recentActivity = []
export const leads = []
export const opportunities = []
export const quotations = []
export const salesOrders = []
export const customers = []
