import { useCallback, useEffect, useState } from 'react'
import { Loader2, Phone, Users, StickyNote, Plus, Save, Clock } from 'lucide-react'
import { Modal, Field, Select, TextArea } from './Modal.jsx'
import { Badge, statusTone } from './ui.jsx'
import { useData } from '../store/DataContext.jsx'
import { api } from '../api.js'

/**
 * Lead / Opportunity detail — open a record, read it, edit it, move its status and reassign it.
 *
 * Both records are ordinary CRUD resources on the server (GET/PATCH /leads/:id, /opportunities/:id),
 * so this is one component driven by a per-kind field map rather than two near-identical screens.
 *
 * The Activity tab writes to customer_interactions, which is the existing meeting log. Activities
 * are linked to the record via opportunity_id / lead_id — see db/migrations_v4.sql. Until that
 * migration is run the tab degrades to the customer-level history rather than failing.
 */

const LEAD_STATUSES = [
  'New', 'Contacted', 'Meeting Scheduled', 'Site Visit', 'Quotation Preparation',
  'Open', 'Qualified', 'On Hold', 'Opportunity', 'Lost', 'Do Not Contact',
]
const OPP_STAGES = ['Prospecting', 'Qualification', 'Proposal', 'Quotation', 'Negotiation', 'Won', 'Lost']

const LEAD_FIELDS = [
  { key: 'name', label: 'Contact name' },
  { key: 'company', label: 'Company' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'source', label: 'Source' },
  { key: 'est_value', label: 'Estimated value (SAR)', type: 'number' },
  { key: 'project_name', label: 'Project' },
  { key: 'project_type', label: 'Project type' },
  { key: 'project_city', label: 'City' },
  { key: 'project_district', label: 'District' },
  { key: 'project_address', label: 'Address', full: true },
  { key: 'next_follow_up', label: 'Next follow-up', type: 'date' },
  { key: 'notes', label: 'Notes', textarea: true, full: true },
]

const OPP_FIELDS = [
  { key: 'customer', label: 'Customer' },
  { key: 'contact_person', label: 'Contact person' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'customer_email', label: 'Email', type: 'email' },
  { key: 'opportunity_type', label: 'Opportunity type' },
  { key: 'value', label: 'Value (SAR)', type: 'number' },
  { key: 'probability', label: 'Probability (%)', type: 'number' },
  { key: 'next_action_date', label: 'Next action', type: 'date' },
  { key: 'project_name', label: 'Project' },
  { key: 'project_type', label: 'Project type' },
  { key: 'project_city', label: 'City' },
  { key: 'project_district', label: 'District' },
  { key: 'project_location', label: 'Location', full: true },
]

const ACTIVITY_TYPES = [
  { value: 'Call', icon: Phone, label: 'Phone Call' },
  { value: 'Meeting', icon: Users, label: 'Meeting' },
  { value: 'Note', icon: StickyNote, label: 'Note' },
]

const CONFIG = {
  lead: {
    endpoint: 'leads',
    title: 'Lead',
    fields: LEAD_FIELDS,
    statusKey: 'status',
    statuses: LEAD_STATUSES,
    ownerKey: 'assigned_to_id',
    linkKey: 'lead_id',
    heading: (r) => r.name || r.company || 'Lead',
    sub: (r) => [r.company, r.project_name].filter(Boolean).join(' · '),
  },
  opportunity: {
    endpoint: 'opportunities',
    title: 'Opportunity',
    fields: OPP_FIELDS,
    statusKey: 'stage',
    statuses: OPP_STAGES,
    ownerKey: 'owner_id',
    linkKey: 'opportunity_id',
    heading: (r) => r.customer || 'Opportunity',
    sub: (r) => [r.project_name, r.opportunity_type].filter(Boolean).join(' · '),
  },
}

const dateOnly = (v) => (v ? String(v).slice(0, 10) : '')

