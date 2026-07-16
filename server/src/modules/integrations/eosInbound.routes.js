import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { env } from '../../config/env.js'
import { asyncWrap } from '../../middleware/error.js'
import { STATUSES } from '../../core/engineeringSync.js'
import { logAudit } from '../../core/audit.js'

const r = Router()

function requireIntegrationKey(req, res, next) {
  const key = req.headers['x-erp-integration-key'] || req.headers['x-eos-integration-key']
  const expected = env.erpEosIntegrationKey
  if (!expected) return res.status(503).json({ error: 'ERP integration key not configured on server' })
  if (key !== expected) return res.status(401).json({ error: 'Invalid integration key' })
  next()
}

r.use(requireIntegrationKey)

/** EOS → ERP push when engineering completes BOQ / status changes. */
r.post('/engineering-requests/sync', asyncWrap(async (req, res) => {
  const p = req.body || {}
  const erpId = p.erp_request_id
  if (!erpId) return res.status(422).json({ error: 'erp_request_id is required' })

  const { data: er } = await supabase.from('engineering_requests').select('*').eq('id', erpId).maybeSingle()
  if (!er) return res.status(404).json({ error: 'Engineering request not found' })

  const patch = { updated_at: new Date().toISOString() }
  if (p.status) {
    if (!STATUSES.includes(p.status)) {
      return res.status(422).json({ error: `Invalid status. Allowed: ${STATUSES.join(', ')}` })
    }
    patch.status = p.status
  }
  if (Array.isArray(p.approved_items)) patch.approved_items = p.approved_items
  if (p.eos_request_id) patch.eos_request_id = p.eos_request_id
  if (p.ceks_project_id) patch.eos_project_id = p.ceks_project_id

  const { data, error } = await supabase.from('engineering_requests').update(patch).eq('id', erpId).select().single()
  if (error) throw error

  await logAudit({ id: null, name: 'EOS Integration', role: 'System' }, 'engineering_request', data.id, 'eos-sync', {
    status: data.status,
    approved_count: (data.approved_items || []).length,
  })

  res.json({ synced: true, request: data })
}))

export default r
