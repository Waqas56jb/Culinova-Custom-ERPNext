import { useState, useEffect, useCallback } from 'react'
import { Loader2, Plus, Trash2, User, MapPin, FileText, Star, Wallet } from 'lucide-react'
import { Modal, Field, Select } from './Modal.jsx'
import { useData } from '../store/DataContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { api } from '../api.js'
import { sar } from '../data/mockData.js'

const FINANCIAL_ROLES = ['Management', 'System Admin', 'Accounts User', 'Purchase User', 'Stock User', 'Project Manager']

// Reusable customer/supplier detail: profile + contacts / addresses / documents child CRUD.
export default function PartyDetailModal({ party, id, open, onClose, canEdit }) {
  const d = useData()
  const { user } = useAuth()
  const [rec, setRec] = useState(null)
  const [tab, setTab] = useState('Contacts')
  const [add, setAdd] = useState(null)
  const [busy, setBusy] = useState(false)
  const [credit, setCredit] = useState(null)
  const showCredit = party === 'customer' && FINANCIAL_ROLES.includes(user?.role)

  const load = useCallback(() => { if (id) d.getParty(party, id).then(setRec).catch(() => setRec(null)) }, [d, party, id])
  useEffect(() => { if (open) { setTab('Contacts'); setAdd(null); load() } }, [open, load])

  useEffect(() => {
    if (!open || !showCredit || !rec?.name) { setCredit(null); return }
    let cancelled = false
    api(`/sales/customers/${encodeURIComponent(rec.name)}/credit`)
      .then((c) => { if (!cancelled) setCredit(c) })
      .catch(() => { if (!cancelled) setCredit(null) })
    return () => { cancelled = true }
  }, [open, showCredit, rec?.name])

  const CHILD = {
    Contacts: { key: 'contacts', icon: User, fields: [{ key: 'name', label: 'Name', req: true }, { key: 'designation', label: 'Designation' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }], row: (c) => <><b className="text-ink">{c.name}</b>{c.is_primary && <Star size={11} className="ml-1 inline text-gold-500" />}<span className="block text-[11px] text-muted">{[c.designation, c.email, c.phone].filter(Boolean).join(' · ')}</span></> },
    Addresses: { key: 'addresses', icon: MapPin, fields: [{ key: 'label', label: 'Label' }, { key: 'type', label: 'Type', type: 'select', options: ['Billing', 'Shipping', 'Site'] }, { key: 'address', label: 'Address' }, { key: 'city', label: 'City' }, { key: 'country', label: 'Country' }], row: (a) => <><b className="text-ink">{a.label || a.type}</b><span className="block text-[11px] text-muted">{[a.address, a.city, a.country].filter(Boolean).join(', ')}</span></> },
    Documents: { key: 'documents', icon: FileText, fields: [{ key: 'name', label: 'Name', req: true }, { key: 'doc_type', label: 'Type' }, { key: 'file_url', label: 'File URL' }], row: (d2) => <><b className="text-ink">{d2.name}</b> <span className="text-[11px] text-muted">{d2.doc_type}</span>{d2.file_url && <a href={d2.file_url} target="_blank" rel="noreferrer" className="ml-2 text-[11px] font-semibold text-brand-600">open</a>}</> },
  }
  const cfg = CHILD[tab]
  const rows = rec?.[cfg.key] || []

  const save = async () => {
    setBusy(true)
    try { await d.addPartyChild(party, id, cfg.key, add); setAdd(null); load() } finally { setBusy(false) }
  }
  const remove = async (cid) => { await d.deletePartyChild(party, cfg.key, cid); load() }

  return (
    <Modal open={open} onClose={onClose} size="lg" title={rec?.name || `${party} detail`} subtitle={rec ? [rec.code, rec.category, rec.email].filter(Boolean).join(' · ') : ''}
      footer={<button className="btn-ghost" onClick={onClose}>Close</button>}>
      {!rec ? <div className="grid place-items-center py-8 text-muted"><Loader2 className="animate-spin" /></div> : (
        <div className="space-y-3">
          {showCredit && credit && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                <Wallet size={13} /> Credit
              </p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[11px] text-muted">Overdue</p>
                  <p className={`text-sm font-bold ${credit.has_overdue ? 'text-amber-700' : 'text-ink'}`}>{sar(credit.overdue_amount || 0)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted">Open overdue inv.</p>
                  <p className="text-sm font-bold text-ink">{credit.overdue_invoice_count || 0}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted">Active quotes</p>
                  <p className="text-sm font-bold text-ink">{credit.active_quotations_count || 0}</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-1.5">
            {Object.entries(CHILD).map(([k, c]) => (
              <button key={k} onClick={() => { setTab(k); setAdd(null) }} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === k ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                <c.icon size={13} /> {k} <span className="opacity-60">({(rec[c.key] || []).length})</span>
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                <div>{cfg.row(r)}</div>
                {canEdit && <button className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-500" onClick={() => remove(r.id)}><Trash2 size={14} /></button>}
              </div>
            ))}
            {rows.length === 0 && <div className="py-4 text-center text-sm text-muted">No {tab.toLowerCase()} yet.</div>}
          </div>

          {canEdit && (add ? (
            <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {cfg.fields.map((f) => f.type === 'select'
                  ? <Select key={f.key} label={f.label} value={add[f.key] || ''} onChange={(e) => setAdd({ ...add, [f.key]: e.target.value })} options={['', ...f.options]} />
                  : <Field key={f.key} label={f.label + (f.req ? ' *' : '')} value={add[f.key] || ''} onChange={(e) => setAdd({ ...add, [f.key]: e.target.value })} />)}
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <button className="btn-ghost !py-1.5" onClick={() => setAdd(null)}>Cancel</button>
                <button className="btn-primary !py-1.5" disabled={busy} onClick={save}>{busy ? <Loader2 size={14} className="animate-spin" /> : null} Add</button>
              </div>
            </div>
          ) : (
            <button className="btn-ghost !py-1.5 w-full justify-center border border-dashed border-slate-300" onClick={() => setAdd({})}><Plus size={15} /> Add {tab.slice(0, -1)}</button>
          ))}
        </div>
      )}
    </Modal>
  )
}
