import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'

const r = Router()

// RFQs enriched with their supplier quotes (from rfq_quotes) so the staff RFQ page can
// compare & award. The base /rfqs generic CRUD returns no join.
r.get('/rfqs', authRequired, authorize('procurement', 'read'), asyncWrap(async (req, res) => {
  const [{ data: rfqs }, { data: quotes }] = await Promise.all([
    supabase.from('rfqs').select('*').order('created_at', { ascending: false }),
    supabase.from('rfq_quotes').select('*'),
  ])
  const byRfq = {}
  for (const q of quotes || []) (byRfq[q.rfq_id] = byRfq[q.rfq_id] || []).push({ name: q.supplier, quote: Number(q.quote) || 0 })
  res.json((rfqs || []).map((rfq) => ({ ...rfq, suppliers: (byRfq[rfq.id] || []).sort((a, b) => a.quote - b.quote) })))
}))

// Send an RFQ to suppliers (marks it Requested so it's not a dead action).
r.post('/rfqs/:id/request', authRequired, authorize('procurement', 'update'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('rfqs').update({ status: 'Requested' }).eq('id', req.params.id).select().single()
  if (error) throw error
  res.json(data)
}))

export default r
