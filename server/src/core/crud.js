import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { authRequired } from '../middleware/auth.js'
import { authorize, redactFinancials } from '../middleware/rbac.js'
import { isManagement } from '../rbac/permissions.js'
import { asyncWrap } from '../middleware/error.js'
import { logAudit } from './audit.js'
import { nextNumber } from './numbering.js'

// Fields a client may NEVER set through generic CRUD (identity, audit trail, auth) — prevents
// mass-assignment tampering (e.g. forging `number`, overwriting `password_hash`, spoofing timestamps).
const IMMUTABLE = ['id', 'created_at', 'updated_at', 'number', 'password_hash']
// Strip immutable + (for non-management) any resource-declared protected fields (e.g. contract_value).
function sanitizeBody(body, cfg, role) {
  const out = { ...body }
  for (const f of IMMUTABLE) delete out[f]
  if (!isManagement(role)) for (const f of cfg.protect || []) delete out[f]
  return out
}

// Tables with a NOT NULL unique `number` — auto-generate a human reference on create.
const NUMBER_PREFIX = {
  projects: 'PRJ', sales_orders: 'SO', invoices: 'INV', rfqs: 'RFQ', purchase_orders: 'PO',
  delivery_notes: 'DN', goods_receipts: 'GRN', service_tickets: 'TKT', maintenance_visits: 'MV',
  service_contracts: 'SC', payments: 'PMT', payables: 'BILL', payroll_runs: 'PR',
  stock_transfers: 'ST', stock_adjustments: 'ADJ',
}
const genNumber = (pfx) => `${pfx}-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`

// Build a full REST router for a resource with RBAC + audit + field redaction.
export function crudRouter(name, cfg) {
  const r = Router()
  const t = cfg.table
  const passwordSafe = (row) => { if (row && row.password_hash) { const c = { ...row }; delete c.password_hash; return c } return row }

  // LIST
  r.get('/', authRequired, authorize(cfg.panel, 'read'), asyncWrap(async (req, res) => {
    let q = supabase.from(t).select('*').order(cfg.orderBy || 'created_at', { ascending: false })
    // simple equality filters via querystring (?status=Open)
    Object.entries(req.query).forEach(([k, v]) => { if (!['limit', 'offset'].includes(k)) q = q.eq(k, v) })
    if (req.query.limit) q = q.limit(Number(req.query.limit))
    const { data, error } = await q
    if (error) throw error
    const rows = (data || []).map(passwordSafe)
    res.json(redactFinancials(req.user.role, rows))
  }))

  // GET one
  r.get('/:id', authRequired, authorize(cfg.panel, 'read'), asyncWrap(async (req, res) => {
    const { data, error } = await supabase.from(t).select('*').eq('id', req.params.id).single()
    if (error) return res.status(404).json({ error: 'Not found' })
    res.json(redactFinancials(req.user.role, passwordSafe(data)))
  }))

  // Some resources are managed by a dedicated flow (e.g. sales_orders via the quotation→customer-accept
  // chain) and must not be creatable/mutable through blanket CRUD. Expose them read-only.
  if (cfg.readOnly) return r

  // CREATE
  r.post('/', authRequired, authorize(cfg.panel, 'create'), asyncWrap(async (req, res) => {
    const body = sanitizeBody(req.body, cfg, req.user.role)
    const pfx = NUMBER_PREFIX[t]
    // consume the editable numbering series (Company Settings) when configured; else fall back
    if (pfx && !body.number) body.number = await nextNumber(t, pfx)
    const { data, error } = await supabase.from(t).insert(body).select().single()
    if (error) throw error
    await logAudit(req.user, name, data.id, 'created', body)
    res.status(201).json(redactFinancials(req.user.role, passwordSafe(data)))
  }))

  // UPDATE
  r.patch('/:id', authRequired, authorize(cfg.panel, 'update'), asyncWrap(async (req, res) => {
    const body = sanitizeBody(req.body, cfg, req.user.role)
    const { data, error } = await supabase.from(t).update(body).eq('id', req.params.id).select().single()
    if (error) throw error
    await logAudit(req.user, name, req.params.id, 'updated', body)
    res.json(redactFinancials(req.user.role, passwordSafe(data)))
  }))

  // DELETE
  r.delete('/:id', authRequired, authorize(cfg.panel, 'delete'), asyncWrap(async (req, res) => {
    const { error } = await supabase.from(t).delete().eq('id', req.params.id)
    if (error) throw error
    await logAudit(req.user, name, req.params.id, 'deleted')
    res.json({ ok: true })
  }))

  return r
}
