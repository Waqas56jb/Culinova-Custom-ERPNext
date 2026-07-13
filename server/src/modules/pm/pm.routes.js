import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'
import { recomputeProject } from '../../core/projectcost.js'
import { nextNumber } from '../../core/numbering.js'
import { logAudit } from '../../core/audit.js'
import { allocateLines } from '../../core/availability.js'

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

// ── SEND TO PROCUREMENT ────────────────────────────────────────────────────
// The PM's hand-off to buying. This used to only flip each BOQ line's status to 'In Progress' — it
// created nothing, so Procurement never heard about it. Now it raises a real Purchase Requisition (the
// ERPNext "Material Request" step): Project → PR → RFQ → PO. The BOQ lines are marked In Progress only
// AFTER the PR is safely created, so a failure can never leave the board in a lying state.
r.post('/projects/:id/to-procurement', authRequired, authorize('projects', 'update'), asyncWrap(async (req, res) => {
  const { data: project } = await supabase.from('projects').select('id, number, name').eq('id', req.params.id).maybeSingle()
  if (!project) return res.status(404).json({ error: 'Project not found' })

  // only the lines that are actually still waiting to be bought
  const { data: waiting } = await supabase.from('project_boq').select('*').eq('project_id', project.id).eq('status', 'Waiting')
  if (!waiting?.length) return res.status(422).json({ error: 'No BOQ items are Waiting — nothing to send to Procurement.' })

  // STOCK FIRST (CEO rule R1) — Procurement may buy the SHORTFALL ONLY.
  //
  // The split was already decided when the customer accepted: from_stock is RESERVED for this very
  // order, to_purchase is the shortfall. So we must NOT re-allocate the full quantity here — that
  // stock is now reserved, would read as "unavailable", and we would end up buying what we already own.
  //
  // We only re-check the SHORTFALL against stock that is free RIGHT NOW: if a receipt landed since the
  // order was accepted, that part no longer needs buying either. The requested quantity can therefore
  // only ever shrink, never grow.
  const shortfallOf = (l) => (l.to_purchase != null ? Number(l.to_purchase) : Number(l.qty)) || 0
  const fresh = await allocateLines(waiting.map((l) => ({ item_id: l.item_id, item_name: l.item_name, qty: shortfallOf(l) })))

  const lines = waiting
    .map((l, i) => {
      const extraFromStock = Number(fresh[i]?.from_stock) || 0   // arrived since the order was accepted
      return {
        ...l,
        buy_qty: Number(fresh[i]?.to_purchase) || 0,             // ← what is genuinely still missing
        covered: (Number(l.from_stock) || 0) + extraFromStock,   // reserved at accept + arrived since
        arrived_since: extraFromStock,
      }
    })
    .filter((l) => l.buy_qty > 0)

  if (!lines.length) {
    return res.status(422).json({
      error: 'Nothing to purchase — every waiting item is already covered by stock on hand. Issue it from the warehouse instead of buying it.',
      covered_from_stock: waiting.length,
    })
  }

  const { data: pr, error } = await supabase.from('purchase_requisitions').insert({
    number: await nextNumber('purchase_requisitions', 'PR'),
    project_id: project.id,
    department: 'Projects',
    requested_by: req.user.id,
    requester_name: req.user.name,
    required_by: req.body?.required_by || null,
    priority: req.body?.priority || 'Normal',
    status: 'Submitted',
    notes: `Raised from ${project.number} — ${project.name}`,
  }).select().single()
  if (error) return res.status(422).json({ error: error.message })

  // match each BOQ line back to the Item Master where we can, so Procurement gets a real item link.
  // The requested quantity is the SHORTFALL (to_purchase), never the quantity sold.
  const items = []
  let savedUnits = 0
  for (const l of lines) {
    let itemId = l.item_id || null
    let uom = null
    if (!itemId && l.item_name) {
      const { data: item } = await supabase.from('items').select('id, stock_uom').ilike('item_name', l.item_name).limit(1).maybeSingle()
      itemId = item?.id || null; uom = item?.stock_uom || null
    } else if (itemId) {
      const { data: item } = await supabase.from('items').select('stock_uom').eq('id', itemId).maybeSingle()
      uom = item?.stock_uom || null
    }
    const soldQty = Number(l.qty) || 0
    const buyQty = l.buy_qty                 // the shortfall, after stock that arrived since
    const fromStock = l.covered              // reserved at acceptance + anything that arrived since
    savedUnits += fromStock
    items.push({
      pr_id: pr.id,
      item_id: itemId,
      item_name: l.item_name,
      qty: buyQty,                       // ← the SHORTFALL only
      sold_qty: soldQty,                 // what the customer actually bought
      covered_from_stock: fromStock,     // what we did NOT have to buy
      uom: uom || 'Nos',
      est_rate: Number(l.budget_cost) && soldQty ? Number(l.budget_cost) / soldQty : 0,
      notes: fromStock > 0
        ? `BOQ line of ${project.number} — ${soldQty} sold, ${fromStock} issued from stock, ${buyQty} to buy`
        : `BOQ line of ${project.number}`,
    })
  }
  const { error: ie } = await supabase.from('purchase_requisition_items').insert(items)
  if (ie) { await supabase.from('purchase_requisitions').delete().eq('id', pr.id); return res.status(422).json({ error: ie.message }) }

  // only the lines that actually went onto the requisition move — a line fully covered by stock stays
  // Waiting so the warehouse can issue it, instead of being silently marked as "being bought"
  const sentIds = lines.map((l) => l.id)
  await supabase.from('project_boq').update({ status: 'In Progress' }).in('id', sentIds)
  await recomputeProject(project.id)
  await logAudit(req.user, 'project', project.id, 'sent-to-procurement', { pr: pr.number, items: items.length, covered_from_stock: savedUnits })
  res.status(201).json({
    ok: true, purchase_requisition: pr.number, pr_id: pr.id, items: items.length,
    // the profitability story, in the response
    covered_from_stock: savedUnits,
    skipped_fully_in_stock: waiting.length - lines.length,
  })
}))

export default r
