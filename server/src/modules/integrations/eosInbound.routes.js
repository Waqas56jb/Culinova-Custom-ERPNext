import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { env } from '../../config/env.js'
import { asyncWrap } from '../../middleware/error.js'
import { authRequired } from '../../middleware/auth.js'
import { isManagement, canAccessPanel } from '../../rbac/permissions.js'
import { STATUSES } from '../../core/engineeringSync.js'
import { logAudit } from '../../core/audit.js'
import { importEosEntries } from '../../core/eos.js'
import { lastEosTimerRunAt, markWebhookImport, lastWebhookImportAt } from '../../core/eosautosync.js'

const r = Router()

function adminOrManagement(req, res, next) {
  if (isManagement(req.user.role) || canAccessPanel(req.user.role, 'admin')) return next()
  return res.status(403).json({ error: 'Management or admin access required' })
}

/** Diagnostic — never exposes the key value. */
r.get('/status', authRequired, adminOrManagement, asyncWrap(async (_req, res) => {
  const eosUrl = env.eosApiUrl
  let can_reach_eos = false
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 3000)
    const health = await fetch(`${eosUrl}/api/health`, { signal: ctrl.signal })
    clearTimeout(timer)
    can_reach_eos = health.ok
  } catch { /* unreachable */ }
  res.json({
    eos_api_url: eosUrl || 'default',
    integration_key_set: Boolean(env.erpEosIntegrationKey),
    can_reach_eos,
    last_webhook_import_at: lastWebhookImportAt(),
    last_timer_run_at: lastEosTimerRunAt(),
  })
}))

function requireIntegrationKey(req, res, next) {
  const key = req.headers['x-erp-integration-key'] || req.headers['x-eos-integration-key']
  const expected = env.erpEosIntegrationKey
  if (!expected) return res.status(503).json({ error: 'ERP integration key not configured on server' })
  if (key !== expected) return res.status(401).json({ error: 'Invalid integration key' })
  next()
}

r.use(requireIntegrationKey)

/**
 * EOS → ERP instant Item Master import (Sprint 2 Block 3).
 * Fired on knowledge approval; same logic as manual Import / timer fallback.
 * Body: { eos_entry_ids: [uuid, ...] }  (also accepts ids for convenience)
 */
r.post('/items/import', asyncWrap(async (req, res) => {
  const raw = req.body?.eos_entry_ids ?? req.body?.ids
  const ids = Array.isArray(raw) ? [...new Set(raw.filter(Boolean).map(String))] : []
  if (!ids.length) return res.status(422).json({ error: 'eos_entry_ids is required (non-empty array)' })
  if (ids.length > 200) return res.status(422).json({ error: 'Max 200 entries per import' })

  let results
  try {
    results = await importEosEntries(ids, null)
  } catch (e) {
    return res.status(502).json({ error: `EOS import failed: ${e.message}` })
  }

  markWebhookImport()
  await logAudit({ id: null, name: 'EOS Webhook', role: 'System' }, 'item', null, 'eos-import', {
    source: 'eos-webhook',
    created: results.created,
    updated: results.updated,
    linked: results.linked,
    unchanged: results.unchanged,
    failed: results.failed,
    items: (results.items || []).slice(0, 50),
    errors: (results.errors || []).slice(0, 20),
  }).catch(() => {})

  res.json({ source: 'eos-webhook', ...results })
}))

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
