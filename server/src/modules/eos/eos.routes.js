import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize, redactFinancials, internalOnly } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'
import { logAudit } from '../../core/audit.js'
import { eosCatalog, eosDetail, eosPending, importEosEntries, syncLinkedItems, eosUpdatesAvailable } from '../../core/eos.js'
import { versionsOf, stripEosOwned } from '../../core/eosfields.js'
import { runEosSync, lastEosSync } from '../../core/eosautosync.js'
import { settings as systemSettings, invalidatePolicy } from '../../core/policy.js'

// ─────────────────────────────────────────────────────────────────────────────
// CULINOVA EOS (engineering knowledge base) → ERP Item Master. The Item Master lives
// in the WAREHOUSE panel, so every route is guarded on 'warehouse'. EOS is the source of
// truth for approved product/engineering data; the ERP imports approved entries, keeps
// engineering fields READ-ONLY once linked, re-syncs on demand and keeps a version history.
// The heavy lifting is in core/eos.js + core/eosfields.js — routes are thin wrappers.
// ─────────────────────────────────────────────────────────────────────────────

// Annotate raw EOS entries with whether they're already in the ERP Item Master (by link or brand+model).
async function markImported(items) {
  if (!items.length) return items
  const { data: erpItems } = await supabase.from('items').select('id, eos_entry_id, brand, model')
  const byEos = new Map()
  const byModel = new Map()
  for (const it of erpItems || []) {
    if (it.eos_entry_id) byEos.set(String(it.eos_entry_id), it.id)
    if (it.brand && it.model) byModel.set(`${it.brand}|${it.model}`.toLowerCase(), it.id)
  }
  return items.map((e) => {
    const linked = byEos.get(String(e.id))
    const modelKey = `${e.brand || ''}|${e.model_number || e.code || ''}`.toLowerCase()
    const matched = !linked && (e.brand || e.model_number || e.code) ? byModel.get(modelKey) : null
    return { ...e, erp_item_id: linked || matched || null, imported: !!(linked || matched), linked_by: linked ? 'eos' : matched ? 'model' : null }
  })
}

