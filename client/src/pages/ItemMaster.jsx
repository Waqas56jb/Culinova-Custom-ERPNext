import { useState, useEffect } from 'react'
import { Search, Plus, Package, Layers, Tag, Sparkles, Settings2, Database, SlidersHorizontal, Trash2 } from 'lucide-react'
import { PageHeader, Badge, Menu, MenuItem } from '../components/ui.jsx'
import { Modal, Field, Select } from '../components/Modal.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import ItemForm from '../components/ItemForm.jsx'
import QuickItemForm from '../components/QuickItemForm.jsx'
import ItemImportExport from '../components/ItemImportExport.jsx'
import EosImportModal from '../components/EosImportModal.jsx'
import ItemView from '../components/ItemView.jsx'
import ImageLightbox from '../components/ImageLightbox.jsx'

export default function ItemMaster() {
  const d = useData()
  const { user } = useAuth()
  const canEdit = ['Management', 'Stock Manager', 'Stock User'].includes(user?.role) || user?.access_level === 'Full Admin'
  const items = d.items || []
  const [q, setQ] = useState('')
  const [g, setG] = useState('All')
  const [form, setForm] = useState({ open: false, id: null })
  const [view, setView] = useState(null)
  const [quick, setQuick] = useState(false)
  const [masters, setMasters] = useState(false)
  const [eos, setEos] = useState(false)
  const [lightbox, setLightbox] = useState(null)

  const groups = ['All', ...new Set(items.map((i) => i.category).filter(Boolean))]
  const rows = items.filter((i) => (g === 'All' || i.category === g) && `${i.item_code} ${i.item_name} ${i.brand || ''} ${i.product_family || ''}`.toLowerCase().includes(q.toLowerCase()))
  const seeCost = items.some((i) => i.cost != null)

  const flag = (on, label, tone) => (on ? <span className={`mr-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${tone}`}>{label}</span> : null)

  return (
    <>
      <PageHeader title="Item Master" subtitle="Central catalogue — created by Warehouse, used by every panel">
        {canEdit && <ItemImportExport />}
        {canEdit && <button className="btn-ghost whitespace-nowrap" onClick={() => setEos(true)}><Database size={16} /> Import from EOS</button>}
        {canEdit && (
          <Menu label="More" icon={Settings2}>
            <MenuItem icon={Settings2} onClick={() => setMasters(true)}>Masters (brands · families · price lists)</MenuItem>
            <MenuItem icon={SlidersHorizontal} onClick={() => setForm({ open: true, id: null })}>Advanced item form</MenuItem>
          </Menu>
        )}
        {canEdit && <button className="btn-primary whitespace-nowrap" onClick={() => setQuick(true)}><Plus size={16} /> New Item</button>}
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Items" value={items.filter((i) => !i.has_variants).length} icon={Package} tone="text-brand-600" />
        <Stat label="Templates" value={items.filter((i) => i.has_variants).length} icon={Layers} tone="text-violet-600" />
        <Stat label="Product Families" value={(d.productFamilies || []).length} icon={Tag} tone="text-gold-600" />
        <Stat label="Disabled" value={items.filter((i) => i.disabled).length} icon={Sparkles} tone="text-rose-600" />
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center">
          <div className="flex flex-wrap gap-1.5">
            {groups.slice(0, 8).map((x) => (
              <button key={x} onClick={() => setG(x)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${g === x ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{x}</button>
            ))}
          </div>
          <div className="relative sm:ml-auto sm:w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code / name / brand…" className="w-full rounded-lg border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:bg-white" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">Code</th><th className="th">Item</th><th className="th">Family</th><th className="th">Category</th><th className="th">Brand</th>
              <th className="th">Type</th>{seeCost && <th className="th">Cost</th>}<th className="th">Sell Rate</th><th className="th">Status</th>
            </tr></thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} onClick={() => setView(i.id)} className="cursor-pointer hover:bg-slate-50/60">
                  <td className="td font-semibold text-brand-600">{i.item_code}</td>
                  <td className="td font-medium text-ink">
                    <div className="flex items-center gap-2">
                      {i.image_url ? <img src={i.image_url} alt="" onClick={(e) => { e.stopPropagation(); setLightbox(i.image_url) }} className="h-12 w-12 shrink-0 cursor-zoom-in rounded-lg border border-slate-200 object-cover transition hover:ring-2 hover:ring-brand-400" /> : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-dashed border-slate-200 text-[9px] text-slate-300">IMG</span>}
                      <span>{i.item_name}{i.variant_of && <span className="ml-1 text-[10px] text-violet-500">variant</span>}{i.eos_entry_id && <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-brand-50 px-1 py-0.5 text-[9px] font-bold text-brand-600" title="Synced from CULINOVA EOS"><Database size={9} /> EOS</span>}</span>
                    </div>
                  </td>
                  <td className="td text-slate-500">{i.product_family || '—'}</td>
                  <td className="td text-slate-500">{i.category || '—'}</td>
                  <td className="td text-slate-500">{i.brand || '—'}</td>
                  <td className="td">
                    {flag(i.is_stock_item, 'STK', 'bg-emerald-50 text-emerald-600')}
                    {flag(i.is_sales_item, 'SAL', 'bg-blue-50 text-blue-600')}
                    {flag(i.is_purchase_item, 'PUR', 'bg-amber-50 text-amber-600')}
                    {flag(i.has_variants, 'TPL', 'bg-violet-50 text-violet-600')}
                  </td>
                  {seeCost && <td className="td text-slate-600">{i.cost != null ? sar(i.cost) : '—'}</td>}
                  <td className="td font-semibold">{sar(i.standard_rate || 0)}</td>
                  <td className="td"><Badge tone={i.disabled ? 'red' : 'green'}>{i.disabled ? 'Disabled' : 'Active'}</Badge></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td className="td text-slate-400" colSpan={seeCost ? 9 : 8}>No items yet. Click “New Item” to add one.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <ItemView open={!!view} itemId={view} canEdit={canEdit} onClose={() => setView(null)} onEdit={() => { setForm({ open: true, id: view }); setView(null) }} />
      <ItemForm open={form.open} itemId={form.id} onClose={() => setForm({ open: false, id: null })} />
      <QuickItemForm open={quick} onClose={() => setQuick(false)} />
      <EosImportModal open={eos} onClose={() => setEos(false)} />
      <MastersModal open={masters} onClose={() => setMasters(false)} />
      <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
    </>
  )
}

function Stat({ label, value, icon: Icon, tone }) {
  return (
    <div className="card card-pad flex items-center gap-3">
      <span className={`grid h-10 w-10 place-items-center rounded-xl bg-slate-100 ${tone}`}><Icon size={18} /></span>
      <div><p className={`text-2xl font-extrabold ${tone}`}>{value}</p><p className="text-xs text-muted">{label}</p></div>
    </div>
  )
}

const MTABS = ['Brands', 'Product Families', 'Units', 'Price Lists']
function MastersModal({ open, onClose }) {
  const d = useData()
  const [tab, setTab] = useState('Brands')
  const [msg, setMsg] = useState('')
  const ok = (t) => { setMsg(t); setTimeout(() => setMsg(''), 2500) }
  const [br, setBr] = useState({ brand: '', currency: 'SAR', exchange_factor: 1, price_factor: 1, country_of_origin: '', country_of_purchase: '' })
  const [fam, setFam] = useState({ name: '', category: 'Equipment', sub_category: '', datasheet_url: '' })
  const [pl, setPl] = useState({ name: '', brand: '', currency: '', year: '', rows: '' })
  const [uoms, setUoms] = useState([])
  const [uom, setUom] = useState({ name: '', symbol: '' })
  const loadUoms = () => d.resList('masters/uoms').then((u) => setUoms(Array.isArray(u) ? u : [])).catch(() => setUoms([]))
  useEffect(() => { if (open) loadUoms() }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const addUom = async () => { if (!uom.name) return; try { await d.resAdd('masters/uoms', uom); setUom({ name: '', symbol: '' }); loadUoms(); ok('Unit added') } catch (e) { alert(e.message) } }
  const delUom = async (id) => { try { await d.resDelete('masters/uoms', id); loadUoms() } catch (e) { alert(e.message) } }

  const addBrand = async () => { if (!br.brand) return; try { await d.addBrand(br); setBr({ brand: '', currency: 'SAR', exchange_factor: 1, price_factor: 1 }); ok('Brand added') } catch (e) { alert(e.message) } }
  const addFam = async () => { if (!fam.name) return; try { await d.addProductFamily(fam); setFam({ name: '', category: 'Equipment', sub_category: '', datasheet_url: '' }); ok('Product Family added') } catch (e) { alert(e.message) } }
  const addPL = async () => {
    if (!pl.name) return
    const items = pl.rows.split('\n').map((l) => l.split(/[,\t]/)).filter((c) => c[0] && c[0].trim()).map((c) => ({ model: c[0].trim(), supplier_price: Number((c[1] || '').trim()) || 0 }))
    try { const r = await d.addPriceList({ name: pl.name, brand: pl.brand, currency: pl.currency, year: pl.year, items }); setPl({ name: '', brand: '', currency: '', year: '', rows: '' }); ok(`Price list added (${r.imported} items)`) } catch (e) { alert(e.message) }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Item Masters" subtitle="Brands (factors) · Product Families · Supplier Price Lists"
      footer={<button className="btn-ghost" onClick={onClose}>Close</button>}>
      <div className="-mt-1 mb-3 flex gap-1.5 border-b border-slate-100 pb-3">
        {MTABS.map((t) => <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === t ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{t}</button>)}
      </div>
      {msg && <div className="mb-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-600">{msg}</div>}

      {tab === 'Brands' && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Brand Name" value={br.brand} onChange={(e) => setBr((s) => ({ ...s, brand: e.target.value }))} />
            <Field label="Currency" value={br.currency} onChange={(e) => setBr((s) => ({ ...s, currency: e.target.value }))} placeholder="EUR" />
            <Field label="Exchange Factor" type="number" value={br.exchange_factor} onChange={(e) => setBr((s) => ({ ...s, exchange_factor: e.target.value }))} hint="supplier price × this = landed cost" />
            <Field label="Price Factor" type="number" value={br.price_factor} onChange={(e) => setBr((s) => ({ ...s, price_factor: e.target.value }))} hint="landed × this = selling price" />
            <Field label="Country of Origin" value={br.country_of_origin} onChange={(e) => setBr((s) => ({ ...s, country_of_origin: e.target.value }))} placeholder="Italy" />
            <Field label="Country of Purchase" value={br.country_of_purchase} onChange={(e) => setBr((s) => ({ ...s, country_of_purchase: e.target.value }))} placeholder="KSA" />
          </div>
          <button className="btn-primary !py-2" onClick={addBrand}>Add Brand</button>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-slate-50/60"><th className="th">Brand</th><th className="th">Currency</th><th className="th">Exchange</th><th className="th">Price Factor</th></tr></thead>
            <tbody>{(d.brands || []).map((b) => <tr key={b.id}><td className="td font-medium text-ink">{b.brand}</td><td className="td">{b.currency}</td><td className="td">{b.exchange_factor}</td><td className="td">{b.price_factor}</td></tr>)}</tbody></table></div>
        </div>
      )}

      {tab === 'Product Families' && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Family Name" value={fam.name} onChange={(e) => setFam((s) => ({ ...s, name: e.target.value }))} placeholder="4 Burner Gas Range" />
            <Select label="Category" value={fam.category} onChange={(e) => setFam((s) => ({ ...s, category: e.target.value }))} options={['Equipment', 'Custom Fabrication']} />
            <Field label="Sub Category" value={fam.sub_category} onChange={(e) => setFam((s) => ({ ...s, sub_category: e.target.value }))} placeholder="Cooking Equipment" />
            <Field label="Datasheet URL (custom fab)" value={fam.datasheet_url} onChange={(e) => setFam((s) => ({ ...s, datasheet_url: e.target.value }))} placeholder="https://…" />
          </div>
          <button className="btn-primary !py-2" onClick={addFam}>Add Product Family</button>
          <div className="flex flex-wrap gap-1.5">{(d.productFamilies || []).map((f) => <span key={f.id} className="rounded-lg bg-slate-100 px-2 py-1 text-[11px]">{f.name} <span className="text-slate-400">· {f.category}</span></span>)}</div>
        </div>
      )}

      {tab === 'Units' && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Unit Name" value={uom.name} onChange={(e) => setUom((s) => ({ ...s, name: e.target.value }))} placeholder="e.g. Kilogram" />
            <Field label="Symbol" value={uom.symbol} onChange={(e) => setUom((s) => ({ ...s, symbol: e.target.value }))} placeholder="e.g. kg" />
          </div>
          <button className="btn-primary !py-2" onClick={addUom}>Add Unit</button>
          <div className="flex flex-wrap gap-1.5">{uoms.map((u) => (
            <span key={u.id} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px]">{u.name}{u.symbol ? ` · ${u.symbol}` : ''}
              <button onClick={() => delUom(u.id)} className="text-slate-400 hover:text-rose-500"><Trash2 size={11} /></button>
            </span>
          ))}</div>
        </div>
      )}

      {tab === 'Price Lists' && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="List Name" value={pl.name} onChange={(e) => setPl((s) => ({ ...s, name: e.target.value }))} placeholder="Fagor 2027 Price List" />
            <Select label="Brand" value={pl.brand} onChange={(e) => setPl((s) => ({ ...s, brand: e.target.value }))} options={['', ...(d.brands || []).map((b) => b.brand)]} />
            <Field label="Currency" value={pl.currency} onChange={(e) => setPl((s) => ({ ...s, currency: e.target.value }))} placeholder="EUR" />
            <Field label="Year" value={pl.year} onChange={(e) => setPl((s) => ({ ...s, year: e.target.value }))} placeholder="2027" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Paste from Excel — one line per item: <span className="text-muted">Model, SupplierPrice</span></label>
            <textarea rows={5} value={pl.rows} onChange={(e) => setPl((s) => ({ ...s, rows: e.target.value }))} placeholder={'C-G941, 1000\nC-G740, 850'} className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm font-mono outline-none focus:border-brand-400 focus:bg-white" />
          </div>
          <button className="btn-primary !py-2" onClick={addPL}>Import Price List</button>
          <div className="space-y-1">{(d.priceLists || []).map((l) => <div key={l.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-1.5 text-xs"><span className="font-medium text-ink">{l.name}</span><span className="text-muted">{l.brand} · {l.items} items</span></div>)}</div>
        </div>
      )}
    </Modal>
  )
}
