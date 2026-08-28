import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, Calculator, TrendingUp, AlertCircle, Save } from 'lucide-react'
import { api } from '../api.js'
import { useData } from '../store/DataContext.jsx'
import { sar } from '../data/mockData.js'

// Item pricing drill-down — selling/GP from core/priceEngine.js (VR × brand factors).
// Supplier landed-template fields are kept for future Actual Landed Cost (Ali §8) only.
const money = (v) => (v == null || Number.isNaN(Number(v)) ? '—' : sar(v))
const pct = (v) => (v == null || Number.isNaN(Number(v)) ? '—' : `${Number(v).toFixed(2)}%`)
const money2 = (v) => (v == null || Number.isNaN(Number(v)) ? '—' : 'SAR ' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const n0 = (v) => Number(v) || 0

const EDIT_FIELDS = [
  'supplier_price', 'currency', 'factory_cost', 'freight_cost', 'insurance_cost', 'customs_duty',
  'local_transport', 'other_landed_cost', 'landed_template_id', 'markup_factor', 'add_margin_pct', 'special_offer_pct',
  'exchange_factor', 'price_factor',
]
const initForm = (item) => {
  const f = {}
  for (const k of EDIT_FIELDS) f[k] = item?.[k] ?? ''
  return f
}

export default function ItemPricingPanel({ item, onSaved }) {
  const d = useData()
  const [baseItem, setBaseItem] = useState(item)
  const [form, setForm] = useState(() => initForm(item))
  const [chain, setChain] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [templates, setTemplates] = useState([])
  const timer = useRef(null)

  // Always preview from the saved DB row (list cache may omit valuation_rate).
  useEffect(() => {
    if (!item?.id) { setBaseItem(item); return }
    let cancelled = false
    api(`/items/${item.id}`)
      .then((full) => { if (!cancelled) setBaseItem({ ...item, ...full }) })
      .catch(() => { if (!cancelled) setBaseItem(item) })
    return () => { cancelled = true }
  }, [item?.id])

  useEffect(() => {
    setForm(initForm(baseItem))
    setChain(null)
    setErr('')
    setOk('')
  }, [baseItem?.id, baseItem?.valuation_rate, baseItem?.selling_price])

  useEffect(() => {
    api('/pricing/templates').then((t) => setTemplates(Array.isArray(t) ? t : [])).catch(() => setTemplates([]))
  }, [])

  const currencyCodes = (d.settings?.currencies || []).map((c) => c.code)
  const currencyOpts = Array.from(new Set([baseItem?.currency, ...currencyCodes].filter(Boolean)))

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const runPreview = useCallback(async (f) => {
    if (!baseItem?.id) return
    setPreviewing(true)
    setErr('')
    try {
      const res = await api('/pricing/preview', {
        method: 'POST',
        body: {
          item_id: baseItem.id,
          item: {
            valuation_rate: baseItem.valuation_rate,
            brand: baseItem.brand,
            ...f,
          },
        },
      })
      setChain(res)
    } catch (e) {
      setErr(e.message)
      setChain(null)
    } finally {
      setPreviewing(false)
    }
  }, [baseItem])

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => runPreview(form), 400)
    return () => clearTimeout(timer.current)
  }, [form, runPreview])

  const save = async () => {
    setSaving(true)
    setErr('')
    setOk('')
    try {
      const res = await api(`/pricing/apply/${baseItem.id}`, { method: 'POST', body: form })
      setChain(res)
      setOk('Pricing saved to the item.')
      await d.loadAll?.()
      onSaved?.(res)
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  const numRow = (key, label, hint) => (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold text-slate-500">{label}</span>
      <input type="number" step="any" value={form[key] ?? ''} onChange={(e) => set(key, e.target.value)}
        placeholder={hint || '0'}
        className="w-full rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-500/15" />
    </label>
  )

  const priced = chain?.priced
  const tplName = templates.find((t) => t.id === form.landed_template_id)?.name
  const f = chain?.factors || {}
  const vrBasis = n0(chain?.basis_value ?? baseItem?.valuation_rate)
  const exch = f.exchange_factor ?? '—'
  const pf = f.price_factor ?? '—'
  const margin = f.add_margin_pct ?? 0
  const offer = f.special_offer_pct ?? 0

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-3 text-xs text-slate-600">
          <p className="font-semibold text-ink">Valuation rate (set in Price Items table)</p>
          <p className="mt-1 tabular-nums">Current VR: <b>{money2(baseItem?.valuation_rate)}</b> · Brand: <b>{baseItem?.brand || '—'}</b></p>
          <p className="mt-1 text-[11px] text-muted">Selling uses Brand Master factors unless item override below.</p>
        </div>

        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500"><Calculator size={14} /> Item overrides (optional)</h4>
          <div className="grid grid-cols-2 gap-3">
            {numRow('exchange_factor', 'Exchange factor override')}
            {numRow('price_factor', 'Price factor override')}
          </div>
        </div>

        <details className="rounded-xl border border-slate-200 bg-slate-50/40 p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-slate-500">Supplier landed cost (future — not used for selling)</summary>
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {numRow('supplier_price', 'Supplier price')}
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-500">Currency</span>
                <select value={form.currency ?? ''} onChange={(e) => set('currency', e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white">
                  <option value="">Base (SAR)</option>
                  {currencyOpts.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              {numRow('factory_cost', 'Factory cost')}
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-500">Landed-cost template</span>
                <select value={form.landed_template_id ?? ''} onChange={(e) => set('landed_template_id', e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white">
                  <option value="">— None —</option>
                  {templates.filter((t) => t.is_active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {numRow('freight_cost', 'Freight')}
              {numRow('insurance_cost', 'Insurance')}
              {numRow('customs_duty', 'Customs')}
              {numRow('local_transport', 'Transport')}
              {numRow('other_landed_cost', 'Other')}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {numRow('markup_factor', 'Markup factor', tplName ? 'template' : '1')}
              {numRow('add_margin_pct', 'Add margin %')}
              {numRow('special_offer_pct', 'Special offer %')}
            </div>
          </div>
        </details>

        {err && <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600"><AlertCircle size={14} className="mt-0.5 shrink-0" />{err}</div>}
        {ok && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-600">{ok}</div>}

        <button className="btn-primary w-full" disabled={saving || !baseItem?.id || !priced} onClick={save}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save pricing to item
        </button>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500"><TrendingUp size={14} /> Live preview (VR chain)</h4>
            {previewing && <Loader2 size={14} className="animate-spin text-brand-500" />}
          </div>

          {!priced ? (
            <div className="rounded-lg bg-amber-50 px-3 py-6 text-center text-xs font-medium text-amber-700">
              {chain?.reason || 'Set a valuation rate on the item (Price Items table), then reopen this panel.'}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-100">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Expected landed</p>
                  <p className="mt-0.5 text-lg font-extrabold text-ink">{money2(chain.expected_landed ?? chain.landed_cost)}</p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-100">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Selling price</p>
                  <p className="mt-0.5 text-lg font-extrabold text-brand-600">{money2(chain.selling_price ?? chain.selling)}</p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-100 col-span-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Gross profit</p>
                  <p className="mt-0.5 text-sm font-bold text-emerald-600">{money2(chain.gross_profit ?? (n0(chain.selling_price) - n0(chain.expected_landed)))} <span className="text-xs font-semibold text-slate-400">({pct(chain.gp_percent ?? chain.gp_pct)})</span></p>
                </div>
              </div>

              <table className="mt-4 w-full text-xs">
                <tbody className="divide-y divide-slate-100">
                  <Line label="Basis" value={chain.basis === 'valuation_rate' ? 'Valuation rate' : (chain.basis || '—')} />
                  <Line label="Valuation rate" value={money2(vrBasis)} strong />
                  <Line label={`× Exchange factor (${baseItem?.brand || 'brand'})`} value={`× ${exch}`} />
                  <Line label="= Expected landed cost" value={money2(chain.expected_landed ?? chain.landed_cost)} strong />
                  <Line label="× Price factor" value={`× ${pf}`} />
                  <Line label="= Base selling" value={money2(chain.base_selling ?? chain.calculated_sale_price)} />
                  <Line label={`+ Add margin (${margin}%)`} value={margin ? `+ ${margin}%` : '—'} />
                  <Line label={`− Special offer (${offer}%)`} value={offer ? `− ${offer}%` : '—'} />
                  <Line label="= Selling price" value={money2(chain.selling_price ?? chain.selling)} strong accent />
                </tbody>
              </table>
              {chain.currency && <p className="mt-2 text-[11px] text-muted">Display currency: {chain.currency}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Line({ label, value, strong, accent }) {
  return (
    <tr>
      <td className={`py-1.5 ${strong ? 'font-bold text-ink' : 'text-slate-500'}`}>{label}</td>
      <td className={`py-1.5 text-right tabular-nums ${accent ? 'font-extrabold text-brand-600' : strong ? 'font-bold text-ink' : 'text-slate-600'}`}>{value}</td>
    </tr>
  )
}
