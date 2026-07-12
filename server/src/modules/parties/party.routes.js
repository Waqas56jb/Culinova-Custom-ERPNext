import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'
import { logAudit } from '../../core/audit.js'

// Reusable enrichment router for a "party" master (customer / supplier): detail-with-children +
// contacts / addresses / documents CRUD. Layered BEFORE the generic CRUD (which still handles the
// base list / create / update / delete), so we only add the detail + child endpoints here.
//   party:  'customer' | 'supplier'   → master table `${party}s`, ref column `${party}_id`
//   panel:  RBAC panel for writes
export function partyRouter(party, panel) {
  const r = Router()
  const master = `${party}s`
  const ref = `${party}_id`
  const CHILDREN = { contacts: `${party}_contacts`, addresses: `${party}_addresses`, documents: `${party}_documents` }
  const strip = (b) => { const o = { ...b }; delete o.id; delete o.created_at; delete o[ref]; return o }

  // GET /:id — master record + all child collections
  r.get('/:id', authRequired, authorize(panel, 'read'), asyncWrap(async (req, res) => {
    const { data: m, error } = await supabase.from(master).select('*').eq('id', req.params.id).single()
    if (error) return res.status(404).json({ error: 'Not found' })
    const out = { ...m }
    for (const [key, table] of Object.entries(CHILDREN)) {
      const { data } = await supabase.from(table).select('*').eq(ref, req.params.id).order('created_at', { ascending: true })
      out[key] = data || []
    }
    res.json(out)
  }))

  // POST /:id/:child — add a contact / address / document
  r.post('/:id/:child', authRequired, authorize(panel, 'update'), asyncWrap(async (req, res) => {
    const table = CHILDREN[req.params.child]
    if (!table) return res.status(404).json({ error: 'Unknown collection' })
    const { data, error } = await supabase.from(table).insert({ ...strip(req.body), [ref]: req.params.id }).select().single()
    if (error) return res.status(500).json({ error: error.message })
    await logAudit(req.user, `${party}_${req.params.child}`, data.id, 'created', {}).catch(() => {})
    res.status(201).json(data)
  }))

  // PATCH /:child/:cid — edit a child row
  r.patch('/:child/:cid', authRequired, authorize(panel, 'update'), asyncWrap(async (req, res) => {
    const table = CHILDREN[req.params.child]
    if (!table) return res.status(404).json({ error: 'Unknown collection' })
    const { data, error } = await supabase.from(table).update(strip(req.body)).eq('id', req.params.cid).select().single()
    if (error) return res.status(500).json({ error: error.message })
    res.json(data)
  }))

  // DELETE /:child/:cid — remove a child row
  r.delete('/:child/:cid', authRequired, authorize(panel, 'update'), asyncWrap(async (req, res) => {
    const table = CHILDREN[req.params.child]
    if (!table) return res.status(404).json({ error: 'Unknown collection' })
    const { error } = await supabase.from(table).delete().eq('id', req.params.cid)
    if (error) return res.status(500).json({ error: error.message })
    res.json({ ok: true })
  }))

  return r
}

// Shared party categories master (customer / supplier). Reads: authenticated; writes: warehouse-ish?
// Use the owning panel per party via a small dedicated router mounted at /party-categories.
export function partyCategoriesRouter() {
  const r = Router()
  r.get('/', authRequired, asyncWrap(async (req, res) => {
    let q = supabase.from('party_categories').select('*').order('name')
    if (req.query.party) q = q.eq('party', req.query.party)
    const { data, error } = await q
    if (error) throw error
    res.json(data || [])
  }))
  r.post('/', authRequired, authorize('admin', 'create'), asyncWrap(async (req, res) => {
    const { data, error } = await supabase.from('party_categories').insert({ party: req.body.party, name: req.body.name }).select().single()
    if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: error.message })
    res.status(201).json(data)
  }))
  r.delete('/:id', authRequired, authorize('admin', 'delete'), asyncWrap(async (req, res) => {
    await supabase.from('party_categories').delete().eq('id', req.params.id); res.json({ ok: true })
  }))
  return r
}
