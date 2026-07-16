/**
 * Deployed Culinova URLs — Custom ERP (frontends + server).
 */
export const URLS = {
  erp: {
    api: 'https://culinova-backend.vercel.app',
    client: 'https://culinova-client.vercel.app',
    admin: 'https://culinova-admin.vercel.app',
    customer: 'https://culinova-customer.vercel.app',
  },
  eos: {
    api: 'https://culinova-rag-knowledgebase-server.vercel.app',
    client: 'https://culinova-rag-knowledgebase-client.vercel.app',
    admin: 'https://culinova-rag-knowledgebase-admin.vercel.app',
  },
}

export const DEV = {
  erpApi: 'http://localhost:5050',
  eosApi: 'http://localhost:4400',
}

export function erpApiBase(viteEnv = import.meta.env) {
  const fromEnv = viteEnv.VITE_API_URL
  if (fromEnv) return String(fromEnv).replace(/\/$/, '')
  return viteEnv.PROD ? `${URLS.erp.api}/api` : `${DEV.erpApi}/api`
}
