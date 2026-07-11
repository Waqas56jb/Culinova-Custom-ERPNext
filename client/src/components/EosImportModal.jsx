import { useState, useEffect, useRef } from 'react'
import { Loader2, Search, CheckCircle2, Database, RefreshCw, FileText, Boxes } from 'lucide-react'
import { Modal } from './Modal.jsx'
import { useData } from '../store/DataContext.jsx'

// Engineering sections (same grouping EOS uses) for the preview panel.
const SECTIONS = [
  ['technical_specification', 'Technical Specifications'],
  ['electrical', 'Electrical'],
  ['water_drain', 'Water / Drain'],
  ['gas', 'Gas'],
  ['ventilation', 'Ventilation'],
  ['dimensions_clearance', 'Dimensions & Clearances'],
  ['connection_point', 'MEP Connection Points'],
  ['installation', 'Installation'],
  ['other', 'Other'],
]

// Browse the CULINOVA EOS engineering knowledge base (source of truth for approved products),
// preview any model's full engineering record, and import approved entries into the ERP Item Master.
export default function EosImportModal({ open, onClose }) {
  const d = useData()
  const dRef = useRef(d); dRef.current = d // keep a stable handle so re-renders never re-trigger loading

  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [mode, setMode] = useState('')
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [sel, setSel] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  // preview panel
  const [active, setActive] = useState(null)          // active row (identity)
  const [detail, setDetail] = useState(null)          // full detail payload
  const [detailLoading, setDetailLoading] = useState(false)

  async function loadList(query) {
    setLoading(true); setErr('')
    try {
      const r = await dRef.current.eosCatalog(query || '')
      setRows(r.items || []); setMode(r.mode); setTotal(r.total || (r.items || []).length)
    } catch (e) { setErr(e.message); setRows([]) }
    finally { setLoading(false) }
  }

  // Load ONCE when the modal opens (depend only on `open` — never on the changing context object,
  // otherwise the 12s real-time refresh would restart loading over and over).
  useEffect(() => {
    if (!open) return
    setSel(new Set()); setResult(null); setQ(''); setActive(null); setDetail(null)
    loadList('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function openPreview(row) {
    setActive(row); setDetail(null); setDetailLoading(true)
    try { setDetail(await dRef.current.eosDetail(row.id)) }
    catch (e) { setDetail({ error: e.message }) }
    finally { setDetailLoading(false) }
  }

  const importable = rows.filter((r) => !r.imported)
  const allSelected = importable.length > 0 && importable.every((r) => sel.has(r.id))
  const toggleAll = () => setSel(allSelected ? new Set() : new Set(importable.map((r) => r.id)))
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  async function runImport(ids) {
    if (!ids.length) return
    setBusy(true); setErr(''); setResult(null)
    try {
      const r = await dRef.current.eosImport(ids)
      setResult(r); setSel(new Set())
      await loadList(q)
      if (active) openPreview(active) // refresh preview status
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  const importedCount = rows.length - importable.length

  return (
    <Modal open={open} onClose={onClose} size="xl" title="Import from EOS"
      subtitle="CULINOVA EOS — engineering knowledge base · single source of truth for approved products"
      footer={<>
        <span className="mr-auto text-xs text-muted">
          {total} approved · {importedCount} in Item Master · {importable.length} new{sel.size ? ` · ${sel.size} selected` : ''}
        </span>
        <button className="btn-ghost" onClick={onClose}>Close</button>
        <button className="btn-primary" disabled={!sel.size || busy} onClick={() => runImport([...sel])}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />} Import {sel.size || ''} to Item Master
        </button>
      </>}>
      <div className="flex flex-col gap-3">
        {/* search + bulk */}
        <div className="flex flex-wrap items-center gap-2">
          <form className="relative min-w-[220px] flex-1" onSubmit={(e) => { e.preventDefault(); loadList(q) }}>
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-500/15"
              placeholder="Search approved EOS models — brand, model, specification…" value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
          <button type="button" className="btn-ghost !py-2" onClick={() => loadList(q)}>Search</button>
          <label className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-600">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={!importable.length} className="h-4 w-4 accent-brand-500" />
            Select all new ({importable.length})
          </label>
        </div>

        {mode === 'semantic' && <div className="w-max rounded bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-600">AI semantic search</div>}
        {result && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
            Done ✓ — {result.created} created · {result.updated + result.linked} updated/linked{result.failed ? ` · ${result.failed} failed` : ''}.
            {result.failed > 0 && <div className="mt-1 font-normal text-rose-600">{(result.errors || []).map((e) => e.error).join('; ')}</div>}
          </div>
        )}
        {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{err}</div>}

        {/* two panes: list + preview */}
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          {/* LIST */}
          <div className="max-h-[56vh] min-h-[300px] space-y-1.5 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/40 p-2">
            {loading && <div className="grid place-items-center gap-2 py-12 text-sm text-muted"><Loader2 className="animate-spin" /> Loading EOS catalogue…</div>}
            {!loading && !rows.length && <div className="py-12 text-center text-sm text-muted">No approved EOS models found.</div>}
            {!loading && rows.map((it) => {
              const on = active && active.id === it.id
              return (
                <div key={it.id} onClick={() => openPreview(it)}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 transition ${on ? 'border-brand-400 bg-white shadow-sm' : 'border-transparent bg-white/70 hover:border-slate-200 hover:bg-white'}`}>
                  {it.imported
                    ? <CheckCircle2 size={17} className="shrink-0 text-emerald-500" title="Already in Item Master" />
                    : <input type="checkbox" checked={sel.has(it.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(it.id)} className="h-4 w-4 shrink-0 accent-brand-500" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink">{it.title}</div>
                    <div className="truncate text-[11px] text-muted">
                      <span className="font-mono">{it.code || it.model_number || '—'}</span>
                      {it.category ? ` · ${it.category}` : ''}{it.equipment_type ? ` · ${it.equipment_type}` : ''}
                    </div>
                  </div>
                  {it.imported
                    ? <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">IN ERP</span>
                    : <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">NEW</span>}
                </div>
              )
            })}
          </div>

          {/* PREVIEW */}
          <div className="max-h-[56vh] min-h-[300px] overflow-y-auto rounded-xl border border-slate-100 p-4">
            {!active && <div className="grid h-full place-items-center text-center text-sm text-muted"><div><Boxes className="mx-auto mb-2 text-slate-300" /> Select a model to preview its full engineering record</div></div>}
            {active && <PreviewPanel active={active} detail={detail} loading={detailLoading} busy={busy}
              onImport={() => runImport([active.id])} />}
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-muted">
          EOS stays the master for engineering data. Approved models are always browsable here. Importing lands a model in the
          Item Master with identity, dimensions, datasheet & full engineering specs — <b>you add pricing in the Item Master</b>.
          Re-importing refreshes engineering data and never creates duplicates.
        </p>
      </div>
    </Modal>
  )
}

function PreviewPanel({ active, detail, loading, busy, onImport }) {
  if (loading) return <div className="grid h-full place-items-center text-sm text-muted"><Loader2 className="animate-spin" /></div>
  if (detail?.error) return <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{detail.error}</div>
  if (!detail) return null
  const e = detail.entry || {}, m = detail.model || {}
  const groups = {}
  ;(detail.attributes || []).forEach((a) => { (groups[a.attr_group] = groups[a.attr_group] || []).push(a) })
  const docs = [...(detail.documents || []), ...((detail.files || []).filter((f) => f.asset_type === 'cad'))]

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate font-display text-base font-bold text-ink">{e.title}</h4>
          <div className="font-mono text-[11px] text-muted">{e.code || m.model_number}</div>
        </div>
        {detail.imported
          ? <button className="btn-ghost !py-1.5 !text-xs" disabled={busy} onClick={onImport}><RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> Re-sync</button>
          : <button className="btn-primary !py-1.5 !text-xs" disabled={busy} onClick={onImport}><Database size={13} /> Import</button>}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg bg-slate-50/70 p-3 text-xs">
        <Kv k="Brand" v={m.brand || e.brand} />
        <Kv k="Category" v={m.category || e.category} />
        <Kv k="Equipment Type" v={m.equipment_type || e.equipment_type} />
        <Kv k="Series" v={m.series} />
        <Kv k="Model" v={m.model_number || e.code} mono />
        <Kv k="Power" v={m.power_type || e.power_type} />
      </div>
      {e.summary && <p className="text-xs leading-relaxed text-slate-600">{e.summary}</p>}

      {docs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {docs.map((doc) => (
            <a key={doc.id} href={doc.storage_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-brand-600 hover:bg-brand-50">
              <FileText size={11} /> {doc.doc_type || doc.category_tag || 'Document'}
            </a>
          ))}
        </div>
      )}

      {SECTIONS.filter(([key]) => groups[key]?.length).map(([key, label]) => (
        <div key={key}>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
          <table className="w-full text-xs">
            <tbody>
              {groups[key].map((a) => (
                <tr key={a.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-1 pr-2 text-slate-500">{a.name}</td>
                  <td className="py-1 text-right font-medium text-ink">{a.value ?? '—'} {a.unit || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {detail.notes?.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Engineering Notes</div>
          {detail.notes.map((n) => <p key={n.id} className="mb-1 text-xs text-slate-600">• {n.content}</p>)}
        </div>
      )}
    </div>
  )
}

const Kv = ({ k, v, mono }) => (
  <div className="flex flex-col">
    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{k}</span>
    <span className={`text-slate-700 ${mono ? 'font-mono' : ''}`}>{v || '—'}</span>
  </div>
)
