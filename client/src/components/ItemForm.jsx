import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Loader2, Boxes, Layers } from 'lucide-react'
import { Modal, Field, Select, TextArea, Row } from './Modal.jsx'
import { useData } from '../store/DataContext.jsx'
import { sar } from '../data/mockData.js'

const TABS = ['Details', 'Inventory', 'Sales', 'Purchasing', 'Tax & Trade', 'Accounting', 'Variants', 'Prices', 'More']

const Check = ({ label, val, onChange }) => (
  <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm">
    <input type="checkbox" checked={!!val} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-brand-500" />
    <span className="text-slate-700">{label}</span>
  </label>
)

function ChildTable({ title, icon: Icon, rows = [], onChange, cols }) {
  const add = () => onChange([...rows, {}])
  const set = (i, k, val) => onChange(rows.map((r, idx) => (idx === i ? { ...r, [k]: val } : r)))
  const rm = (i) => onChange(rows.filter((_, idx) => idx !== i))
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">{Icon && <Icon size={14} />}{title}</span>
        <button type="button" onClick={add} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"><Plus size={13} /> Add</button>
      </div>
      {rows.length === 0 && <p className="px-1 py-2 text-xs text-slate-400">No rows.</p>}
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            {cols.map((c) => (
              c.type === 'check'
                ? <label key={c.key} className="flex shrink-0 items-center gap-1 text-xs"><input type="checkbox" checked={!!r[c.key]} onChange={(e) => set(i, c.key, e.target.checked)} className="h-4 w-4 accent-brand-500" />{c.label}</label>
                : <input key={c.key} type={c.type || 'text'} placeholder={c.label} value={r[c.key] ?? ''} onChange={(e) => set(i, c.key, c.type === 'number' ? Number(e.target.value) : e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-1.5 text-xs outline-none focus:border-brand-400 focus:bg-white" />
            ))}
            <button type="button" onClick={() => rm(i)} className="shrink-0 text-slate-300 hover:text-rose-500"><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

const blank = () => ({
  item_code: '', item_name: '', item_group: '', brand: '', model: '', product_family: '', category: '', sub_category: '', stock_uom: 'Nos', description: '',
  disabled: false, is_stock_item: true, is_sales_item: true, is_purchase_item: true, is_fixed_asset: false,
  valuation_method: '', valuation_rate: 0, opening_stock: 0, standard_rate: 0, cost: 0,
  shelf_life_in_days: '', end_of_life: '', warranty_period: '', weight_per_unit: '', weight_uom: '',
  allow_negative_stock: false, has_batch_no: false, has_serial_no: false, has_expiry_date: false, serial_no_series: '', batch_number_series: '',
  sales_uom: '', max_discount: 0, grant_commission: true,
  purchase_uom: '', min_order_qty: 0, lead_time_days: 0, last_purchase_rate: 0, safety_stock: 0, delivered_by_supplier: false,
  country_of_origin: '', customs_tariff_number: '', eta_days: '',
  dimensions: '', power_type: '', product_type: 'Item', currency: '',
  supplier_price: '', exchange_factor: '', price_factor: '', add_margin_pct: 0, special_offer_pct: 0, avg_cost: 0,
  show_room: false, local_purchasing: false, alternatives_note: '',
  has_variants: false, variant_based_on: 'Item Attribute',
  is_sub_contracted_item: false, default_bom: '', production_capacity: '',
  inspection_required_before_purchase: false, inspection_required_before_delivery: false, quality_inspection_template: '',
  enable_deferred_revenue: false, no_of_months: '', enable_deferred_expense: false, no_of_months_exp: '',
  barcodes: [], uoms: [], reorders: [], suppliers: [], customer_details: [], taxes: [], item_defaults: [], attributes: [], manufacturers: [], alternatives: [], prices: [],
})

export default function ItemForm({ open, itemId, onClose }) {
  const d = useData()
  const [tab, setTab] = useState('Details')
  const [v, setV] = useState(blank())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const isEdit = !!itemId

  useEffect(() => {
    if (!open) return
    setTab('Details'); setErr('')
    if (itemId) { d.getItem(itemId).then((it) => setV({ ...blank(), ...it })).catch(() => {}) }
    else setV(blank())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, itemId])

  const on = (k) => (e) => setV((s) => ({ ...s, [k]: e?.target ? e.target.value : e }))
  const setChild = (k) => (rows) => setV((s) => ({ ...s, [k]: rows }))

  const save = async () => {
    setErr('')
    if (!v.item_name && !(v.brand && v.model && v.product_family)) { setTab('Details'); return setErr('Item name (or Brand + Model + Family) is required.') }
    setBusy(true)
    try {
      if (isEdit) await d.updateItem(itemId, v); else await d.createItem(v)
      onClose(true)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const groups = (d.itemGroups || []).filter((g) => !g.is_group).map((g) => g.item_group_name)
  const brandOpts = ['', ...(d.brands || []).map((b) => b.brand)]
  const attrOpts = (d.itemAttributes || []).map((a) => a.attribute_name)

  return (
    <Modal open={open} onClose={() => onClose(false)} size="lg"
      title={isEdit ? `Item · ${v.item_code || ''}` : 'New Item'} subtitle="Full item master — same controls as ERPNext"
      footer={<><button className="btn-ghost" onClick={() => onClose(false)}>Close</button><button className="btn-primary" disabled={busy} onClick={save}>{busy ? <Loader2 size={16} className="animate-spin" /> : null} {isEdit ? 'Save Changes' : 'Create Item'}</button></>}>

      {/* tabs */}
      <div className="-mt-1 mb-1 flex flex-wrap gap-1.5 border-b border-slate-100 pb-3">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${tab === t ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{t}</button>
        ))}
      </div>
      {err && <div className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{err}</div>}

      {tab === 'Details' && (
        <div className="space-y-4">
          <Row>
            <Field label="Item Code" value={v.item_code} onChange={on('item_code')} placeholder="auto if blank" />
            <Field label="Item Name *" value={v.item_name} onChange={on('item_name')} placeholder="e.g. Combi Oven 10-Tray" />
          </Row>
          <Row>
            <Select label="Brand" value={v.brand} onChange={on('brand')} options={brandOpts} />
            <Field label="Model" value={v.model} onChange={on('model')} placeholder="e.g. C-G941" />
          </Row>
          <Row>
            <Select label="Product Family" value={v.product_family} onChange={on('product_family')} options={['', ...(d.productFamilies || []).map((f) => f.name)]} />
            <Select label="Item Group (optional)" value={v.item_group} onChange={on('item_group')} options={['', ...groups]} />
          </Row>
          <Row>
            <Field label="Category" value={v.category} onChange={on('category')} placeholder="Equipment / Custom Fabrication" />
            <Field label="Sub Category" value={v.sub_category} onChange={on('sub_category')} placeholder="Cooking Equipment" />
          </Row>
          <Row>
            <Field label="Default Unit (Stock UOM)" value={v.stock_uom} onChange={on('stock_uom')} placeholder="Nos" />
            <Field label="Dimensions" value={v.dimensions} onChange={on('dimensions')} placeholder="1200x900x850 mm" />
          </Row>
          <Row>
            <Select label="Power Type" value={v.power_type} onChange={on('power_type')} options={['', 'Gas', 'Electric', 'Neutral', 'Steam']} />
            <Select label="Product Type" value={v.product_type} onChange={on('product_type')} options={['Item', 'Service']} />
          </Row>
          <Row>
            <Field label="Country of Origin" value={v.country_of_origin} onChange={on('country_of_origin')} placeholder="Italy / Turkey / Saudi Arabia" />
            <Field label="Image URL" value={v.image_url || ''} onChange={on('image_url')} placeholder="https://…" />
          </Row>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">Description</span>
              <button type="button" onClick={() => setV((s) => ({ ...s, description: [s.brand, s.item_name, s.model, s.specifications].filter(Boolean).join(' — ') }))} className="text-[11px] font-semibold text-brand-600 hover:underline">Auto-generate</button>
            </div>
            <textarea rows={3} value={v.description} onChange={on('description')} className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-white" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Check label="Maintain Stock" val={v.is_stock_item} onChange={on('is_stock_item')} />
            <Check label="Allow Sales" val={v.is_sales_item} onChange={on('is_sales_item')} />
            <Check label="Allow Purchase" val={v.is_purchase_item} onChange={on('is_purchase_item')} />
            <Check label="Is Fixed Asset" val={v.is_fixed_asset} onChange={on('is_fixed_asset')} />
            <Check label="Has Variants" val={v.has_variants} onChange={on('has_variants')} />
            <Check label="Disabled" val={v.disabled} onChange={on('disabled')} />
          </div>
          <ChildTable title="Barcodes" icon={Boxes} rows={v.barcodes} onChange={setChild('barcodes')}
            cols={[{ key: 'barcode', label: 'Barcode' }, { key: 'barcode_type', label: 'Type (EAN/UPC)' }, { key: 'uom', label: 'UOM' }]} />
        </div>
      )}

      {tab === 'Inventory' && (
        <div className="space-y-4">
          <Row>
            <Select label="Valuation Method" value={v.valuation_method} onChange={on('valuation_method')} options={['', 'FIFO', 'Moving Average', 'LIFO']} />
            <Field label="Valuation Rate" type="number" value={v.valuation_rate} onChange={on('valuation_rate')} />
          </Row>
          <Row>
            <Field label="Opening Stock" type="number" value={v.opening_stock} onChange={on('opening_stock')} />
            <Field label="Standard Cost (purchase)" type="number" value={v.cost} onChange={on('cost')} />
          </Row>
          <Row>
            <Field label="Shelf Life (days)" type="number" value={v.shelf_life_in_days} onChange={on('shelf_life_in_days')} />
            <Field label="End of Life" type="date" value={v.end_of_life || ''} onChange={on('end_of_life')} />
          </Row>
          <Row>
            <Field label="Warranty Period (days)" value={v.warranty_period} onChange={on('warranty_period')} />
            <Field label="Weight per Unit" type="number" value={v.weight_per_unit} onChange={on('weight_per_unit')} />
          </Row>
          <Row>
            <Field label="ETA (days)" type="number" value={v.eta_days} onChange={on('eta_days')} hint="shown to Sales/Engineering as incoming ETA" />
            <div />
          </Row>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Check label="Allow Negative Stock" val={v.allow_negative_stock} onChange={on('allow_negative_stock')} />
            <Check label="Has Batch No" val={v.has_batch_no} onChange={on('has_batch_no')} />
            <Check label="Has Serial No" val={v.has_serial_no} onChange={on('has_serial_no')} />
            <Check label="Has Expiry Date" val={v.has_expiry_date} onChange={on('has_expiry_date')} />
          </div>
          {v.has_serial_no && <Field label="Serial Number Series" value={v.serial_no_series} onChange={on('serial_no_series')} placeholder="SN.#####" />}
          {v.has_batch_no && <Field label="Batch Number Series" value={v.batch_number_series} onChange={on('batch_number_series')} placeholder="BATCH.#####" />}
          <ChildTable title="UOM Conversions" rows={v.uoms} onChange={setChild('uoms')}
            cols={[{ key: 'uom', label: 'UOM' }, { key: 'conversion_factor', label: 'Factor', type: 'number' }]} />
          <ChildTable title="Reorder Levels (auto re-order)" rows={v.reorders} onChange={setChild('reorders')}
            cols={[{ key: 'warehouse', label: 'Warehouse' }, { key: 'warehouse_reorder_level', label: 'Re-order Level', type: 'number' }, { key: 'warehouse_reorder_qty', label: 'Re-order Qty', type: 'number' }, { key: 'material_request_type', label: 'Type' }]} />
        </div>
      )}

      {tab === 'Sales' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Auto Pricing (Supplier → Landed → Selling)</p>
            <Row>
              <Field label="Currency" value={v.currency} onChange={on('currency')} placeholder="EUR / USD / SAR" />
              <Field label="Supplier Net Price" type="number" value={v.supplier_price} onChange={on('supplier_price')} />
            </Row>
            <div className="mt-2"><Row>
              <Field label="Exchange Factor" type="number" value={v.exchange_factor} onChange={on('exchange_factor')} hint="blank = use brand factor" />
              <Field label="Price Factor" type="number" value={v.price_factor} onChange={on('price_factor')} hint="blank = use brand factor" />
            </Row></div>
            <div className="mt-2"><Row>
              <Field label="Add Margin (%)" type="number" value={v.add_margin_pct} onChange={on('add_margin_pct')} />
              <Field label="Special Offer (%)" type="number" value={v.special_offer_pct} onChange={on('special_offer_pct')} />
            </Row></div>
          </div>
          <Row>
            <Field label="Selling Price" type="number" value={v.standard_rate} onChange={on('standard_rate')} hint="auto-calculated if supplier price + factors given" />
            <Field label="Default Sales UOM" value={v.sales_uom} onChange={on('sales_uom')} />
          </Row>
          <Row>
            <Field label="Max Discount (%)" type="number" value={v.max_discount} onChange={on('max_discount')} />
            <div className="flex items-end"><Check label="Grant Commission" val={v.grant_commission} onChange={on('grant_commission')} /></div>
          </Row>
          <ChildTable title="Customer Items (customer-specific codes)" rows={v.customer_details} onChange={setChild('customer_details')}
            cols={[{ key: 'customer_name', label: 'Customer' }, { key: 'ref_code', label: 'Their Code' }]} />
        </div>
      )}

      {tab === 'Purchasing' && (
        <div className="space-y-4">
          <Row>
            <Field label="Default Purchase UOM" value={v.purchase_uom} onChange={on('purchase_uom')} />
            <Field label="Min Order Qty" type="number" value={v.min_order_qty} onChange={on('min_order_qty')} />
          </Row>
          <Row>
            <Field label="Lead Time (days)" type="number" value={v.lead_time_days} onChange={on('lead_time_days')} />
            <Field label="Safety Stock" type="number" value={v.safety_stock} onChange={on('safety_stock')} />
          </Row>
          <Check label="Delivered by Supplier (Drop Ship)" val={v.delivered_by_supplier} onChange={on('delivered_by_supplier')} />
          <ChildTable title="Supplier Items (supplier code mapping)" rows={v.suppliers} onChange={setChild('suppliers')}
            cols={[{ key: 'supplier', label: 'Supplier' }, { key: 'supplier_part_no', label: 'Supplier Part No' }]} />
          <ChildTable title="Manufacturers" rows={v.manufacturers} onChange={setChild('manufacturers')}
            cols={[{ key: 'manufacturer', label: 'Manufacturer' }, { key: 'manufacturer_part_no', label: 'Part No' }, { key: 'is_default', label: 'Default', type: 'check' }]} />
        </div>
      )}

      {tab === 'Tax & Trade' && (
        <div className="space-y-4">
          <ChildTable title="Item Taxes" rows={v.taxes} onChange={setChild('taxes')}
            cols={[{ key: 'item_tax_template', label: 'Tax Template' }, { key: 'tax_category', label: 'Tax Category' }, { key: 'valid_from', label: 'Valid From', type: 'date' }]} />
          <Row>
            <Field label="Country of Origin" value={v.country_of_origin} onChange={on('country_of_origin')} />
            <Field label="Customs Tariff / HS Code" value={v.customs_tariff_number} onChange={on('customs_tariff_number')} />
          </Row>
        </div>
      )}

      {tab === 'Accounting' && (
        <div className="space-y-4">
          <ChildTable title="Item Defaults (company-wise warehouse & accounts)" rows={v.item_defaults} onChange={setChild('item_defaults')}
            cols={[{ key: 'company', label: 'Company' }, { key: 'default_warehouse', label: 'Default Warehouse' }, { key: 'expense_account', label: 'Expense A/c' }, { key: 'income_account', label: 'Income A/c' }, { key: 'default_supplier', label: 'Default Supplier' }]} />
          <div className="grid grid-cols-2 gap-2">
            <Check label="Enable Deferred Revenue" val={v.enable_deferred_revenue} onChange={on('enable_deferred_revenue')} />
            <Check label="Enable Deferred Expense" val={v.enable_deferred_expense} onChange={on('enable_deferred_expense')} />
          </div>
          <Row>
            {v.enable_deferred_revenue && <Field label="No. of Months (Revenue)" type="number" value={v.no_of_months} onChange={on('no_of_months')} />}
            {v.enable_deferred_expense && <Field label="No. of Months (Expense)" type="number" value={v.no_of_months_exp} onChange={on('no_of_months_exp')} />}
          </Row>
        </div>
      )}

      {tab === 'Variants' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Check label="Has Variants (template)" val={v.has_variants} onChange={on('has_variants')} />
            <Select label="Variant Based On" value={v.variant_based_on} onChange={on('variant_based_on')} options={['Item Attribute', 'Manufacturer']} />
          </div>
          <ChildTable title="Variant Attributes" icon={Layers} rows={v.attributes} onChange={setChild('attributes')}
            cols={[{ key: 'attribute', label: `Attribute (${attrOpts.join('/') || 'create in Masters'})` }, { key: 'attribute_value', label: 'Value' }]} />
          {isEdit && v.has_variants && (
            <VariantGenerator item={v} itemId={itemId} onDone={() => onClose(true)} />
          )}
          {!isEdit && v.has_variants && <p className="text-xs text-muted">Save the template first, then generate variants.</p>}
        </div>
      )}

      {tab === 'Prices' && (
        <PricesTab itemId={itemId} prices={v.prices} setPrices={(p) => setV((s) => ({ ...s, prices: p }))} stockUom={v.stock_uom} />
      )}

      {tab === 'More' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Check label="Show Room" val={v.show_room} onChange={on('show_room')} />
            <Check label="Local Purchasing" val={v.local_purchasing} onChange={on('local_purchasing')} />
            <Check label="Serial No Control" val={v.has_serial_no} onChange={on('has_serial_no')} />
            <Check label="Is Subcontracted Item" val={v.is_sub_contracted_item} onChange={on('is_sub_contracted_item')} />
            <Check label="Inspection before Purchase" val={v.inspection_required_before_purchase} onChange={on('inspection_required_before_purchase')} />
            <Check label="Inspection before Delivery" val={v.inspection_required_before_delivery} onChange={on('inspection_required_before_delivery')} />
          </div>
          <TextArea label="Alternatives Note" rows={2} value={v.alternatives_note} onChange={on('alternatives_note')} placeholder="Equivalent products / alternatives…" />
          <Row>
            <Field label="Default BOM" value={v.default_bom} onChange={on('default_bom')} />
            <Field label="Production Capacity" type="number" value={v.production_capacity} onChange={on('production_capacity')} />
          </Row>
          <Field label="Quality Inspection Template" value={v.quality_inspection_template} onChange={on('quality_inspection_template')} />
          <ChildTable title="Alternative Items" rows={v.alternatives} onChange={setChild('alternatives')}
            cols={[{ key: 'alternative_item_code', label: 'Alternative Item Code' }, { key: 'two_way', label: 'Two-way', type: 'check' }]} />
        </div>
      )}
    </Modal>
  )
}

