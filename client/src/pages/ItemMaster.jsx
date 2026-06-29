import { useState } from 'react'
import { Search, Plus, Package, Layers, Tag, Sparkles, Settings2 } from 'lucide-react'
import { PageHeader, Badge } from '../components/ui.jsx'
import { Modal, Field, Select } from '../components/Modal.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import ItemForm from '../components/ItemForm.jsx'

export default function ItemMaster() {
  const d = useData()
  const { user } = useAuth()
  const canEdit = ['Management', 'Stock Manager', 'Stock User'].includes(user?.role) || user?.access_level === 'Full Admin'
  const items = d.items || []
  const [q, setQ] = useState('')
  const [g, setG] = useState('All')
  const [form, setForm] = useState({ open: false, id: null })
  const [masters, setMasters] = useState(false)

  const groups = ['All', ...new Set(items.map((i) => i.item_group).filter(Boolean))]
  const rows = items.filter((i) => (g === 'All' || i.item_group === g) && `${i.item_code} ${i.item_name} ${i.brand || ''}`.toLowerCase().includes(q.toLowerCase()))
  const seeCost = items.some((i) => i.cost != null)

  const flag = (on, label, tone) => (on ? <span className={`mr-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${tone}`}>{label}</span> : null)

  return (
    <>
      <PageHeader title="Item Master" subtitle="Central catalogue — created by Warehouse, used by every panel">
        <button className="btn-ghost" onClick={() => setMasters(true)}><Settings2 size={16} /> Masters</button>
        {canEdit && <button className="btn-primary" onClick={() => setForm({ open: true, id: null })}><Plus size={16} /> New Item</button>}
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Items" value={items.filter((i) => !i.has_variants).length} icon={Package} tone="text-brand-600" />
        <Stat label="Templates" value={items.filter((i) => i.has_variants).length} icon={Layers} tone="text-violet-600" />
        <Stat label="Item Groups" value={(d.itemGroups || []).length} icon={Tag} tone="text-gold-600" />
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
              <th className="th">Code</th><th className="th">Item</th><th className="th">Group</th><th className="th">Brand</th>
              <th className="th">UOM</th><th className="th">Type</th>{seeCost && <th className="th">Cost</th>}<th className="th">Sell Rate</th><th className="th">Status</th>
            </tr></thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} onClick={() => setForm({ open: true, id: i.id })} className="cursor-pointer hover:bg-slate-50/60">
                  <td className="td font-semibold text-brand-600">{i.item_code}</td>
                  <td className="td font-medium text-ink">{i.item_name}{i.variant_of && <span className="ml-1 text-[10px] text-violet-500">variant</span>}</td>
                  <td className="td text-slate-500">{i.item_group}</td>
                  <td className="td text-slate-500">{i.brand || '—'}</td>
                  <td className="td text-slate-500">{i.stock_uom}</td>
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

      <ItemForm open={form.open} itemId={form.id} onClose={() => setForm({ open: false, id: null })} />
      <MastersModal open={masters} onClose={() => setMasters(false)} />
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

function MastersModal({ open, onClose }) {
  const d = useData()
  const [grp, setGrp] = useState({ item_group_name: '', parent_item_group: '', is_group: false })
  const [br, setBr] = useState('')
  const [attr, setAttr] = useState({ attribute_name: '', values: '' })
  const [msg, setMsg] = useState('')
  const ok = (t) => { setMsg(t); setTimeout(() => setMsg(''), 2500) }
  return (
    <Modal open={open} onClose={onClose} size="lg" title="Item Masters" subtitle="Item Groups · Brands · Variant Attributes"
      footer={<button className="btn-ghost" onClick={onClose}>Close</button>}>
      {msg && <div className="mb-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-600">{msg}</div>}
      <div className="grid gap-5 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase text-slate-500"><Tag size={14} /> Item Groups ({(d.itemGroups || []).length})</p>
          <Field label="Group Name" value={grp.item_group_name} onChange={(e) => setGrp((s) => ({ ...s, item_group_name: e.target.value }))} />
          <div className="mt-2"><Select label="Parent" value={grp.parent_item_group} onChange={(e) => setGrp((s) => ({ ...s, parent_item_group: e.target.value }))} options={['', ...(d.itemGroups || []).map((g) => g.item_group_name)]} /></div>
          <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={grp.is_group} onChange={(e) => setGrp((s) => ({ ...s, is_group: e.target.checked }))} className="h-4 w-4 accent-brand-500" /> Is a parent group</label>
          <button className="btn-primary mt-3 w-full !py-2" onClick={async () => { if (!grp.item_group_name) return; try { await d.addItemGroup(grp); setGrp({ item_group_name: '', parent_item_group: '', is_group: false }); ok('Group added') } catch (e) { alert(e.message) } }}>Add Group</button>
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase text-slate-500"><Sparkles size={14} /> Brands ({(d.brands || []).length})</p>
          <Field label="Brand Name" value={br} onChange={(e) => setBr(e.target.value)} />
          <button className="btn-primary mt-3 w-full !py-2" onClick={async () => { if (!br) return; try { await d.addBrand({ brand: br }); setBr(''); ok('Brand added') } catch (e) { alert(e.message) } }}>Add Brand</button>
          <div className="mt-3 flex flex-wrap gap-1">{(d.brands || []).map((b) => <span key={b.id} className="rounded bg-slate-100 px-2 py-0.5 text-[11px]">{b.brand}</span>)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase text-slate-500"><Layers size={14} /> Attributes ({(d.itemAttributes || []).length})</p>
          <Field label="Attribute Name" value={attr.attribute_name} onChange={(e) => setAttr((s) => ({ ...s, attribute_name: e.target.value }))} placeholder="e.g. Voltage" />
          <div className="mt-2"><Field label="Values (comma-separated)" value={attr.values} onChange={(e) => setAttr((s) => ({ ...s, values: e.target.value }))} placeholder="220V, 380V" /></div>
          <button className="btn-primary mt-3 w-full !py-2" onClick={async () => { if (!attr.attribute_name) return; try { await d.addItemAttribute({ attribute_name: attr.attribute_name, values: attr.values.split(',').map((x) => x.trim()).filter(Boolean).map((x) => ({ attribute_value: x })) }); setAttr({ attribute_name: '', values: '' }); ok('Attribute added') } catch (e) { alert(e.message) } }}>Add Attribute</button>
        </div>
      </div>
    </Modal>
  )
}
