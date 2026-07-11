import { useState, useEffect, useCallback } from 'react'
import { Loader2, Search, CheckCircle2, Database, RefreshCw } from 'lucide-react'
import { Modal } from './Modal.jsx'
import { useData } from '../store/DataContext.jsx'

// Browse the CULINOVA EOS engineering knowledge base (source of truth for approved products)
// and import selected approved entries straight into the ERP Item Master — no re-typing.
export default function EosImportModal({ open, onClose }) {
  const d = useData()
  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [mode, setMode] = useState('')
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [sel, setSel] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  const load = useCallback(async (query) => {
    setLoading(true); setErr('')
    try { const r = await d.eosCatalog(query || ''); setRows(r.items || []); setMode(r.mode); setTotal(r.total || (r.items || []).length) }
    catch (e) { setErr(e.message); setRows([]) }
    finally { setLoading(false) }
  }, [d])

  useEffect(() => { if (open) { setSel(new Set()); setResult(null); setQ(''); load('') } }, [open, load])

  const toggle = (it) => {
    if (it.imported) return // already in the Item Master
    setSel((s) => { const n = new Set(s); n.has(it.id) ? n.delete(it.id) : n.add(it.id); return n })
  }
  const importable = rows.filter((r) => !r.imported)
  const allSelected = importable.length > 0 && importable.every((r) => sel.has(r.id))
  const toggleAll = () => setSel(allSelected ? new Set() : new Set(importable.map((r) => r.id)))

  const doImport = async () => {
    if (!sel.size) return
    setBusy(true); setErr(''); setResult(null)
    try { const r = await d.eosImport([...sel]); setResult(r); setSel(new Set()); await load(q) }
    catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Import from EOS" subtitle="CULINOVA EOS — engineering knowledge base · single source of truth"
      footer={<>
        <span className="mr-auto text-xs text-muted">{sel.size ? `${sel.size} selected` : `${importable.length} available · ${rows.length - importable.length} already imported`}</span>
        <button className="btn-ghost" onClick={onClose}>Close</button>
        <button className="btn-primary" disabled={!sel.size || busy} onClick={doImport}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />} Import {sel.size || ''} to Item Master</button>
      </>}>
      <div className="space-y-3">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); load(q) }}>
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input w-full !pl-9" placeholder="Search approved EOS models — brand, model, spec…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button type="submit" className="btn-ghost !py-2">Search</button>
        </form>

        {mode === 'semantic' && <div className="inline-flex items-center gap-1 rounded bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-600"><Sparkle /> AI semantic search</div>}

        {result && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
            Imported ✓ — {result.created} created · {result.updated + result.linked} updated/linked{result.failed ? ` · ${result.failed} failed` : ''}.
            {result.failed > 0 && <div className="mt-1 font-normal text-rose-600">{(result.errors || []).map((e) => e.error).join('; ')}</div>}
          </div>
        )}
        {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{err}</div>}

        <div className="flex items-center justify-between px-1">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={!importable.length} className="h-4 w-4 accent-brand-500" />
            Select all available ({importable.length})
          </label>
          <span className="text-[11px] text-muted">{total} approved model{total === 1 ? '' : 's'} in EOS</span>
        </div>

        <div className="max-h-[52vh] space-y-1.5 overflow-y-auto pr-1">
          {loading && <div className="grid place-items-center py-8 text-sm text-muted"><Loader2 className="animate-spin" /> Loading EOS catalogue…</div>}
          {!loading && !rows.length && <div className="py-8 text-center text-sm text-muted">No approved EOS models found.</div>}
          {!loading && rows.map((it) => (
            <button key={it.id} type="button" onClick={() => toggle(it)} disabled={it.imported}
              className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${it.imported ? 'cursor-default border-slate-100 bg-slate-50/60' : sel.has(it.id) ? 'border-brand-400 bg-brand-50/60' : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50'}`}>
              {it.imported
                ? <CheckCircle2 size={18} className="shrink-0 text-emerald-500" />
                : <input type="checkbox" readOnly checked={sel.has(it.id)} className="h-4 w-4 shrink-0 accent-brand-500" />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink">{it.title}</div>
                <div className="truncate text-[11px] text-muted">
                  <span className="font-mono">{it.code || it.model_number || '—'}</span>
                  {it.category ? ` · ${it.category}` : ''}{it.equipment_type ? ` · ${it.equipment_type}` : ''}{it.power_type ? ` · ${it.power_type}` : ''}
                </div>
              </div>
              {it.imported
                ? <span className="shrink-0 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">In Item Master</span>
                : <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">Approved</span>}
            </button>
          ))}
        </div>
        <p className="px-1 text-[11px] leading-relaxed text-muted">
          EOS stays the master for engineering data. Imported items land in the Item Master with identity, dimensions,
          datasheet & full engineering specs — <b>you add pricing here</b>. Re-importing refreshes engineering data and never duplicates.
        </p>
      </div>
    </Modal>
  )
}

const Sparkle = () => <RefreshCw size={10} />
