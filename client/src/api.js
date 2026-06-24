const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5050/api'

export const getToken = () => localStorage.getItem('culinova_token')

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) { const t = getToken(); if (t) headers.Authorization = `Bearer ${t}` }
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}
