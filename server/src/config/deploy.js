/**
 * Deployed Culinova URLs — ERP server (Node ESM).
 */
const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL

export const URLS = {
  erp: {
    api: 'https://culinova-backend.vercel.app',
    customer: 'https://culinova-customer.vercel.app',
  },
  eos: { api: 'https://culinova-rag-knowledgebase-server.vercel.app' },
}

export const DEV = {
  erpApi: 'http://localhost:5050',
  eosApi: 'http://localhost:4400',
  customerPortal: 'http://localhost:5175',
}

function isLocalhostUrl(u) {
  try {
    const h = new URL(u).hostname
    return h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0'
  } catch {
    return /localhost|127\.0\.0\.1/i.test(String(u || ''))
  }
}

export function eosApiUrl() {
  const u = process.env.EOS_API_URL || (isProd ? URLS.eos.api : DEV.eosApi)
  // Prod must never call local EOS (mis-set Vercel env).
  if (isProd && isLocalhostUrl(u)) return URLS.eos.api
  return String(u).replace(/\/$/, '')
}

/** Customer portal base for quotation emails / notifications. Never localhost on Vercel. */
export function customerPortalUrl() {
  const raw = (process.env.CUSTOMER_PORTAL_URL || process.env.PORTAL_URL || '').trim()
  if (isProd) {
    if (!raw || isLocalhostUrl(raw)) return URLS.erp.customer
    return String(raw).replace(/\/$/, '')
  }
  return String(raw || DEV.customerPortal).replace(/\/$/, '')
}

export function erpCorsOrigins() {
  if (process.env.CORS_ORIGINS) {
    return process.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  }
  if (isProd) {
    return [
      'https://culinova-client.vercel.app',
      'https://culinova-admin.vercel.app',
      'https://culinova-customer.vercel.app',
      'https://culinova-suplier.vercel.app',
      'https://culinova-technician.vercel.app',
      'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175',
      'http://localhost:5176', 'http://localhost:5177',
    ]
  }
  return ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175',
    'http://localhost:5176', 'http://localhost:5177']
}
