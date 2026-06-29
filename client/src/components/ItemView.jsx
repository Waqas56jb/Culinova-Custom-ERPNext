import { useState, useEffect } from 'react'
import { FileText, Package, Pencil } from 'lucide-react'
import { Modal } from './Modal.jsx'
import { useData } from '../store/DataContext.jsx'
import { sar } from '../data/mockData.js'
import ImageLightbox from './ImageLightbox.jsx'

const Info = ({ k, v }) => <p className="text-slate-600"><span className="text-muted">{k}:</span> <span className="font-medium text-ink">{v || '—'}</span></p>
const Box = ({ label, v, tone }) => <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 text-center"><p className={`text-lg font-extrabold ${tone}`}>{v}</p><p className="text-[11px] text-muted">{label}</p></div>

export default function ItemView({ open, itemId, onClose, onEdit, canEdit }) {
  const d = useData()
  const [it, setIt] = useState(null)
  const [avail, setAvail] = useState(null)
  const [alts, setAlts] = useState([])
  const [big, setBig] = useState(null)

  useEffect(() => {
    if (!open || !itemId) return
    setIt(null); setAvail(null); setAlts([])
    d.getItem(itemId).then((x) => { setIt(x); if (x?.item_name) d.checkAvailability(x.item_name).then(setAvail) }).catch(() => {})
    d.getAlternatives(itemId).then(setAlts).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, itemId])

  if (!open) return null
  return (
    <Modal open={open} onClose={onClose} size="lg" title={it?.item_name || 'Item'} subtitle={it ? `${it.item_code} · ${it.product_family || ''}` : ''}
      footer={<>{canEdit && <button className="btn-ghost" onClick={onEdit}><Pencil size={14} /> Edit</button>}<button className="btn-primary" onClick={onClose}>Close</button></>}>
      {!it ? <p className="py-8 text-center text-sm text-slate-400">Loading…</p> : (
        <div className="space-y-4">
          {/* large product image (click to enlarge) */}
          {it.image_url
            ? <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <img src={it.image_url} alt={it.item_name} onClick={() => setBig(it.image_url)} title="Click to enlarge"
                  className="mx-auto h-64 w-full cursor-zoom-in object-contain transition hover:opacity-90" />
              </div>
            : <div className="grid h-40 w-full place-items-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-400">No image</div>}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <Info k="Brand" v={it.brand} /><Info k="Model" v={it.model} />
            <Info k="Category" v={it.category} /><Info k="Sub Category" v={it.sub_category} />
          </div>

          {/* pricing — cost/GP/supplier only show if the role is allowed (server-redacted) */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Box label="Selling Price" v={sar(it.standard_rate || 0)} tone="text-brand-600" />
            {it.cost != null && <Box label="Landed Cost" v={sar(it.cost)} tone="text-gold-600" />}
            {it.gp_percent != null && <Box label="GP %" v={`${it.gp_percent}%`} tone="text-emerald-600" />}
            {it.supplier_price != null && <Box label="Supplier Price" v={sar(it.supplier_price)} tone="text-slate-600" />}
          </div>

          {/* availability (9) */}
          {avail?.matched && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Box label="Available" v={avail.available} tone="text-emerald-600" />
              <Box label="Reserved" v={avail.reserved} tone="text-violet-600" />
              <Box label="Incoming" v={avail.incoming} tone="text-blue-600" />
              <Box label="ETA" v={avail.eta_days ? `${avail.eta_days}d` : '—'} tone="text-slate-600" />
            </div>
          )}

          {it.datasheet_url && <a href={it.datasheet_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline"><FileText size={15} /> View Datasheet</a>}

          {/* alternatives / comparison (8) */}
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
