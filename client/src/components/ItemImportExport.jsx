import { useState } from 'react'
import * as XLSX from 'xlsx'
import { Download, Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Modal } from './Modal.jsx'
import { useData } from '../store/DataContext.jsx'

// Friendly, human-readable column order for the template + export.
// These headers are understood by the backend importer (it also accepts a full ERPNext export).
const TEMPLATE_COLUMNS = [
  'Item Code', 'Item Name', 'Item Group', 'Sub Item Group', 'Brand',
  'Default Unit of Measure', 'Description', 'Image', 'Specs Sheet',
  'Landed Cost', 'Selling Price', 'Country of Origin', 'Warranty Period (in days)', 'Max Discount (%)',
  'Company (Item Defaults)', 'Default Warehouse (Item Defaults)', 'Default Income Account (Item Defaults)',
  'Maintain Stock', 'Allow Sales', 'Allow Purchase', 'Disabled',
]
const SAMPLE = [
  {
    'Item Code': 'MFRG74A', 'Item Name': 'Free Standing Gas Fryer on Closed Stand', 'Item Group': 'Cooking Equipment',
    'Sub Item Group': 'Fryers', 'Brand': 'MBM', 'Default Unit of Measure': 'Nos',
    'Description': 'Single tank gas fryer, 14 Litre, Italy made', 'Image': '', 'Specs Sheet': '',
    'Landed Cost': 7709.9, 'Selling Price': 13492, 'Country of Origin': 'Italy', 'Warranty Period (in days)': 365, 'Max Discount (%)': 10,
    'Company (Item Defaults)': 'Culinova', 'Default Warehouse (Item Defaults)': 'Stores - CUL', 'Default Income Account (Item Defaults)': '410101 - Sales',
    'Maintain Stock': 1, 'Allow Sales': 1, 'Allow Purchase': 1, 'Disabled': 0,
  },
  {
    'Item Code': '', 'Item Name': 'Stainless Steel Work Table 1800mm', 'Item Group': 'Custom Fabrication',
    'Sub Item Group': '', 'Brand': 'Culinova', 'Default Unit of Measure': 'Nos',
    'Description': 'Custom SS 304 work table', 'Image': '', 'Specs Sheet': '',
    'Landed Cost': 900, 'Selling Price': 1500, 'Country of Origin': 'Saudi Arabia', 'Warranty Period (in days)': 365, 'Max Discount (%)': 15,
    'Company (Item Defaults)': 'Culinova', 'Default Warehouse (Item Defaults)': 'Stores - CUL', 'Default Income Account (Item Defaults)': '410101 - Sales',
    'Maintain Stock': 1, 'Allow Sales': 1, 'Allow Purchase': 1, 'Disabled': 0,
  },
]