export default function CrmDetailModal({ kind, id, open, onClose, onSaved }) {
  const d = useData()
  const cfg = CONFIG[kind]
  const [rec, setRec] = useState(null)
  const [draft, setDraft] = useState({})
  const [tab, setTab] = useState('Details')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!id || !cfg) return
    setError('')
    try {
      const r = await api(`/${cfg.endpoint}/${id}`)
      setRec(r)
      setDraft(r)
    } catch (e) {
      setError(e.message || 'Could not load this record.')
      setRec(null)
    }
  }, [id, cfg])

  useEffect(() => {
    if (open) {
      setTab('Details')
      setRec(null)
      load()
    }
  }, [open, load])

  const set = (k, v) => setDraft((x) => ({ ...x, [k]: v }))

  /** Send only what changed — a blanket PATCH would fight the server's protected-column rules. */
  const save = async () => {
    if (!rec) return
    const patch = {}
    for (const [k, v] of Object.entries(draft)) {
      if (k === 'id' || k === 'number' || k === 'created_at' || k === 'updated_at') continue
      const before = rec[k] ?? null
      const after = v === '' ? null : v
      if (JSON.stringify(before) !== JSON.stringify(after)) patch[k] = after
    }
    if (!Object.keys(patch).length) {
      onClose()
      return
    }
    setBusy(true)
    setError('')
    try {
      await api(`/${cfg.endpoint}/${id}`, { method: 'PATCH', body: patch })
      await onSaved?.()
      onClose()
    } catch (e) {
      // A Sales User is created with access level "Create", which grants read + create but NOT
      // update — so editing 403s for the whole sales team while Management succeeds. Say exactly
      // that, because "forbidden" alone sends people looking for a bug that is not there.
      setError(
        /cannot update|no access/i.test(e.message || '')
          ? 'Your access level cannot edit this record. Sales Users are set to "Create" (read + create only); an administrator must raise the access level to "Edit" in Admin → Users.'
          : e.message || 'Could not save.',
      )
    } finally {
      setBusy(false)
    }
  }

  if (!cfg) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={rec ? cfg.heading(rec) : `${cfg.title}…`}
      subtitle={rec ? [rec.number, cfg.sub(rec)].filter(Boolean).join('  ·  ') : 'Loading'}
      footer={
        tab === 'Details' && rec ? (
          <>
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={busy}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save changes
            </button>
          </>
        ) : null
      }
    >
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{error}</p>}

      {!rec && !error && (
        <p className="flex items-center gap-2 py-6 text-sm text-muted">
          <Loader2 size={15} className="animate-spin" /> Loading…
        </p>
      )}

      {rec && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {['Details', 'Activity'].map((x) => (
              <button
                key={x}
                onClick={() => setTab(x)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  tab === x ? 'bg-brand-500 text-white shadow-soft' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {x}
              </button>
            ))}
            <span className="ml-auto self-center">
              <Badge tone={statusTone(rec[cfg.statusKey])}>{rec[cfg.statusKey] || '—'}</Badge>
            </span>
          </div>

          {tab === 'Details' && (
            <>
              {/* status + owner first — the two things the client most often changes */}
              <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2">
                <Select
                  label={kind === 'lead' ? 'Status' : 'Stage'}
                  value={draft[cfg.statusKey] || ''}
                  onChange={(e) => set(cfg.statusKey, e.target.value)}
                  options={cfg.statuses}
                />
                <Select
                  label="Owner / assigned to"
                  value={draft[cfg.ownerKey] || ''}
                  onChange={(e) => set(cfg.ownerKey, e.target.value || null)}
                  options={[
                    { value: '', label: '— unassigned —' },
                    ...(d.team || []).map((u) => ({ value: u.id, label: u.label || u.name })),
                  ]}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {cfg.fields.map((f) => {
                  const value = f.type === 'date' ? dateOnly(draft[f.key]) : (draft[f.key] ?? '')
                  const common = {
                    label: f.label,
                    value,
                    onChange: (e) => set(f.key, e.target.value),
                  }
                  return (
                    <div key={f.key} className={f.full ? 'sm:col-span-2' : ''}>
                      {f.textarea
                        ? <TextArea {...common} rows={3} />
                        : <Field {...common} type={f.type || 'text'} />}
                    </div>
                  )
                })}
              </div>

              {rec.lost_reason && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  <b>Lost reason:</b> {rec.lost_reason}
                </p>
              )}
            </>
          )}

          {tab === 'Activity' && <ActivityLog kind={kind} cfg={cfg} record={rec} />}
        </>
      )}
    </Modal>
  )
}

