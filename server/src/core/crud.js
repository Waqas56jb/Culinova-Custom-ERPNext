import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { authRequired } from '../middleware/auth.js'
import { authorize, authorizeAny, redactFinancials } from '../middleware/rbac.js'
import { isManagement } from '../rbac/permissions.js'
import { asyncWrap } from '../middleware/error.js'
import { logAudit } from './audit.js'
import { nextNumber } from './numbering.js'
import { recomputeProject } from './projectcost.js'

// When a resource declares recomputeProject: true, any create/update/delete that carries a project_id
// re-rolls that project's committed/actual cost (so raising a PO or a variation against a project keeps
// projects.actual_cost live instead of frozen at 0). Best-effort: a recompute failure never fails the write.
async function maybeRecompute(cfg, ...rows) {
  if (!cfg.recomputeProject) return
  const ids = new Set(rows.filter(Boolean).map((r) => r.project_id).filter(Boolean))
  for (const id of ids) { try { await recomputeProject(id) } catch { /* recompute is best-effort */ } }
}

// Fields a client may NEVER set through generic CRUD (identity, audit trail, auth) — prevents
// mass-assignment tampering (e.g. forging `number`, overwriting `password_hash`, spoofing timestamps).
const IMMUTABLE = ['id', 'created_at', 'updated_at', 'number', 'password_hash']
// Strip immutable + (for non-management) any resource-declared protected fields (e.g. contract_value).
// Also coerce empty strings to null: a blank <input>/<select> submits '', which Postgres rejects for
// uuid / numeric / date / enum columns (22P02) — and because the store swallows errors, the form
// silently fails. Coercing '' → null lets optional fields be left blank across EVERY generic form.
function sanitizeBody(body, cfg, role) {
  const out = { ...body }
  for (const f of IMMUTABLE) delete out[f]
  if (!isManagement(role)) for (const f of cfg.protect || []) delete out[f]
  for (const k of Object.keys(out)) if (out[k] === '') out[k] = null
  return out
}

// Tables with a `number` column — auto-generate a human reference on create.
// (payroll_runs deliberately omitted: it has NO `number` column, so injecting one 500s the insert.)
const NUMBER_PREFIX = {
  projects: 'PRJ', sales_orders: 'SO', invoices: 'INV', rfqs: 'RFQ', purchase_orders: 'PO',
  delivery_notes: 'DN', goods_receipts: 'GRN', service_tickets: 'TKT', maintenance_visits: 'MV',
  service_contracts: 'SC', payments: 'PMT', payables: 'BILL',
  stock_transfers: 'ST', stock_adjustments: 'ADJ',
  leads: 'LEAD', opportunities: 'OPP',
}

// Cache each table's real column set (from a probe row) so list-filtering and number-injection only
// ever touch columns that actually exist. Cached for the process lifetime.
const _colCache = new Map()
async function tableColumns(table) {
  if (_colCache.has(table)) return _colCache.get(table)
  const { data } = await supabase.from(table).select('*').limit(1)
  const cols = new Set(data && data[0] ? Object.keys(data[0]) : [])
  // an empty table tells us nothing — don't cache an empty set as authoritative
  if (cols.size) _colCache.set(table, cols)
  return cols
}

// Build a full REST router for a resource with RBAC + audit + field redaction.
export function crudRouter(name, cfg) {
  const r = Router()
  const t = cfg.table
  const passwordSafe = (row) => { if (row && row.password_hash) { const c = { ...row }; delete c.password_hash; return c } return row }
  // reads may be allowed from several panels (cfg.readPanels); writes always require the owning panel
  const canRead = cfg.readPanels ? authorizeAny(cfg.readPanels, 'read') : authorize(cfg.panel, 'read')

  // LIST
  r.get('/', authRequired, canRead, asyncWrap(async (req, res) => {
    let q = supabase.from(t).select('*').order(cfg.orderBy || 'created_at', { ascending: false })
    // simple equality filters via querystring (?status=Open) — but only on REAL columns, else an
    // unknown/typo'd param becomes a bogus Postgres filter and 500s the whole list.
    const cols = await tableColumns(t)
    Object.entries(req.query).forEach(([k, v]) => { if (!['limit', 'offset'].includes(k) && cols.has(k)) q = q.eq(k, v) })
    if (req.query.limit) q = q.limit(Number(req.query.limit))
    const { data, error } = await q
    if (error) throw error
    const rows = (data || []).map(passwordSafe)
    res.json(redactFinancials(req.user.role, rows))
  }))

  // GET one
  r.get('/:id', authRequired, canRead, asyncWrap(async (req, res) => {
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
    await maybeRecompute(cfg, data)
    res.status(201).json(redactFinancials(req.user.role, passwordSafe(data)))
  }))

  // UPDATE
  // Some resources are the day-to-day work of a role that only holds "create" access. A Sales User
  // manages their own leads and opportunities (status, owner, follow-up) — that is the job, not a
  // privileged edit — so those resources set updateLevel: 'create'. Everything else stays at 'update'.
  r.patch('/:id', authRequired, authorize(cfg.panel, cfg.updateLevel || 'update'), asyncWrap(async (req, res) => {
    const body = sanitizeBody(req.body, cfg, req.user.role)
    // Everything the caller sent was stripped (immutable or protected for their role) → there is nothing
    // to update. An empty UPDATE makes Postgres 500; tell them WHY instead of returning a mystery error.
    if (!Object.keys(body).length) {
      const stripped = Object.keys(req.body || {}).filter((k) => (cfg.protect || []).includes(k))
      return res.status(403).json({
        error: stripped.length
          ? `${stripped.join(', ')} can only be changed by Management.`
          : 'Nothing to update.',
        protected: stripped,
      })
    }
    // capture the pre-update row so re-parenting recomputes BOTH the old and the new project
    const before = cfg.recomputeProject ? (await supabase.from(t).select('project_id').eq('id', req.params.id).maybeSingle()).data : null
    const { data, error } = await supabase.from(t).update(body).eq('id', req.params.id).select().single()
    if (error) throw error
    await logAudit(req.user, name, req.params.id, 'updated', body)
    await maybeRecompute(cfg, data, before)
    res.json(redactFinancials(req.user.role, passwordSafe(data)))
  }))

  // DELETE
  r.delete('/:id', authRequired, authorize(cfg.panel, 'delete'), asyncWrap(async (req, res) => {
    // capture project link BEFORE the row is gone, so the project can be re-rolled after
    const before = cfg.recomputeProject ? (await supabase.from(t).select('project_id').eq('id', req.params.id).maybeSingle()).data : null
    const { error } = await supabase.from(t).delete().eq('id', req.params.id)
    if (error) throw error
    await logAudit(req.user, name, req.params.id, 'deleted')
    await maybeRecompute(cfg, before)
    res.json({ ok: true })
  }))

  return r
}
