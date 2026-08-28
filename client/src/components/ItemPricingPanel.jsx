import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, Calculator, TrendingUp, AlertCircle, Save } from 'lucide-react'
import { api } from '../api.js'
import { useData } from '../store/DataContext.jsx'
import { sar } from '../data/mockData.js'

// Reusable per-item landed-cost editor. Shows every step of the pricing chain as an editable row and
// a LIVE preview (debounced POST /pricing/preview) as the user types. Save → POST /pricing/apply/:id.
// Props: { item, onSaved }. All maths runs server-side in core/pricing.js — this only collects inputs.
const money = (v) => (v == null || Number.isNaN(Number(v)) ? '—' : sar(v))
const pct = (v) => (v == null || Number.isNaN(Number(v)) ? '—' : `${Number(v).toFixed(2)}%`)
const money2 = (v) => (v == null || Number.isNaN(Number(v)) ? '—' : 'SAR ' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

// which item fields the panel edits (each is a real column on items / accepted by /pricing/apply)
const EDIT_FIELDS = [
  'supplier_price', 'currency', 'factory_cost', 'freight_cost', 'insurance_cost', 'customs_duty',
  'local_transport', 'other_landed_cost', 'landed_template_id', 'markup_factor', 'add_margin_pct', 'special_offer_pct',
]
const initForm = (item) => {
  const f = {}
  for (const k of EDIT_FIELDS) f[k] = item?.[k] ?? ''
  return f
}

export default function ItemPricingPanel({ item, onSaved }) {
  const d = useData()
  const [form, setForm] = useState(() => initForm(item))
  const [chain, setChain] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [templates, setTemplates] = useState([])
  const timer = useRef(null)

  useEffect(() => { setForm(initForm(item)); setChain(null); setErr(''); setOk('') }, [item])

  useEffect(() => {
    api('/pricing/templates').then((t) => setTemplates(Array.isArray(t) ? t : [])).catch(() => setTemplates([]))
  }, [])

  const currencyCodes = (d.settings?.currencies || []).map((c) => c.code)
  const currencyOpts = Array.from(new Set([item?.currency, ...currencyCodes].filter(Boolean)))

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  // debounced live preview
  const runPreview = useCallback(async (f) => {
    setPreviewing(true); setErr('')
    try {
      const body = { item: { ...item, valuation_rate: item?.valuation_rate, ...f } }
      const res = await api('/pricing/preview', { method: 'POST', body })
      setChain(res)
    } catch (e) { setErr(e.message); setChain(null) } finally { setPreviewing(false) }
  }, [item])

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => runPreview(form), 400)
    return () => clearTimeout(timer.current)
  }, [form, runPreview])

  const save = async () => {
    setSaving(true); setErr(''); setOk('')
    try {
      const res = await api(`/pricing/apply/${item.id}`, { method: 'POST', body: form })
      setChain(res)
      setOk('Pricing saved to the item.')
      await d.loadAll?.()
      onSaved?.(res)
    } catch (e) { setErr(e.message) } finally { setSaving(false) }
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

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {/* ── inputs ── */}
      <div className="space-y-4">
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500"><Calculator size={14} /> Cost inputs</h4>
          <div className="grid grid-cols-2 gap-3">
            {numRow('supplier_price', 'Supplier price')}
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-slate-500">Currency</span>
              <select value={form.currency ?? ''} onChange={(e) => set('currency', e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-500/15">
                <option value="">Base (SAR)</option>
                {currencyOpts.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            {numRow('factory_cost', 'Factory cost')}
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-slate-500">Landed-cost template</span>
              <select value={form.landed_template_id ?? ''} onChange={(e) => set('landed_template_id', e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-500/15">
                <option value="">— None (use explicit amounts)</option>
                {templates.filter((t) => t.is_active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Landed components (leave blank to use template %)</h4>
          <div className="grid grid-cols-2 gap-3">
            {numRow('freight_cost', 'Freight')}
            {numRow('insurance_cost', 'Insurance')}
            {numRow('customs_duty', 'Customs & duties')}
            {numRow('local_transport', 'Local transport')}
            {numRow('other_landed_cost', 'Other')}
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Markup & margin</h4>
          <div className="grid grid-cols-3 gap-3">
            {numRow('markup_factor', 'Markup factor', tplName ? 'template' : '1')}
            {numRow('add_margin_pct', 'Add margin %')}
            {numRow('special_offer_pct', 'Special offer %')}
          </div>
        </div>

        {err && <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600"><AlertCircle size={14} className="mt-0.5 shrink-0" />{err}</div>}
        {ok && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-600">{ok}</div>}

        <button className="btn-primary w-full" disabled={saving || !item?.id} onClick={save}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save pricing to item
        </button>
      </div>

      {/* ── live preview ── */}
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500"><TrendingUp size={14} /> Live preview</h4>
            {previewing && <Loader2 size={14} className="animate-spin text-brand-500" />}
          </div>

          {!priced ? (
            <div className="rounded-lg bg-amber-50 px-3 py-6 text-center text-xs font-medium text-amber-700">
              {chain?.reason || 'Set a valuation rate on the item to price it (Brand Master factors apply automatically).'}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-100">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Landed cost</p>
                  <p className="mt-0.5 text-lg font-extrabold text-ink">{money2(chain.landed_cost)}</p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-100">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Selling price</p>
                  <p className="mt-0.5 text-lg font-extrabold text-brand-600">{money2(chain.selling_price)}</p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-100">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Gross profit</p>
                  <p className="mt-0.5 text-sm font-bold text-emerald-600">{money2(chain.gross_profit)} <span className="text-xs font-semibold text-slate-400">({pct(chain.gp_percent)})</span></p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-100">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Net profit</p>
                  <p className="mt-0.5 text-sm font-bold text-emerald-600">{money2(chain.net_profit)} <span className="text-xs font-semibold text-slate-400">({pct(chain.np_percent)})</span></p>
                </div>
              </div>

              <table className="mt-4 w-full text-xs">
                <tbody className="divide-y divide-slate-100">
                  <Line label={`Supplier price${chain.currency ? ` (${chain.currency})` : ''}`} value={money2(chain.supplier_price)} />
                  <Line label={`× FX rate to SAR`} value={`× ${chain.fx_rate}`} />
                  <Line label="Supplier cost (SAR)" value={money2(chain.supplier_cost)} strong />
                  <Line label="+ Factory cost" value={money2(chain.factory_cost)} />
                  <Line label="+ Freight" value={money2(chain.freight_cost)} />
                  <Line label="+ Insurance" value={money2(chain.insurance_cost)} />
                  <Line label="+ Customs & duties" value={money2(chain.customs_duty)} />
                  <Line label="+ Local transport" value={money2(chain.local_transport)} />
                  <Line label="+ Other" value={money2(chain.other_landed_cost)} />
                  <Line label="= Landed cost" value={money2(chain.landed_cost)} strong />
                  <Line label={`× Markup factor`} value={`× ${chain.markup_factor}`} />
                  <Line label="= Calculated sale price" value={money2(chain.calculated_sale_price)} />
                  <Line label={`+ Add margin`} value={pct(chain.add_margin_pct)} />
                  <Line label={`− Special offer`} value={pct(chain.special_offer_pct)} />
                  <Line label={`− Discount${chain.discount_rule ? ` (${chain.discount_rule})` : ''}`} value={pct(chain.discount_pct)} />
                  <Line label="= Selling price" value={money2(chain.selling_price)} strong accent />
                  <Line label={`OPEX (${pct(chain.opex_pct)} of selling)`} value={money2((chain.selling_price * (chain.opex_pct || 0)) / 100)} />
                </tbody>
              </table>
              {chain.template && <p className="mt-2 text-[11px] text-muted">Template: {chain.template}</p>}
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
