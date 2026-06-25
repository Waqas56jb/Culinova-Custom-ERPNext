import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'
import { recomputeProject } from '../../core/projectcost.js'

const r = Router()

// Assignable team members (internal staff, not customers) for the PM to assign work to.
r.get('/team', authRequired, authorize('projects', 'read'), asyncWrap(async (req, res) => {
  const { data, error } = await supabase.from('users').select('id, name, designation, role').neq('role', 'Customer').order('name')
  if (error) throw error
  res.json(data || [])
}))

// PM updates a BOQ line: budget cost, actual cost, assignee, status → cost & progress auto roll up.
r.patch('/boq/:id', authRequired, authorize('projects', 'update'), asyncWrap(async (req, res) => {
  const patch = {}
  if (req.body.budget_cost != null) patch.budget_cost = Number(req.body.budget_cost) || 0
  if (req.body.actual_cost != null) patch.actual_cost = Number(req.body.actual_cost) || 0
  if (req.body.status) patch.status = req.body.status
  if (req.body.assignee_id !== undefined) patch.assignee_id = req.body.assignee_id || null
  const { data, error } = await supabase.from('project_boq').update(patch).eq('id', req.params.id).select().single()
  if (error) throw error
  await recomputeProject(data.project_id) // keep project cost/GP/progress in sync
  res.json(data)
}))

export default r