export function eosRouter() {
  const r = Router()

  // ── BROWSE the approved EOS catalog (raw list, every approved entry) with search/pagination ──
  r.get('/catalog', authRequired, authorize('warehouse', 'read'), asyncWrap(async (req, res) => {
    const query = (req.query.query || '').trim()
    const page = Math.max(1, parseInt(req.query.page || '1', 10))
    const limit = Math.min(60, Math.max(1, parseInt(req.query.limit || '48', 10)))
    let data
    try { data = await eosCatalog({ query, page, limit }) }
    catch (e) { return res.status(502).json({ error: `Could not reach EOS knowledge base: ${e.message}` }) }
    const items = await markImported(data.items || [])
    res.json({ items, page: data.page || page, limit: data.limit || limit, total: data.total || items.length, mode: data.mode || 'all' })
  }))

  // ── PENDING import queue — every approved EOS entry marked imported:true/false. The UI shows ONLY
  //    the not-yet-imported ones ("jo select kar chuka hu wo list me nazar nahi aani chahiye"). ──
  r.get('/pending', authRequired, authorize('warehouse', 'read'), asyncWrap(async (req, res) => {
    const query = (req.query.query || '').trim()
    const page = Math.max(1, parseInt(req.query.page || '1', 10))
    const limit = Math.min(60, Math.max(1, parseInt(req.query.limit || '48', 10)))
    let data
    try { data = await eosPending({ query, page, limit }) }
    catch (e) { return res.status(502).json({ error: `Could not reach EOS knowledge base: ${e.message}` }) }
    // { entries: [...marked], pending, imported, items, page, limit, total, mode } — no money, no redaction needed
    res.json(data)
  }))

  // ── PREVIEW one EOS entry (full engineering detail) before importing ──
  r.get('/detail/:id', authRequired, authorize('warehouse', 'read'), asyncWrap(async (req, res) => {
    let detail
    try { detail = await eosDetail(req.params.id) }
    catch (e) { return res.status(502).json({ error: `Could not reach EOS knowledge base: ${e.message}` }) }
    if (!detail?.entry) return res.status(404).json({ error: 'EOS entry not found' })
    const [marked] = await markImported([{ ...detail.entry }])
    res.json({ ...detail, erp_item_id: marked.erp_item_id, imported: marked.imported })
  }))

  // Back-compat alias used by the older client helper (DataContext.eosDetail → /eos/catalog/:id).
  r.get('/catalog/:id', authRequired, authorize('warehouse', 'read'), asyncWrap(async (req, res) => {
    let detail
    try { detail = await eosDetail(req.params.id) }
    catch (e) { return res.status(502).json({ error: `Could not reach EOS knowledge base: ${e.message}` }) }
    if (!detail?.entry) return res.status(404).json({ error: 'EOS entry not found' })
    const [marked] = await markImported([{ ...detail.entry }])
    res.json({ ...detail, erp_item_id: marked.erp_item_id, imported: marked.imported })
  }))

  // ── IMPORT selected approved EOS entries into the Item Master. core.importEosEntries:
  //    rejects non-approved · de-dupes by eos_entry_id AND brand+model · bumps version · snapshots ·
  //    skips when the content hash is unchanged. Returns {created,updated,linked,unchanged,failed,items,errors}. ──
  r.post('/import', authRequired, authorize('warehouse', 'create'), asyncWrap(async (req, res) => {
    const ids = Array.isArray(req.body.ids) ? [...new Set(req.body.ids.filter(Boolean).map(String))] : []
    if (!ids.length) return res.status(422).json({ error: 'Select at least one EOS item to import' })
    if (ids.length > 200) return res.status(422).json({ error: 'Max 200 items per import' })
    let results
    try { results = await importEosEntries(ids, req.user) }
    catch (e) { return res.status(502).json({ error: `EOS import failed: ${e.message}` }) }
    await logAudit(req.user, 'item', null, 'eos-import', {
      created: results.created, updated: results.updated, linked: results.linked, unchanged: results.unchanged, failed: results.failed,
    }).catch(() => {})
    res.json(results)
  }))

  // ── UPDATE AVAILABLE (read-only) — which linked items have newer engineering data in EOS.
  //    Writes nothing; the UI shows an "Update Available" badge and the user chooses to sync. ──
  r.get('/updates', authRequired, authorize('warehouse', 'read'), asyncWrap(async (req, res) => {
    let report
    try { report = await eosUpdatesAvailable() }
    catch (e) { return res.status(502).json({ error: `Could not reach EOS knowledge base: ${e.message}` }) }
    res.json(report)
  }))

  // ── RE-SYNC every already-linked item from EOS (refresh engineering data, keep pricing). ──
  r.post('/sync', authRequired, authorize('warehouse', 'update'), asyncWrap(async (req, res) => {
    let report
    try { report = await syncLinkedItems(req.user) }
    catch (e) { return res.status(502).json({ error: `EOS sync failed: ${e.message}` }) }
    await logAudit(req.user, 'item', null, 'eos-sync-all', { checked: report.checked, updated: report.updated, failed: report.failed }).catch(() => {})
    res.json(report)
  }))

  // ── RE-SYNC a single already-linked item from EOS. ──
  r.post('/sync/:itemId', authRequired, authorize('warehouse', 'update'), asyncWrap(async (req, res) => {
    const { data: item } = await supabase.from('items').select('id, eos_entry_id').eq('id', req.params.itemId).maybeSingle()
    if (!item) return res.status(404).json({ error: 'Item not found' })
    if (!item.eos_entry_id) return res.status(422).json({ error: 'This item is not linked to an EOS entry' })
    let report
    try { report = await syncLinkedItems(req.user, { ids: [req.params.itemId] }) }
    catch (e) { return res.status(502).json({ error: `EOS sync failed: ${e.message}` }) }
    await logAudit(req.user, 'item', item.id, 'eos-sync', { updated: report.updated }).catch(() => {})
    res.json(report)
  }))

  // ── STATUS strip — total items, EOS-linked count, approved-pending count, last sync time. ──
  r.get('/status', authRequired, internalOnly, asyncWrap(async (req, res) => {
    const [totalRes, linkedRes, lastSyncRes] = await Promise.all([
      supabase.from('items').select('*', { count: 'exact', head: true }),
      supabase.from('items').select('*', { count: 'exact', head: true }).not('eos_entry_id', 'is', null),
      supabase.from('items').select('eos_synced_at').not('eos_synced_at', 'is', null).order('eos_synced_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    const totalItems = totalRes.count || 0
    const eosLinked = linkedRes.count || 0
    let totalApproved = null, pendingApproved = null, eosReachable = true
    try {
      const cat = await eosCatalog({ limit: 1 })
      totalApproved = cat.total ?? null
      if (totalApproved != null) pendingApproved = Math.max(0, totalApproved - eosLinked)
    } catch { eosReachable = false }
    res.json({
      total_items: totalItems,
      eos_linked: eosLinked,
      total_approved: totalApproved,
      pending_approved: pendingApproved,
      last_sync: lastSyncRes.data?.eos_synced_at || null,
      eos_reachable: eosReachable,
      // the governing policy — the UI shows the user WHY it cannot create an item here
      policy: await systemSettings(),
      last_auto_sync: lastEosSync(),
    })
  }))

  // ── AUTOMATIC SYNC — the CEO's rule is that approved EOS items flow in on their own. This runs on a
  //    DB-driven interval in the background; this endpoint forces a pass right now. ──
  r.post('/auto-sync/run', authRequired, authorize('warehouse', 'update'), asyncWrap(async (req, res) => {
    const report = await runEosSync({ trigger: `manual:${req.user.name}` })
    await logAudit(req.user, 'eos', null, 'auto-sync', report).catch(() => {})
    res.json(report)
  }))

  // ── the policy itself (admin) — kept in the DB so the rule can change without a code change ──
  r.get('/policy', authRequired, internalOnly, asyncWrap(async (req, res) => {
    res.json(await systemSettings())
  }))
  r.patch('/policy', authRequired, authorize('admin', 'update'), asyncWrap(async (req, res) => {
    const allowed = ['item_creation_source', 'eos_auto_sync', 'eos_auto_sync_minutes']
    const updates = Object.entries(req.body || {}).filter(([k]) => allowed.includes(k))
    if (!updates.length) return res.status(422).json({ error: `Nothing to update. Allowed: ${allowed.join(', ')}` })
    for (const [key, value] of updates) {
      await supabase.from('system_settings').update({ value: String(value), updated_at: new Date().toISOString() }).eq('key', key)
    }
    invalidatePolicy()
    await logAudit(req.user, 'system_settings', null, 'updated', Object.fromEntries(updates)).catch(() => {})
    res.json(await systemSettings())
  }))

  // ── VERSION HISTORY for one item (each import/sync/edit is snapshotted). Snapshots carry the full
  //    item row incl. cost/supplier/margin, so redact for roles that must never see money. ──
  r.get('/versions/:itemId', authRequired, authorize('warehouse', 'read'), asyncWrap(async (req, res) => {
    const { data: item } = await supabase.from('items').select('id').eq('id', req.params.itemId).maybeSingle()
    if (!item) return res.status(404).json({ error: 'Item not found' })
    const versions = await versionsOf(req.params.itemId)
    res.json(redactFinancials(req.user.role, versions))
  }))

  // ── READ-ONLY ENFORCEMENT helper. The item UPDATE path (item.routes.js — not owned here) should call
  //    stripEosOwned itself; this endpoint lets a client pre-validate an edit and tells the user WHICH
  //    engineering fields are blocked (they belong to EOS) plus the safe subset that would actually apply. ──
  r.post('/validate-edit', authRequired, authorize('warehouse', 'update'), asyncWrap(async (req, res) => {
    const { item_id, patch } = req.body || {}
    if (!item_id) return res.status(422).json({ error: 'item_id is required' })
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return res.status(422).json({ error: 'patch must be an object of fields' })
    const { data: item } = await supabase.from('items').select('*').eq('id', item_id).maybeSingle()
    if (!item) return res.status(404).json({ error: 'Item not found' })
    const { patch: safe_patch, blocked } = stripEosOwned(patch, item)
    res.json({ item_id, eos_linked: !!item.eos_entry_id, blocked, safe_patch })
  }))

  return r
}

// Default export is a mounted router instance so the existing `api.use('/eos', eosRoutes)` keeps working.
export default eosRouter()
