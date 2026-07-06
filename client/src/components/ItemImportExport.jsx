import { useState } from 'react'
import * as XLSX from 'xlsx'
import { Download, Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Modal } from './Modal.jsx'
import { useData } from '../store/DataContext.jsx'

// Friendly, human-readable column order for the template + export.
// These headers are understood by the backend importer (it also accepts a full ERPNext export).
const TEMPLATE_COLUMNS = [
  'Item Code', 'Item Name', 'Item Group', 'Sub Item Group', 'Product Family', 'Brand', 'Model No.',
  'Default Unit of Measure', 'Dimensions', 'Power Type', 'Product Type', 'Country of Origin',
  'Currency', 'Supplier Net Price', 'Exchange Factor', 'Price Factor', 'Add Margin %', 'Special Offer %',
  'Landed Cost', 'Selling Price',
  'Description', 'Image', 'Specs Sheet', 'Warranty Period (in days)', 'Max Discount (%)', 'Alternatives Note',
  'Company (Item Defaults)', 'Default Warehouse (Item Defaults)', 'Default Income Account (Item Defaults)',
  'Stock Item', 'SN Control', 'Show Room', 'Local Purchasing', 'Allow Sales', 'Allow Purchase', 'Status',
]
const SAMPLE = [
  { // AUTO-PRICED: give Supplier Net Price + factors → landed/selling auto-calculate
    'Item Code': '', 'Item Name': '6 Open Burner Gas Range', 'Item Group': 'Cooking', 'Sub Item Group': 'Ranges', 'Product Family': 'Open Burner',
    'Brand': 'MBM', 'Model No.': 'OB-6', 'Default Unit of Measure': 'Nos', 'Dimensions': '1200x900x850 mm', 'Power Type': 'Gas', 'Product Type': 'Item', 'Country of Origin': 'Italy',
    'Currency': 'EUR', 'Supplier Net Price': 1000, 'Exchange Factor': 5, 'Price Factor': 1.75, 'Add Margin %': 3, 'Special Offer %': 0,
    'Landed Cost': '', 'Selling Price': '', 'Description': 'Heavy-duty 6 burner gas range', 'Image': '', 'Specs Sheet': '', 'Warranty Period (in days)': 365, 'Max Discount (%)': 10, 'Alternatives Note': '',
    'Company (Item Defaults)': 'Culinova', 'Default Warehouse (Item Defaults)': 'Stores - CUL', 'Default Income Account (Item Defaults)': '410101 - Sales',
    'Stock Item': 'Yes', 'SN Control': 'No', 'Show Room': 'No', 'Local Purchasing': 'No', 'Allow Sales': 'Yes', 'Allow Purchase': 'Yes', 'Status': 'Able',
  },
  { // MANUAL: no supplier price → type Landed Cost + Selling Price directly (custom fabrication)
    'Item Code': '', 'Item Name': 'Stainless Steel Work Table 1800mm', 'Item Group': 'Custom Fabrication', 'Sub Item Group': '', 'Product Family': 'Work Table',
    'Brand': 'Culinova', 'Model No.': 'WT-1800', 'Default Unit of Measure': 'Nos', 'Dimensions': '1800x700x850 mm', 'Power Type': 'Neutral', 'Product Type': 'Item', 'Country of Origin': 'Saudi Arabia',
    'Currency': 'SAR', 'Supplier Net Price': '', 'Exchange Factor': '', 'Price Factor': '', 'Add Margin %': '', 'Special Offer %': '',
    'Landed Cost': 900, 'Selling Price': 1500, 'Description': 'Custom SS 304 work table', 'Image': '', 'Specs Sheet': '', 'Warranty Period (in days)': 365, 'Max Discount (%)': 15, 'Alternatives Note': '',
    'Company (Item Defaults)': 'Culinova', 'Default Warehouse (Item Defaults)': 'Stores - CUL', 'Default Income Account (Item Defaults)': '410101 - Sales',
    'Stock Item': 'Yes', 'SN Control': 'No', 'Show Room': 'Yes', 'Local Purchasing': 'Yes', 'Allow Sales': 'Yes', 'Allow Purchase': 'Yes', 'Status': 'Able',
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
      ['Item Group', 'Top category, e.g. Cooking / Refrigeration / Custom Fabrication / Walk-ins.'],
      ['Sub Item Group', 'Sub-type, e.g. Ranges, Fryers, Cold Room.'],
      ['Product Family', 'Exact product type used to compare alternatives, e.g. Open Burner, Gas Fryer, Combi Oven. Created automatically on import.'],
      ['Brand', 'Manufacturer / brand, e.g. MBM, OZTI, Culinova.'],
      ['Model No.', 'Supplier model number, e.g. OB-6, C-G941.'],
      ['Default Unit of Measure', 'Usually "Nos".'],
      ['Dimensions', 'Physical size, e.g. 1200x900x850 mm.'],
      ['Power Type', 'Gas / Electric / Neutral / Steam.'],
      ['Product Type', 'Item (physical) or Service.'],
      ['Country of Origin', 'Where it is manufactured, e.g. Italy, Turkey, Saudi Arabia.'],
      ['', ''],
      ['PRICING — two ways:'],
      ['(A) AUTO', 'Fill Currency + Supplier Net Price + Exchange Factor + Price Factor + Add Margin %.'],
      ['   ', 'System computes:  Supplier × Exchange = Landed Cost  →  × Price Factor  →  × (1 + Add Margin %) = Selling Price.'],
      ['(B) MANUAL', 'Leave the factors blank and just type Landed Cost + Selling Price directly.'],
      ['Special Offer %', 'Optional promotional discount on the selling price.'],
      ['(cost / factors)', 'Hidden later from Sales & Engineering — only Management / Finance see them.'],
      ['', ''],
      ['Description / Image / Specs Sheet', 'Text · image URL · datasheet PDF URL (optional).'],
      ['Alternatives Note', 'Free note about equivalent products.'],
      ['Warranty Period (in days) / Max Discount (%)', 'e.g. 365 · 10.'],
      ['Company / Warehouse / Income Account', 'Accounting defaults (optional).'],
      ['Stock Item / SN Control / Show Room / Local Purchasing / Allow Sales / Allow Purchase', 'Use Yes / No.'],
      ['Status', 'Able (active) or Disable (inactive).'],
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
      'Item Code': i.item_code, 'Item Name': i.item_name, 'Item Group': i.category || i.item_group, 'Sub Item Group': i.sub_category, 'Product Family': i.product_family,
      'Brand': i.brand, 'Model No.': i.model, 'Default Unit of Measure': i.stock_uom, 'Dimensions': i.dimensions || '', 'Power Type': i.power_type || '', 'Product Type': i.product_type || '', 'Country of Origin': i.country_of_origin || '',
      'Currency': i.currency || '', 'Supplier Net Price': i.supplier_price ?? '', 'Landed Cost': i.cost ?? '', 'Add Margin %': i.add_margin_pct ?? '', 'Selling Price': i.standard_rate ?? '', 'GP %': i.gp_percent ?? '',
      'Alternatives Note': i.alternatives_note || '', 'Show Room': i.show_room ? 'Yes' : 'No', 'Status': i.disabled ? 'Disabled' : 'Active',
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
