import { useState } from 'react'
import * as XLSX from 'xlsx'
import { Download, Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Modal } from './Modal.jsx'
import { useData } from '../store/DataContext.jsx'

// Columns the importer understands (must match the backend import mapping).
const COLUMNS = ['product_family', 'brand', 'model', 'category', 'sub_category', 'item_code', 'item_name', 'stock_uom', 'cost', 'selling_price', 'datasheet_url', 'image_url', 'description', 'is_stock_item', 'is_sales_item', 'is_purchase_item']
const SAMPLE = [
  { product_family: '4 Burner Gas Range', brand: 'Fagor', model: 'C-G941', category: 'Equipment', sub_category: 'Cooking Equipment', stock_uom: 'Nos', is_stock_item: true, is_sales_item: true, is_purchase_item: true },
  { product_family: 'Hood', brand: 'Culinova', model: 'HD-2000', category: 'Custom Fabrication', sub_category: 'Hoods', stock_uom: 'Nos', cost: 1500, selling_price: 2800 },
]

export default function ItemImportExport() {
  const d = useData()
  const [modal, setModal] = useState(false)
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState('')

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(SAMPLE, { header: COLUMNS }), 'Items')
    const notes = XLSX.utils.aoa_to_sheet([
      ['CULINOVA — Item Master Import Template'],
      [''],
      ['Required columns: brand, model, product_family  (item_code + item_name auto-generate)'],
      ['Item Name is generated as: "Brand Model Family"'],
      ['If the Brand has a Price List → cost & selling price AUTO-calculate. Leave them blank.'],
      ['If there is NO price list for the brand → enter cost + selling_price manually.'],
      ['category must be: Equipment  OR  Custom Fabrication'],
      ['Booleans (is_stock_item etc.) accept: true / false (default true).'],
      ['⚠ Do NOT rename the header row on the "Items" sheet. Delete the 2 sample rows before importing.'],
    ])
    XLSX.utils.book_append_sheet(wb, notes, 'Instructions')
    XLSX.writeFile(wb, 'culinova-item-master-template.xlsx')
  }

  const exportItems = () => {
    const data = (d.items || []).map((i) => ({
      item_code: i.item_code, item_name: i.item_name, product_family: i.product_family, brand: i.brand, model: i.model,
      category: i.category, sub_category: i.sub_category, stock_uom: i.stock_uom,
      cost: i.cost ?? '', selling_price: i.standard_rate ?? '', gp_percent: i.gp_percent ?? '',
      status: i.disabled ? 'Disabled' : 'Active',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.length ? data : [{ item_code: '' }]), 'Item Master')
    XLSX.writeFile(wb, `culinova-item-master-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const onFile = async (e) => {
    setErr(''); setResult(null); setRows(null)
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    try {
      const wb = XLSX.read(await f.arrayBuffer())
      const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      if (!json.length) return setErr('The first sheet is empty.')
      setRows(json)
    } catch { setErr('Could not read the file. Use the template format (.xlsx or .csv).') }
  }

  const doImport = async () => { if (!rows) return; setBusy(true); try { setResult(await d.importItems(rows)) } catch (e) { setErr(e.message) } finally { setBusy(false) } }
  const close = () => { setModal(false); setRows(null); setResult(null); setErr('') }

  return (
    <>
      <button className="btn-ghost" onClick={downloadTemplate}><FileSpreadsheet size={16} /> Template</button>
      <button className="btn-ghost" onClick={() => setModal(true)}><Upload size={16} /> Import</button>
      <button className="btn-ghost" onClick={exportItems}><Download size={16} /> Export</button>

      <Modal open={modal} onClose={close} title="Import Items (CSV / Excel)" subtitle="Upload the filled template — each row validates individually"
        footer={<><button className="btn-ghost" onClick={close}>Close</button>{rows && !result && <button className="btn-primary" disabled={busy} onClick={doImport}>{busy ? <Loader2 size={16} className="animate-spin" /> : null} Import {rows.length} rows</button>}</>}>
        {!rows && !result && (
          <div className="space-y-3">
            <button onClick={downloadTemplate} className="text-xs font-semibold text-brand-600 hover:underline"><Download size={13} className="mb-0.5 inline" /> Download the template first</button>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-8 text-sm text-slate-500 hover:border-brand-400 hover:text-brand-600">
              <Upload size={28} className="opacity-50" /> Click to choose a .xlsx or .csv file
              <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={onFile} />
            </label>
          </div>
        )}
        {rows && !result && <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600"><b>{rows.length}</b> rows ready to import. Detected columns: {Object.keys(rows[0]).slice(0, 6).join(', ')}…</div>}
        {err && <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{err}</div>}
        {result && (
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1 rounded-xl bg-emerald-50 p-3 text-center"><p className="text-2xl font-extrabold text-emerald-600">{result.created}</p><p className="text-xs text-emerald-700">Imported ✓</p></div>
              <div className="flex-1 rounded-xl bg-rose-50 p-3 text-center"><p className="text-2xl font-extrabold text-rose-600">{result.failed}</p><p className="text-xs text-rose-700">Failed</p></div>
            </div>
            {result.errors?.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200">
                {result.errors.map((er, i) => (<div key={i} className="flex items-start gap-2 border-b border-slate-50 px-3 py-1.5 text-xs"><AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-500" /><span className="text-slate-600">Row {er.row}{er.item ? ` (${er.item})` : ''}: {er.error}</span></div>))}
              </div>
            )}
            {result.created > 0 && <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600"><CheckCircle2 size={13} /> {result.created} items are now in the Item Master.</p>}
          </div>
        )}
      </Modal>
    </>
  )
}
