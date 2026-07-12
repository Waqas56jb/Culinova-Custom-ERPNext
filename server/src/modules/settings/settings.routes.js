import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize, internalOnly } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'
import { logAudit } from '../../core/audit.js'

const r = Router()
// Company Settings are shared reference data for every INTERNAL role (currencies/VAT feed pricing,
// branches/departments feed forms) — but a portal Customer must not read the company's CR/VAT number,
// branches or numbering. Gate the whole module to internal staff; writes stay admin-only below.
r.use(authRequired, internalOnly)

// Company Settings master data. Reads: any authenticated user (currencies/VAT/company are needed
// across modules for display + pricing). Writes: admin panel only (Management / System Admin).
// Each entity gets a consistent list/create/update/delete. `orderBy` handles tables without created_at.
const ENTITIES = {
  companies: { table: 'companies', orderBy: 'created_at' },
  branches: { table: 'branches', orderBy: 'created_at' },
  departments: { table: 'departments', orderBy: 'name' },
  currencies: { table: 'currencies', orderBy: 'code' },
  'vat-settings': { table: 'vat_settings', orderBy: 'created_at' },
  'numbering-series': { table: 'numbering_series', orderBy: 'doc_type' },
}
const IMMUTABLE = ['id', 'created_at', 'updated_at']
const clean = (b) => { const o = { ...b }; for (const f of IMMUTABLE) delete o[f]; return o }

for (const [name, cfg] of Object.entries(ENTITIES)) {
  r.get(`/${name}`, authRequired, asyncWrap(async (req, res) => {
    const { data, error } = await supabase.from(cfg.table).select('*').order(cfg.orderBy, { ascending: true })
    if (error) throw error
    res.json(data || [])
  }))
  r.post(`/${name}`, authRequired, authorize('admin', 'create'), asyncWrap(async (req, res) => {
    const { data, error } = await supabase.from(cfg.table).insert(clean(req.body)).select().single()
    if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: error.message })
    await logAudit(req.user, name, data.id, 'created', {}).catch(() => {})
    res.status(201).json(data)
  }))
  r.patch(`/${name}/:id`, authRequired, authorize('admin', 'update'), asyncWrap(async (req, res) => {
    const { data, error } = await supabase.from(cfg.table).update(clean(req.body)).eq('id', req.params.id).select().single()
    if (error) throw error
    await logAudit(req.user, name, req.params.id, 'updated', {}).catch(() => {})
    res.json(data)
  }))
  r.delete(`/${name}/:id`, authRequired, authorize('admin', 'delete'), asyncWrap(async (req, res) => {
    const { error } = await supabase.from(cfg.table).delete().eq('id', req.params.id)
    if (error) throw error
    await logAudit(req.user, name, req.params.id, 'deleted', {}).catch(() => {})
    res.json({ ok: true })
  }))
}

// Atomically consume the next document number for a doc_type (used by other modules later).
r.post('/numbering-series/:docType/next', asyncWrap(async (req, res) => {
  const { data: s } = await supabase.from('numbering_series').select('*').eq('doc_type', req.params.docType).eq('is_active', true).maybeSingle()
  if (!s) return res.status(404).json({ error: 'No active series for this document type' })
  const n = Number(s.next_number) || 1
  await supabase.from('numbering_series').update({ next_number: n + 1 }).eq('id', s.id)
  const year = new Date().getFullYear()
  const num = `${s.prefix}${s.separator}${s.include_year ? year + s.separator : ''}${String(n).padStart(s.padding || 6, '0')}`
  res.json({ number: num })
}))

export default r
