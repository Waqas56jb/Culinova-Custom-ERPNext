import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Package, Pencil, Database, Lock, SlidersHorizontal, Loader2 } from 'lucide-react'
import { Modal } from './Modal.jsx'
import { useData } from '../store/DataContext.jsx'
import { sar } from '../data/mockData.js'
import ImageLightbox from './ImageLightbox.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// ITEM DETAIL — READ-ONLY while the DB policy says item_creation_source = 'eos'.
//   "Item data comes only from what the EOS admin has approved. Create, edit, approve, reject and
//    DELETE all live in EOS — nobody has them in the ERP Item Master."
// Every field here renders as TEXT. There is no Edit and no Delete: the server refuses both (403), so
// a button would only produce an error. PRICING is NOT item data — EOS carries no prices — so the
// prices stay visible and the user is pointed at the Pricing Engine, which is where they are set.
// The policy is passed in from the page (which reads GET /eos/policy); this file never hardcodes it.
// ─────────────────────────────────────────────────────────────────────────────

const Info = ({ k, v }) => <p className="text-slate-600"><span className="text-muted">{k}:</span> <span className="font-medium text-ink">{v || '—'}</span></p>
const Box = ({ label, v, tone }) => <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 text-center"><p className={`text-lg font-extrabold ${tone}`}>{v}</p><p className="text-[11px] text-muted">{label}</p></div>

