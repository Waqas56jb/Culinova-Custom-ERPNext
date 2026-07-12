import { useState, useEffect, useCallback } from 'react'
import { History, RefreshCw, Database, Pencil, Loader2, ChevronDown, ChevronRight, Link2 } from 'lucide-react'
import { useData } from '../store/DataContext.jsx'

// Version-source → readable label + tone. Every EOS import/sync and every ERP edit snapshots the
// PREVIOUS item state (see core/eosfields.recordVersion), so this is a full, reversible audit trail.
const SOURCE_META = {
  'eos-import': { label: 'EOS Import', cls: 'bg-brand-50 text-brand-600', Icon: Database },
  'eos-sync': { label: 'EOS Sync', cls: 'bg-blue-50 text-blue-600', Icon: RefreshCw },
  'eos-link': { label: 'EOS Link', cls: 'bg-violet-50 text-violet-600', Icon: Link2 },
  'erp-edit': { label: 'ERP Edit', cls: 'bg-amber-50 text-amber-600', Icon: Pencil },
}
const meta = (s) => SOURCE_META[s] || { label: s || 'Change', cls: 'bg-slate-100 text-slate-600', Icon: History }

// Curated, human-readable engineering fields to surface when a snapshot is expanded (the raw row has
// dozens of columns incl. big JSON — showing the ones an engineer actually reads keeps it legible).
const SNAP_FIELDS = [
  ['item_name', 'Item Name'], ['brand', 'Brand'], ['model', 'Model'], ['product_family', 'Product Family'],
  ['category', 'Category'], ['sub_category', 'Sub Category'], ['power_type', 'Power Type'],
  ['dimensions', 'Dimensions'], ['description', 'Description'], ['eos_version', 'EOS Version'],
  ['eos_status', 'EOS Status'], ['datasheet_url', 'Datasheet'], ['image_url', 'Image'],
]

const fmtWhen = (s) => {
  if (!s) return '—'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

// Reusable version-history panel for an Item Master row. Pass just { itemId }; it loads the item's
// version snapshots from GET /eos/versions/:itemId and lets each be expanded. If the item has ever
// been imported/synced from EOS it also offers a one-click "Re-sync from EOS".
export default function ItemVersionHistory({ itemId, className = '' }) {
  const d = useData()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(() => new Set())
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    if (!itemId) return
    setLoading(true); setErr('')
    try { const v = await d.resGet('eos/versions', itemId); setRows(Array.isArray(v) ? v : []) }
    catch (e) { setErr(e.message); setRows([]) }
    finally { setLoading(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId])

  useEffect(() => { load() }, [load])

  const toggle = (id) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  // An item that carries any EOS-sourced version is EOS-linked → offer a re-sync.
  const eosLinked = rows.some((v) => String(v.source || '').startsWith('eos'))

  async function resync() {
    setSyncing(true); setErr(''); setMsg('')
    try {
      const rep = await d.eosSync(itemId) // POST /eos/sync/:itemId → syncLinkedItems report
      setMsg(rep?.updated ? `Updated from EOS ✓ (v${rep.changes?.[0]?.version ?? ''})` : 'Already up to date with EOS ✓')
      await load()
    } catch (e) { setErr(e.message) }
    finally { setSyncing(false) }
  }

  return (
    <div className={`rounded-xl border border-slate-200 p-3 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
          <History size={14} /> Version History{rows.length ? ` · ${rows.length}` : ''}
        </p>
        {eosLinked && (
          <button className="btn-ghost !py-1.5 !text-xs" disabled={syncing} onClick={resync} title="Pull the latest engineering data from EOS">
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} /> Re-sync from EOS
          </button>
        )}
      </div>

      {msg && <div className="mb-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-600">{msg}</div>}
      {err && <div className="mb-2 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600">{err}</div>}

      {loading ? (
        <div className="grid place-items-center gap-2 py-6 text-sm text-muted"><Loader2 className="animate-spin" size={18} /> Loading history…</div>
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted">No version history yet — this item hasn’t been imported from or synced with EOS, and no tracked edits have been recorded.</p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((v) => {
            const m = meta(v.source)
            const isOpen = open.has(v.id)
            const snap = v.snapshot && typeof v.snapshot === 'object' ? v.snapshot : {}
            const fields = SNAP_FIELDS.filter(([k]) => snap[k] != null && snap[k] !== '')
            return (
              <li key={v.id} className="rounded-lg border border-slate-100 bg-slate-50/40">
                <button onClick={() => toggle(v.id)} className="flex w-full items-center gap-2 px-2.5 py-2 text-left">
                  {isOpen ? <ChevronDown size={14} className="shrink-0 text-slate-400" /> : <ChevronRight size={14} className="shrink-0 text-slate-400" />}
                  <span className="grid h-6 w-9 shrink-0 place-items-center rounded-md bg-white text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">v{v.version}</span>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${m.cls}`}><m.Icon size={10} /> {m.label}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-600">{v.change_note || '—'}</span>
                  <span className="shrink-0 text-[11px] text-muted">{fmtWhen(v.created_at)}</span>
                </button>
                {isOpen && (
                  <div className="border-t border-slate-100 px-3 py-2">
                    {fields.length === 0 ? (
                      <p className="text-[11px] text-muted">Snapshot has no readable engineering fields.</p>
                    ) : (
                      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                        {fields.map(([k, label]) => (
                          <div key={k} className="flex items-start justify-between gap-2 border-b border-slate-50 py-1 text-[11px] last:border-0">
                            <dt className="shrink-0 text-muted">{label}</dt>
                            <dd className="min-w-0 truncate text-right font-medium text-ink" title={String(snap[k])}>
                              {/^https?:\/\//.test(String(snap[k]))
                                ? <a href={snap[k]} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">link ↗</a>
                                : String(snap[k])}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
