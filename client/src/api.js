import { erpApiBase } from '@deploy'

const BASE = erpApiBase()

function friendlyError(msg) {
  if (!msg || typeof msg !== 'string') return 'Something went wrong. Please try again.'
  if (/duplicate key value violates unique constraint/i.test(msg)) {
    if (/brands_brand/i.test(msg)) return 'A brand with this name already exists.'
    return 'This name already exists.'
  }
  return msg
}

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
    const err = new Error(friendlyError(data.error) || `Request failed (${res.status})`)
    err.status = res.status
    err.payload = data
    throw err
  }
  return data
}
