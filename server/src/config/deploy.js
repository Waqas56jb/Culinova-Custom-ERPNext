/**
 * Deployed Culinova URLs — ERP server (Node ESM).
 */
const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL

export const URLS = {
  erp: { api: 'https://culinova-backend.vercel.app' },
  eos: { api: 'https://culinova-rag-knowledgebase-server.vercel.app' },
}

export const DEV = {
  erpApi: 'http://localhost:5050',
  eosApi: 'http://localhost:4400',
}

export function eosApiUrl() {
  const u = process.env.EOS_API_URL || (isProd ? URLS.eos.api : DEV.eosApi)
  return String(u).replace(/\/$/, '')
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
