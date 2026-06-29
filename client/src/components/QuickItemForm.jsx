import { useState, useEffect } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { Modal, Field, Select, Row } from './Modal.jsx'
import { useData } from '../store/DataContext.jsx'

const CATEGORIES = ['Equipment', 'Custom Fabrication']
const blank = () => ({ product_family: '', brand: '', model: '', category: '', sub_category: '', datasheet_url: '', image_url: '' })

// (11) auto-resize uploaded image to standard dimensions → compact data URL (one image only)
export function resizeImage(file, max = 600) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale)
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h
      cv.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve(cv.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = reject
    const r = new FileReader(); r.onload = () => { img.src = r.result }; r.onerror = reject; r.readAsDataURL(file)
  })
}

export default function QuickItemForm({ open, onClose }) {
  const d = useData()
  const [v, setV] = useState(blank())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { if (open) { setV(blank()); setErr('') } }, [open])

  const on = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }))
  // selecting a Product Family inherits its Category / Sub Category
  const onFamily = (e) => {
    const name = e.target.value
    const f = (d.productFamilies || []).find((x) => x.name === name)
    setV((s) => ({ ...s, product_family: name, category: f?.category || s.category, sub_category: f?.sub_category || s.sub_category }))
  }
  const brand = (d.brands || []).find((b) => b.brand === v.brand)
  const autoName = [v.brand, v.model, v.product_family].filter(Boolean).join(' ')

  const save = async () => {
    setErr('')
    if (!v.brand || !v.model || !v.product_family) return setErr('Brand, Model and Product Family are required.')
    setBusy(true)
    try { await d.createItem({ ...v, stock_uom: 'Nos', is_stock_item: true, is_sales_item: true, is_purchase_item: true }); onClose(true) }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={() => onClose(false)} title="New Item — Quick Create" subtitle="Enter product info only — Code, Name & Pricing auto-generate"
      footer={<><button className="btn-ghost" onClick={() => onClose(false)}>Cancel</button><button className="btn-primary" disabled={busy} onClick={save}>{busy ? <Loader2 size={16} className="animate-spin" /> : null} Create Item</button></>}>
      <div className="space-y-4">
        <Select label="Product Family *" value={v.product_family} onChange={onFamily} options={['', ...(d.productFamilies || []).map((f) => f.name)]} />
        <Row>
          <Select label="Brand *" value={v.brand} onChange={on('brand')} options={['', ...(d.brands || []).map((b) => b.brand)]} />
          <Field label="Model *" value={v.model} onChange={on('model')} placeholder="e.g. C-G941" />
        </Row>
        <Row>
          <Select label="Category" value={v.category} onChange={on('category')} options={['', ...CATEGORIES]} />
          <Field label="Sub Category" value={v.sub_category} onChange={on('sub_category')} placeholder="e.g. Cooking Equipment" />
        </Row>
        <Field label="Datasheet URL" value={v.datasheet_url} onChange={on('datasheet_url')} placeholder="https://… (PDF datasheet)" />
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Product Image <span className="font-normal text-muted">(one image — auto-resized)</span></label>
          <div className="flex items-center gap-3">
            {v.image_url
              ? <img src={v.image_url} alt="item" className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
              : <div className="grid h-16 w-16 place-items-center rounded-lg border border-dashed border-slate-300 text-[10px] text-slate-400">No image</div>}
            <label className="cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-brand-600 hover:bg-brand-50">
              {v.image_url ? 'Change' : 'Upload'} Image
              <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { try { setV((s) => ({ ...s, image_url: '' })); const url = await resizeImage(f); setV((s) => ({ ...s, image_url: url })) } catch { setErr('Could not read image') } } }} />
            </label>
            {v.image_url && <button type="button" onClick={() => setV((s) => ({ ...s, image_url: '' }))} className="text-xs text-slate-400 hover:text-rose-500">Remove</button>}
          </div>
        </div>

        <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-bold text-brand-700"><Sparkles size={13} /> Auto preview</p>
          <p className="mt-1 text-sm font-semibold text-ink">{autoName || 'Item name will appear here…'}</p>
          {brand
            ? <p className="mt-1 text-[11px] leading-relaxed text-muted">Pricing on save → supplier price (from <b>{v.brand}</b> price list) × exchange <b>{brand.exchange_factor}</b> → landed cost → × price factor <b>{brand.price_factor}</b> → selling price. No list price? You can enter cost/selling manually later.</p>
            : v.brand && <p className="mt-1 text-[11px] text-amber-600">Brand “{v.brand}” has no factors set — add them in Masters for auto-pricing.</p>}
        </div>
        {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{err}</div>}
      </div>
    </Modal>
  )
}