/**
 * Communication history: phone calls, meetings and notes against this record.
 * Reads/writes customer_interactions through the generic `interactions` resource.
 */
function ActivityLog({ cfg, record }) {
  const [rows, setRows] = useState(null)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ type: 'Call', subject: '', notes: '', next_action: '' })

  const customer = record.customer || record.company || record.name || ''

  const load = useCallback(async () => {
    setError('')
    try {
      const all = await api('/interactions')
      const list = Array.isArray(all) ? all : []
      // prefer the explicit link; fall back to customer name when the link column is not there yet
      const linked = list.filter((x) => x[cfg.linkKey] === record.id)
      const byCustomer = list.filter(
        (x) => !x[cfg.linkKey] && customer && String(x.customer || '').toLowerCase() === customer.toLowerCase(),
      )
      setRows([...linked, ...byCustomer].sort(
        (a, b) => new Date(b.occurred_at || b.created_at || 0) - new Date(a.occurred_at || a.created_at || 0),
      ))
    } catch (e) {
      setError(e.message || 'Could not load the activity history.')
      setRows([])
    }
  }, [cfg.linkKey, record.id, customer])

  useEffect(() => { load() }, [load])

  const add = async () => {
    if (!form.notes.trim() && !form.subject.trim()) {
      setError('Add a subject or a note before saving.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api('/interactions', {
        method: 'POST',
        body: {
          [cfg.linkKey]: record.id,
          customer,
          type: form.type,
          subject: form.subject || null,
          notes: form.notes || null,
          next_action: form.next_action || null,
        },
      })
      setForm({ type: 'Call', subject: '', notes: '', next_action: '' })
      setAdding(false)
      await load()
    } catch (e) {
      setError(
        /column .* does not exist/i.test(e.message || '')
          ? 'Activity linking needs db/migrations_v4.sql to be run on the ERP database.'
          : e.message || 'Could not save the activity.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">Phone calls, meetings and notes for {customer || 'this record'}</p>
        {!adding && (
          <button className="btn-ghost text-xs" onClick={() => setAdding(true)}>
            <Plus size={14} /> Log activity
          </button>
        )}
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{error}</p>}

      {adding && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <div className="flex flex-wrap gap-1.5">
            {ACTIVITY_TYPES.map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                onClick={() => setForm((f) => ({ ...f, type: value }))}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  form.type === value ? 'bg-brand-500 text-white shadow-soft' : 'bg-white text-slate-500 hover:bg-slate-100'
                }`}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
          <Field
            label="Subject"
            value={form.subject}
            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
            placeholder="e.g. Follow-up on kitchen layout"
          />
          <TextArea
            label="What was discussed"
            rows={3}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
          <Field
            label="Next action"
            value={form.next_action}
            onChange={(e) => setForm((f) => ({ ...f, next_action: e.target.value }))}
            placeholder="e.g. Send revised quotation by Thursday"
          />
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => { setAdding(false); setError('') }}>Cancel</button>
            <button className="btn-primary" onClick={add} disabled={busy}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save activity
            </button>
          </div>
        </div>
      )}

      {rows === null && <p className="py-4 text-sm text-muted">Loading history…</p>}
      {rows?.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-sm text-muted">
          No activity logged yet.
        </p>
      )}

      <div className="space-y-2">
        {(rows || []).map((a) => {
          const Icon = ACTIVITY_TYPES.find((t) => t.value === a.type)?.icon || StickyNote
          return (
            <div key={a.id} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                <Icon size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <b className="text-sm text-ink">{a.subject || a.type}</b>
                  <span className="text-[11px] text-muted">{a.type}</span>
                  <span className="ml-auto flex items-center gap-1 text-[11px] text-muted">
                    <Clock size={11} />
                    {new Date(a.occurred_at || a.created_at).toLocaleString()}
                  </span>
                </div>
                {a.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{a.notes}</p>}
                {a.next_action && (
                  <p className="mt-1 text-[11px] font-semibold text-brand-600">Next: {a.next_action}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
