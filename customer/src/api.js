import { erpApiBase } from '@deploy'

const BASE = erpApiBase()
export const getToken = () => localStorage.getItem('culinova_token')

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) { const t = getToken(); if (t) headers.Authorization = `Bearer ${t}` }
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  if (res.status === 401 && auth) { // session invalid/deleted → log out & show login
    localStorage.removeItem('culinova_token'); localStorage.removeItem('culinova_user')
    window.location.reload()
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`)
    err.code = data.code
    err.missing = data.missing
    err.status = res.status
    throw err
  }
  return data
}
