import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'
import { logAudit } from '../../core/audit.js'
import { eosCatalog, eosDetail, importEosEntries } from '../../core/eos.js'

const r = Router()

// Annotate each EOS entry with whether it's already in the ERP Item Master (by link or brand+model).
async function markImported(items) {
  if (!items.length) return items
  const { data: erpItems } = await supabase.from('items').select('id, eos_entry_id, brand, model')
  const byEos = new Map()
  const byModel = new Map()
  for (const it of erpItems || []) {
    if (it.eos_entry_id) byEos.set(it.eos_entry_id, it.id)
    if (it.brand && it.model) byModel.set(`${it.brand}|${it.model}`.toLowerCase(), it.id)
  }
  return items.map((e) => {
    const linked = byEos.get(e.id)
    const modelKey = `${e.brand || ''}|${e.model_number || e.code || ''}`.toLowerCase()
    const matched = !linked && (e.brand || e.model_number || e.code) ? byModel.get(modelKey) : null
    return { ...e, erp_item_id: linked || matched || null, imported: !!(linked || matched), linked_by: linked ? 'eos' : matched ? 'model' : null }
  })
}

// ── BROWSE the approved EOS catalog (source of truth) with search/pagination ──
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

// ── PREVIEW one EOS entry (full engineering detail) before importing ──
r.get('/catalog/:id', authRequired, authorize('warehouse', 'read'), asyncWrap(async (req, res) => {
  let detail
  try { detail = await eosDetail(req.params.id) }
  catch (e) { return res.status(502).json({ error: `Could not reach EOS knowledge base: ${e.message}` }) }
  if (!detail?.entry) return res.status(404).json({ error: 'EOS entry not found' })
  const [marked] = await markImported([{ ...detail.entry }])
  res.json({ ...detail, erp_item_id: marked.erp_item_id, imported: marked.imported })
}))

// ── IMPORT selected approved EOS entries into the ERP Item Master ──
r.post('/import', authRequired, authorize('warehouse', 'create'), asyncWrap(async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : []
  if (!ids.length) return res.status(422).json({ error: 'Select at least one EOS item to import' })
  if (ids.length > 200) return res.status(422).json({ error: 'Max 200 items per import' })
  let results
  try { results = await importEosEntries(ids, req.user) }
  catch (e) { return res.status(502).json({ error: `EOS import failed: ${e.message}` }) }
  await logAudit(req.user, 'item', null, 'eos-import', { created: results.created, updated: results.updated, linked: results.linked, failed: results.failed }).catch(() => {})
  res.json(results)
}))

// ── RE-SYNC a single already-linked item from EOS (refresh engineering data) ──
r.post('/sync/:itemId', authRequired, authorize('warehouse', 'update'), asyncWrap(async (req, res) => {
  const { data: item } = await supabase.from('items').select('id, eos_entry_id').eq('id', req.params.itemId).maybeSingle()
  if (!item) return res.status(404).json({ error: 'Item not found' })
  if (!item.eos_entry_id) return res.status(422).json({ error: 'This item is not linked to an EOS entry' })
  let results
  try { results = await importEosEntries([item.eos_entry_id], req.user) }
  catch (e) { return res.status(502).json({ error: `EOS sync failed: ${e.message}` }) }
  res.json(results)
}))

export default r
