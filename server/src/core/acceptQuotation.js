/**
 * Sprint 2 Block 1 — single accept path for portal + Management (kills G62).
 * Both channels: allocate live stock → BOQ from_stock/to_purchase → reserve from_stock only → audit.
 */
import { supabase } from '../config/supabase.js'
import { logAudit } from './audit.js'
import { projectFieldsFromQuote } from './handover.js'
import { customerCommercialGate } from './customerGate.js'
import { recomputeProject } from './projectcost.js'
import { reserveForSalesOrder } from './inventory.js'
import { allocateLines } from './availability.js'
import { winOpportunityForCustomer } from './crmflow.js'
import { ACCEPT_FROM_STATUSES } from './quotationStatus.js'

const num = (p) => `${p}-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`

/**
 * @param {{ quotationId: string, actor: { id, name, email, role }, channel: 'portal'|'management' }} opts
 * @returns {Promise<{ sales_order, project, allocation, reservations }>}
 */
export async function acceptQuotation({ quotationId, actor, channel }) {
  if (!quotationId) {
    const err = new Error('quotationId required')
    err.status = 422
    throw err
  }
  if (!['portal', 'management'].includes(channel)) {
    const err = new Error('channel must be portal|management')
    err.status = 422
    throw err
  }

  const { data: q } = await supabase.from('quotations').select('*, quotation_items(*)').eq('id', quotationId).single()
  if (!q) {
    const err = new Error('Not found')
    err.status = 404
    throw err
  }
  if (q.status === 'Ordered') {
    const err = new Error(channel === 'portal' ? 'Already accepted' : 'Quotation already accepted')
    err.status = 422
    throw err
  }
  if (q.approval_status === 'Pending' || q.status === 'Pending Approval') {
    const err = new Error(channel === 'portal'
      ? 'This quotation is pending internal approval and cannot be accepted yet.'
      : 'Quotation needs approval before it can be accepted')
    err.status = channel === 'portal' ? 422 : 403
    throw err
  }

  // Sprint 3 Block 1 — status precondition only (Sent / Under Negotiation; Open = legacy Sent)
  if (!ACCEPT_FROM_STATUSES.includes(q.status)) {
    const err = new Error(`Quotation can only be accepted from Sent or Under Negotiation (current: ${q.status})`)
    err.status = 422
    err.code = 'ILLEGAL_STATUS_TRANSITION'
    throw err
  }

  if (channel === 'portal') {
    const owns = (q.customer || '').toLowerCase() === (actor?.name || '').toLowerCase()
    if (!owns) {
      const err = new Error('Not your quotation')
      err.status = 403
      throw err
    }
  }

  const gate = await customerCommercialGate(q.customer)
  if (!gate.ok) {
    const err = new Error(gate.error)
    err.status = 422
    err.code = 'COMMERCIAL_PROFILE_REQUIRED'
    err.missing = gate.missing
    err.customer_exists = gate.customer_exists
    throw err
  }

  const { data: so, error: soErr } = await supabase.from('sales_orders').insert({
    number: num('SO'), quotation_id: q.id, customer: q.customer, amount: q.total_amount,
  }).select().single()
  if (soErr) throw soErr

  const handover = await projectFieldsFromQuote(q)
  const projRow = {
    number: num('PRJ'),
    name: `${q.customer} — ${q.project_name || 'Project'}`,
    customer: q.customer,
    sales_order_id: so.id,
    contract_value: q.total_amount,
    status: 'On Track',
    ...handover,
  }
  if (channel === 'management' && actor?.id) projRow.manager_id = actor.id

  const { data: proj, error: pErr } = await supabase.from('projects').insert(projRow).select().single()
  if (pErr) throw pErr

  const items = q.quotation_items || []
  const alloc = await allocateLines(items.map((it) => ({
    item_id: it.item_id, item_name: it.item_name, qty: it.qty,
  })))

  if (items.length) {
    await supabase.from('project_boq').insert(items.map((it, i) => ({
      project_id: proj.id,
      item_id: it.item_id || null,
      item_name: it.item_name,
      qty: it.qty,
      status: 'Waiting',
      budget_cost: (Number(it.cost) || 0) * (Number(it.qty) || 0),
      from_stock: Number(alloc[i]?.from_stock) || 0,
      to_purchase: Number(alloc[i]?.to_purchase) || 0,
    })))
  }

  await supabase.from('sales_orders').update({ project_id: proj.id }).eq('id', so.id)
  await supabase.from('quotations').update({ status: 'Ordered' }).eq('id', q.id)
  await recomputeProject(proj.id)

  const reserveItems = alloc
    .filter((l) => Number(l.from_stock) > 0)
    .map((l) => ({
      item_id: l.item_id,
      item_name: l.item_name,
      qty: Number(l.from_stock) || 0,
    }))

  const reservations = await reserveForSalesOrder({
    items: reserveItems,
    sales_order_id: so.id,
    project_id: proj.id,
    userId: actor?.id,
  })

  await winOpportunityForCustomer(q.customer, q.total_amount)

  await logAudit(actor, 'quotation', q.id, 'accepted', {
    channel,
    actor: actor?.name,
    sales_order: so.number,
    project: proj.number,
  })

  if (channel === 'portal') {
    await supabase.from('messages').insert({
      customer_name: actor?.name,
      customer_email: actor?.email,
      sender: 'customer',
      body: `✅ I have ACCEPTED quotation ${q.number}.`,
    })
  }

  return {
    ok: true,
    sales_order: so,
    project: proj,
    allocation: alloc,
    reservations: reservations || [],
  }
}