export default function ItemImportExport() {
  const d = useData()
  const [modal, setModal] = useState(false)
  const [rows, setRows] = useState(null)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState('')

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(SAMPLE, { header: TEMPLATE_COLUMNS })
    ws['!cols'] = TEMPLATE_COLUMNS.map((c) => ({ wch: Math.max(14, c.length + 2) }))
    XLSX.utils.book_append_sheet(wb, ws, 'Items')
    const notes = XLSX.utils.aoa_to_sheet([
      ['CULINOVA — ITEM MASTER IMPORT TEMPLATE'],
      [''],
      ['HOW TO USE'],
      ['1) Open the "Items" sheet. Put ONE product per row. Keep the header row exactly as it is.'],
      ['2) Delete the 2 example rows, then type / paste your own products.'],
      ['3) Save the file (Excel .xlsx or .csv).'],
      ['4) In the app:  Item Master  →  Import  →  choose this file  →  Import.'],
      [''],
      ['COLUMN GUIDE'],
      ['Item Code', 'Optional — leave blank and the system creates a code automatically.'],
      ['Item Name', 'REQUIRED — the product name, e.g. "6 Burner Gas Range".'],
      ['Item Group', 'Category, e.g. Cooking Equipment / Custom Fabrication / Refrigeration / Walk-ins.'],
      ['Sub Item Group', 'Optional sub-type, e.g. Fryers, Cold Room.'],
      ['Brand', 'Manufacturer / brand, e.g. MBM, OZTI, Culinova.'],
      ['Default Unit of Measure', 'Usually "Nos".'],
      ['Description', 'Product description (plain text).'],
      ['Image', 'Optional image URL (leave blank if none).'],
      ['Specs Sheet', 'Optional datasheet PDF URL.'],
      ['Landed Cost', 'Cost price in SAR. Hidden later from Sales/Engineering.'],
      ['Selling Price', 'Selling price in SAR.'],
      ['Country of Origin', 'e.g. Italy, Turkey, Saudi Arabia.'],
      ['Warranty Period (in days)', 'e.g. 365.'],
      ['Max Discount (%)', 'Maximum discount allowed for this item.'],
      ['Company / Warehouse / Income Account', 'Accounting defaults (optional).'],
      ['Maintain Stock / Allow Sales / Allow Purchase / Disabled', 'Use 1 for Yes, 0 for No.'],
      [''],
      ['IMPORTANT'],
      ['• Each row is checked separately. A wrong row is skipped and shown with the reason + row number.'],
      ['• Duplicate items (same Brand + Model) are blocked automatically.'],
      ['• You can EXPORT the whole Item Master to Excel anytime from the same screen.'],
      ['• A full ERPNext export file also works here — extra columns are ignored safely.'],
    ])
    notes['!cols'] = [{ wch: 34 }, { wch: 80 }]
    XLSX.utils.book_append_sheet(wb, notes, 'Instructions')
    XLSX.writeFile(wb, 'Culinova-Item-Master-Template.xlsx')
  }

  const exportItems = () => {
    const data = (d.items || []).map((i) => ({
      'Item Code': i.item_code, 'Item Name': i.item_name, 'Item Group': i.category || i.item_group, 'Sub Item Group': i.sub_category,
      'Brand': i.brand, 'Model': i.model, 'Product Family': i.product_family, 'Default Unit of Measure': i.stock_uom,
      'Landed Cost': i.cost ?? '', 'Selling Price': i.standard_rate ?? '', 'GP %': i.gp_percent ?? '',
      'Country of Origin': i.country_of_origin || '', 'Status': i.disabled ? 'Disabled' : 'Active',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.length ? data : [{ 'Item Code': '' }]), 'Item Master')
    XLSX.writeFile(wb, `Culinova-Item-Master-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const onFile = async (e) => {
    setErr(''); setResult(null); setRows(null)
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setFileName(f.name)
    try {
      const wb = XLSX.read(await f.arrayBuffer())
      const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      if (!json.length) return setErr('The first sheet is empty.')
      setRows(json)
    } catch { setErr('Could not read the file. Please use an .xlsx or .csv file (see the template).') }
  }

  const doImport = async () => { if (!rows) return; setBusy(true); try { setResult(await d.importItems(rows)) } catch (e) { setErr(e.message) } finally { setBusy(false) } }
  const close = () => { setModal(false); setRows(null); setFileName(''); setResult(null); setErr('') }

  return (
    <>
      <button className="btn-ghost" title="Download the Excel template" onClick={downloadTemplate}><FileSpreadsheet size={16} /> Template</button>
      <button className="btn-ghost" title="Upload a CSV / Excel file" onClick={() => setModal(true)}><Upload size={16} /> Import</button>
      <button className="btn-ghost" title="Export the Item Master to Excel" onClick={exportItems}><Download size={16} /> Export</button>

      <Modal open={modal} onClose={close} title="Import Items from CSV / Excel" subtitle="Fill the template, upload it here — each row is validated before saving"
        footer={<><button className="btn-ghost" onClick={close}>Close</button>{rows && !result && <button className="btn-primary" disabled={busy} onClick={doImport}>{busy ? <Loader2 size={16} className="animate-spin" /> : null} Import {rows.length} rows</button>}</>}>
        {!rows && !result && (
          <div className="space-y-3">
            <div className="rounded-xl bg-brand-50/60 px-4 py-3 text-xs text-brand-700">
              <b>Step 1:</b> download the template &nbsp;·&nbsp; <b>Step 2:</b> fill your products &nbsp;·&nbsp; <b>Step 3:</b> upload it below.
            </div>
            <button onClick={downloadTemplate} className="text-xs font-semibold text-brand-600 hover:underline"><Download size={13} className="mb-0.5 inline" /> Download the Excel template first</button>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-8 text-sm text-slate-500 hover:border-brand-400 hover:text-brand-600">
              <Upload size={28} className="opacity-50" /> Click to choose a .xlsx or .csv file
              <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={onFile} />
            </label>
          </div>
        )}
        {rows && !result && (
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <b>{fileName}</b> — <b>{rows.length}</b> rows ready to import.<br />
            <span className="text-xs text-muted">Detected columns: {Object.keys(rows[0]).slice(0, 8).join(', ')}{Object.keys(rows[0]).length > 8 ? ` … (+${Object.keys(rows[0]).length - 8} more)` : ''}</span>
          </div>
        )}
        {err && <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{err}</div>}
        {result && (
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1 rounded-xl bg-emerald-50 p-3 text-center"><p className="text-2xl font-extrabold text-emerald-600">{result.created}</p><p className="text-xs text-emerald-700">Imported ✓</p></div>
              <div className="flex-1 rounded-xl bg-rose-50 p-3 text-center"><p className="text-2xl font-extrabold text-rose-600">{result.failed}</p><p className="text-xs text-rose-700">Failed / skipped</p></div>
            </div>
            {result.errors?.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200">
                {result.errors.map((er, i) => (<div key={i} className="flex items-start gap-2 border-b border-slate-50 px-3 py-1.5 text-xs"><AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-500" /><span className="text-slate-600">Row {er.row}{er.item ? ` (${er.item})` : ''}: {er.error}</span></div>))}
              </div>
            )}
            {result.created > 0 && <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600"><CheckCircle2 size={13} /> {result.created} items are now saved in the Item Master.</p>}
          </div>
        )}
      </Modal>
    </>
  )
}
