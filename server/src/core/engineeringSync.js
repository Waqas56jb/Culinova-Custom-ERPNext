import { env } from '../config/env.js'

const STATUSES = [
  'Pending Engineering Review', 'Under Design', 'Awaiting Information',
  'Equipment Selection Completed', 'Ready for Quotation',
]

export { STATUSES }

async function eosPost(path, body) {
  const key = env.erpEosIntegrationKey
  if (!key) return null
  const res = await fetch(`${env.eosApiUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-erp-integration-key': key },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data; try { data = JSON.parse(text) } catch { data = { error: text } }
  if (!res.ok) throw new Error(data.error || `EOS sync failed (${res.status})`)
  return data
}

async function eosPatch(path, body) {
  const key = env.erpEosIntegrationKey
  if (!key) return null
  const res = await fetch(`${env.eosApiUrl}${path}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-erp-integration-key': key },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data; try { data = JSON.parse(text) } catch { data = { error: text } }
  if (!res.ok) throw new Error(data.error || `EOS sync failed (${res.status})`)
  return data
}

export async function pushEngineeringRequest(row) {
  try {
    return await eosPost('/api/integrations/erp/engineering-requests', {
      erp_request_id: row.id,
      erp_number: row.number,
      customer: row.customer,
      project_name: row.project_name,
      project_type: row.project_type,
      project_location: row.project_location,
      drawings: row.drawings || [],
      boq_text: row.boq_text,
      sales_notes: row.sales_notes,
      required_date: row.required_date,
      status: row.status,
    })
  } catch (e) {
    return { synced: false, error: e.message }
  }
}

export async function syncEngineeringStatus(row) {
  const key = env.erpEosIntegrationKey
  if (!key || !row.eos_request_id) return null
  try {
    const res = await fetch(`${env.eosApiUrl}/api/integrations/erp/engineering-requests/${row.eos_request_id}`, {
      headers: { accept: 'application/json', 'x-erp-integration-key': key },
    })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

export async function patchEngineeringOnEos(eosRequestId, patch) {
  try {
    return await eosPatch(`/api/integrations/erp/engineering-requests/${eosRequestId}`, patch)
  } catch { return null }
}
