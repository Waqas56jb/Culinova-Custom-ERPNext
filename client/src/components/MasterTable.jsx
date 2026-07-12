import { useState } from 'react'
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import { Modal, Field, Select, TextArea } from './Modal.jsx'

// Reusable, config-driven master-data table: list + add/edit modal + delete, RBAC-aware.
// columns: [{ key, label, type?: 'bool'|'badge'|'number', render?: (row)=>node, className? }]
// fields:  [{ key, label, type?: 'text'|'number'|'select'|'checkbox'|'textarea', options?, required?, hint?, placeholder? }]
export default function MasterTable({
  title, subtitle, columns = [], fields = [], rows = [], canEdit = false,
  onAdd, onUpdate, onDelete, addLabel = 'Add', getId = (r) => r.id, emptyText = 'No records yet.',
}) {
  const [modal, setModal] = useState(null) // { editing, values }
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const blank = () => Object.fromEntries(fields.map((f) => [f.key, f.type === 'checkbox' ? false : '']))
  const openAdd = () => { setErr(''); setModal({ editing: null, values: blank() }) }
  const openEdit = (row) => { setErr(''); setModal({ editing: getId(row), values: { ...blank(), ...row } }) }
  const set = (k, v) => setModal((m) => ({ ...m, values: { ...m.values, [k]: v } }))

  const save = async () => {
    for (const f of fields) if (f.required && !modal.values[f.key] && modal.values[f.key] !== 0) return setErr(`${f.label} is required`)
    setBusy(true); setErr('')
    try {
      const payload = {}
      for (const f of fields) { let v = modal.values[f.key]; if (f.type === 'number') v = v === '' || v == null ? null : Number(v); payload[f.key] = v }
      if (modal.editing) await onUpdate(modal.editing, payload); else await onAdd(payload)
      setModal(null)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const cell = (row, col) => {
    if (col.render) return col.render(row)
    const v = row[col.key]
    if (col.type === 'bool') return <span className={`chip ${v ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{v ? 'Yes' : 'No'}</span>
    if (col.type === 'badge') return v ? <span className="chip bg-slate-100 text-slate-600">{v}</span> : '—'
    return v ?? '—'
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
        <div>
          <h3 className="text-[15px] font-bold text-ink">{title}</h3>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        {canEdit && <button className="btn-primary whitespace-nowrap" onClick={openAdd}><Plus size={16} /> {addLabel}</button>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="bg-slate-50/60">
            {columns.map((c) => <th key={c.key} className="th">{c.label}</th>)}
            {canEdit && <th className="th w-24 text-right">Actions</th>}
          </tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={getId(row)} className="hover:bg-slate-50/60">
                {columns.map((c) => <td key={c.key} className={`td ${c.className || 'text-slate-600'}`}>{cell(row, c)}</td>)}
                {canEdit && (
                  <td className="td text-right">
                    <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600" onClick={() => openEdit(row)}><Pencil size={15} /></button>
                    {onDelete && <button className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500" onClick={() => { if (confirm('Delete this record?')) onDelete(getId(row)) }}><Trash2 size={15} /></button>}
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="td text-slate-400" colSpan={columns.length + (canEdit ? 1 : 0)}>{emptyText}</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={`${modal?.editing ? 'Edit' : addLabel}`} subtitle={title}
        footer={<><button className="btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn-primary" disabled={busy} onClick={save}>{busy ? <Loader2 size={16} className="animate-spin" /> : null} Save</button></>}>
        {modal && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.key} className={f.full ? 'sm:col-span-2' : ''}>
                {f.type === 'checkbox' ? (
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm">
                    <input type="checkbox" checked={!!modal.values[f.key]} onChange={(e) => set(f.key, e.target.checked)} className="h-4 w-4 accent-brand-500" />
                    <span className="text-slate-700">{f.label}</span>
                  </label>
                ) : f.type === 'select' ? (
                  <Select label={f.label} value={modal.values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} options={['', ...(f.options || [])]} />
                ) : f.type === 'textarea' ? (
                  <TextArea label={f.label} value={modal.values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} />
                ) : (
                  <Field label={f.label + (f.required ? ' *' : '')} type={f.type === 'number' ? 'number' : 'text'} value={modal.values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} hint={f.hint} />
                )}
              </div>
            ))}
            {err && <div className="sm:col-span-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{err}</div>}
          </div>
        )}
      </Modal>
    </div>
  )
}