function PricesTab({ itemId, prices, setPrices, stockUom }) {
  const d = useData()
  const [np, setNp] = useState({ price_list: 'Standard Selling', uom: stockUom || 'Nos', price_list_rate: 0, selling: true, customer: '', valid_from: '' })
  const [busy, setBusy] = useState(false)
  if (!itemId) return <p className="text-xs text-muted">Save the item first, then manage its prices (price lists, customer-specific, buying/selling).</p>
  const add = async () => {
    if (!np.price_list || !(Number(np.price_list_rate) > 0)) return alert('Price list + rate are required')
    setBusy(true)
    try {
      const r = await d.addItemPrice(itemId, { price_list: np.price_list, uom: np.uom, price_list_rate: Number(np.price_list_rate), selling: np.selling, buying: !np.selling, customer: np.customer || null, valid_from: np.valid_from || null })
      setPrices([...(prices || []), r]); setNp((s) => ({ ...s, price_list_rate: 0, customer: '' }))
    } catch (e) { alert(e.message) } finally { setBusy(false) }
  }
  const rm = async (id) => { try { await d.deleteItemPrice(id); setPrices((prices || []).filter((x) => x.id !== id)) } catch (e) { alert(e.message) } }
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 p-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Item Prices</p>
        {(prices || []).length === 0 && <p className="px-1 py-1 text-xs text-slate-400">No prices yet.</p>}
        {(prices || []).map((p) => (
          <div key={p.id} className="flex items-center gap-2 border-b border-slate-50 py-1.5 text-sm">
            <span className="flex-1 font-medium text-ink">{p.price_list}</span>
            <span className="text-xs text-slate-500">{p.uom} · {p.selling ? 'Selling' : 'Buying'}{p.customer ? ` · ${p.customer}` : ''}{p.valid_from ? ` · from ${p.valid_from}` : ''}</span>
            <span className="font-semibold">{sar(p.price_list_rate)}</span>
            <button type="button" onClick={() => rm(p.id)} className="text-slate-300 hover:text-rose-500"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <div className="space-y-2 rounded-xl border border-dashed border-slate-300 p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Add Price</p>
        <Row>
          <Field label="Price List" value={np.price_list} onChange={(e) => setNp((s) => ({ ...s, price_list: e.target.value }))} />
          <Field label="Rate" type="number" value={np.price_list_rate} onChange={(e) => setNp((s) => ({ ...s, price_list_rate: e.target.value }))} />
        </Row>
        <Row>
          <Field label="UOM" value={np.uom} onChange={(e) => setNp((s) => ({ ...s, uom: e.target.value }))} />
          <Select label="Type" value={np.selling ? 'Selling' : 'Buying'} onChange={(e) => setNp((s) => ({ ...s, selling: e.target.value === 'Selling' }))} options={['Selling', 'Buying']} />
        </Row>
        <Row>
          <Field label="Customer (optional)" value={np.customer} onChange={(e) => setNp((s) => ({ ...s, customer: e.target.value }))} />
          <Field label="Valid From" type="date" value={np.valid_from} onChange={(e) => setNp((s) => ({ ...s, valid_from: e.target.value }))} />
        </Row>
        <button type="button" onClick={add} disabled={busy} className="btn-primary !py-2">{busy ? 'Adding…' : 'Add Price'}</button>
      </div>
    </div>
  )
}

function VariantGenerator({ item, itemId, onDone }) {
  const d = useData()
  const [busy, setBusy] = useState(false)
  const gen = async () => {
    const attrs = (item.attributes || []).filter((a) => a.attribute && a.attribute_value)
    if (!attrs.length) return alert('Add variant attributes (attribute + value) first.')
    // one variant per attribute-value row (simple, predictable)
    const combinations = attrs.map((a) => ({ attributes: [{ attribute: a.attribute, attribute_value: a.attribute_value }], suffix: a.attribute_value }))
    setBusy(true)
    try { const r = await d.generateVariants(itemId, combinations); alert(`Created variants: ${(r.created || []).join(', ') || 'none'}`); onDone() }
    catch (e) { alert(e.message) } finally { setBusy(false) }
  }
  return <button type="button" onClick={gen} disabled={busy} className="btn-primary !py-2"><Layers size={15} /> {busy ? 'Generating…' : 'Generate Variants'}</button>
}