const fmtWhen = (v) => {
  if (!v) return null
  const dt = new Date(v)
  return Number.isNaN(dt.getTime()) ? null : dt.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ItemView({ open, itemId, onClose, onEdit, canEditData = false, canPrice = false, eosOwned = true }) {
  const d = useData()
  const nav = useNavigate()
  const [it, setIt] = useState(null)
  const [avail, setAvail] = useState(null)
  const [alts, setAlts] = useState([])
  const [big, setBig] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  // Every async call is awaited in try/catch and the failure is SURFACED — never a silent catch.
  useEffect(() => {
    if (!open || !itemId) return
    let live = true
    setIt(null); setAvail(null); setAlts([]); setErr(''); setLoading(true)
    ;(async () => {
      try {
        const x = await d.getItem(itemId)
        if (!live) return
        setIt(x)
        if (x?.item_name) {
          const a = await d.checkAvailability(x.item_name)   // resolves null on failure by design
          if (live) setAvail(a)
        }
      } catch (e) {
        if (live) setErr(`Could not load this item — ${e?.message || 'unknown error'}`)
      }
      try {
        const a = await d.getAlternatives(itemId)
        if (live) setAlts(Array.isArray(a) ? a : [])
      } catch (e) {
        if (live) setErr((p) => p || `Could not load alternatives — ${e?.message || 'unknown error'}`)
      } finally {
        if (live) setLoading(false)
      }
    })()
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, itemId])

  if (!open) return null

  const syncedAt = fmtWhen(it?.eos_synced_at)
  const linked = !!it?.eos_entry_id

  return (
    <Modal open={open} onClose={onClose} size="lg" title={it?.item_name || 'Item'} subtitle={it ? `${it.item_code}${it.product_family ? ` · ${it.product_family}` : ''}` : ''}
      footer={<>
        {/* Edit only exists when the owner has switched the policy back to ERP-owned items. */}
        {canEditData && !eosOwned && onEdit && <button className="btn-ghost" onClick={onEdit}><Pencil size={14} /> Edit</button>}
        {/* Pricing is NOT item data — it stays settable, in the Pricing Engine. */}
        {canPrice && <button className="btn-ghost" onClick={() => { onClose?.(); nav('/stock/pricing') }}><SlidersHorizontal size={14} /> Set pricing in the Pricing Engine</button>}
        <button className="btn-primary" onClick={onClose}>Close</button>
      </>}>

      {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{err}</div>}

      {/* Calm, factual — this is how it works, not an error. */}
      {eosOwned && (
        <div className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-2.5">
          <Lock size={14} className="mt-0.5 shrink-0 text-slate-400" />
          <div className="min-w-0 text-xs leading-relaxed text-muted">
            <p>Item data is owned by <b className="text-slate-600">CULINOVA EOS</b>. To change it, edit and re-approve the item in EOS — it syncs here.</p>
            {it && (
              <p className="mt-1">
                {linked
                  ? <>
                      <span className="inline-flex items-center gap-1 rounded bg-brand-50 px-1.5 py-0.5 font-bold text-brand-600"><Database size={10} /> EOS</span>
                      <span className="ml-1.5">entry <b className="font-mono text-slate-600">{it.eos_entry_id}</b></span>
                      {it.eos_version != null && <> · version <b className="text-slate-600">v{it.eos_version}</b></>}
                      {it.eos_status && <> · <b className="text-slate-600">{it.eos_status}</b></>}
                      {syncedAt ? <> · last synced <b className="text-slate-600">{syncedAt}</b></> : <> · not synced yet</>}
                    </>
                  : <span className="text-amber-600">This item is not linked to an EOS entry — it predates the EOS link, so nothing syncs into it.</span>}
              </p>
            )}
          </div>
        </div>
      )}

      {loading && !it && !err ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-slate-400">
          <Loader2 size={28} className="animate-spin text-brand-500" />
          <span>Loading item…</span>
        </div>
      ) : null}

      {it && (
        <div className="space-y-4">
          {/* large product image (click to enlarge) */}
          {it.image_url
            ? <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <img src={it.image_url} alt={it.item_name} onClick={() => setBig(it.image_url)} title="Click to enlarge"
                  className="mx-auto h-64 w-full cursor-zoom-in object-contain transition hover:opacity-90" />
              </div>
            : <div className="grid h-40 w-full place-items-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-400">No image</div>}

          {/* every field is TEXT — no inputs anywhere in this modal */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <Info k="Item Code" v={it.item_code} /><Info k="Brand" v={it.brand} />
            <Info k="Model" v={it.model} /><Info k="Product Family" v={it.product_family} />
            <Info k="Category" v={it.category} /><Info k="Sub Category" v={it.sub_category} />
            <Info k="Unit of Measure" v={it.stock_uom} /><Info k="Dimensions" v={it.dimensions} />
            <Info k="Power Type" v={it.power_type} /><Info k="Country of Origin" v={it.country_of_origin} />
          </div>

          {it.description && (
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Description</p>
              <p className="whitespace-pre-wrap text-sm text-slate-600">{it.description}</p>
            </div>
          )}

          {/* PRICING — visible (read-only here). Cost / GP / supplier are server-redacted per role. */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Pricing</p>
              {canPrice && (
                <button onClick={() => { onClose?.(); nav('/stock/pricing') }} className="text-[11px] font-semibold text-brand-600 hover:underline">
                  Edit in the Pricing Engine →
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Box label="Selling Price" v={sar(it.standard_rate || 0)} tone="text-brand-600" />
              {it.cost != null && <Box label="Landed Cost" v={sar(it.cost)} tone="text-gold-600" />}
              {it.gp_percent != null && <Box label="GP %" v={`${it.gp_percent}%`} tone="text-emerald-600" />}
              {it.supplier_price != null && <Box label="Supplier Price" v={sar(it.supplier_price)} tone="text-slate-600" />}
            </div>
            {eosOwned && <p className="mt-1.5 text-[11px] text-muted">Prices are set in the ERP — EOS carries no pricing.</p>}
          </div>

          {/* availability */}
          {avail?.matched && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Box label="Available" v={avail.available} tone="text-emerald-600" />
              <Box label="Reserved" v={avail.reserved} tone="text-violet-600" />
              <Box label="Incoming" v={avail.incoming} tone="text-blue-600" />
              <Box label="ETA" v={avail.eta_days ? `${avail.eta_days}d` : '—'} tone="text-slate-600" />
            </div>
          )}

          {it.datasheet_url && <a href={it.datasheet_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline"><FileText size={15} /> View Datasheet</a>}

          {/* alternatives / comparison */}
          {alts.length > 0 && (
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500"><Package size={14} /> Alternatives — {it.product_family}</p>
              {alts.map((a) => (
                <div key={a.id} className="flex items-center justify-between border-b border-slate-50 py-1.5 text-sm">
                  <span className="text-ink">{a.item_name} <span className="text-xs text-muted">· {a.brand}</span></span>
                  <span className="font-semibold text-brand-600">{sar(a.standard_rate || 0)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <ImageLightbox src={big} onClose={() => setBig(null)} />
    </Modal>
  )
}
