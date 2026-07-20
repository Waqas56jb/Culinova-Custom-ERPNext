import { useState } from 'react'
import * as XLSX from 'xlsx'
import { Upload, Download, Loader2, CheckCircle2, AlertTriangle, Package } from 'lucide-react'
import { Modal } from './Modal.jsx'
import { api } from '../api.js'

/**
 * Opening Stock import — bring the current warehouse position in before go-live.
 *
 * Two steps on purpose: the file is analysed and shown BEFORE anything is written, because an
 * opening balance is the number every later stock report is measured against. Rows that cannot be
 * resolved are listed rather than guessed — an item that is not in the Item Master is reported, not
 * created.
 *
 * Quantities post through the stock engine (balances + ledger together), and an opening valuation
 * rate also sets items.valuation_rate, which is the cost basis automatic quotation pricing uses.
 */
export default function OpeningStockImport({ open, onClose, onDone }) {
  const [file, setFile] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reset = () => { setFile(null); setAnalysis(null); setResult(null); setError('') }

  const template = () => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ['Item Code', 'Warehouse', 'Opening Quantity', 'Opening Valuation Rate'],
      ['ITM-2026-000001', 'Main Store', 10, 2450],
    ])
    XLSX.utils.book_append_sheet(wb, ws, 'Opening Stock')
    const notes = XLSX.utils.aoa_to_sheet([
      ['Opening Stock import — how it works'],
      [''],
      ['Item Code', 'Must already exist in the Item Master. Item Name also works.'],
      ['Warehouse', 'Must be an existing warehouse. Leave blank to use the default.'],
      ['Opening Quantity', 'Quantity on hand at the cut-over date. Cannot be negative.'],
      ['Opening Valuation Rate', 'Cost per unit. Also becomes the item valuation rate used by quotation pricing.'],
      [''],
      ['Column headings are matched flexibly — "Qty", "Store", "Valuation Rate" all work.'],
      ['Nothing is written until you review the preview and press Import.'],
    ])
    XLSX.utils.book_append_sheet(wb, notes, 'Instructions')
    XLSX.writeFile(wb, 'Culinova-Opening-Stock-Template.xlsx')
  }

  const pick = async (f) => {
    if (!f) return
    reset()
    setFile(f)
    setBusy(true)
    try {
      const wb = XLSX.read(await f.arrayBuffer())
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false })
      if (grid.length < 2) throw new Error('The sheet has no data rows.')
      const [headers, ...rows] = grid
      setAnalysis(await api('/inventory/opening-stock/preview', { method: 'POST', body: { headers, rows } }))
    } catch (e) {
      setError(e.message || 'Could not read that file.')
    } finally {
      setBusy(false)
    }
  }

  const commit = async () => {
    if (!analysis?.ready) return
    setBusy(true)
    setError('')
    try {
      const lines = analysis.lines.filter((l) => l.ok)
      setResult(await api('/inventory/opening-stock/commit', { method: 'POST', body: { lines } }))
      await onDone?.()
    } catch (e) {
      setError(e.message || 'The import failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose() }}
      size="xl"
      title="Import Opening Stock"
      subtitle="Item · Warehouse · Quantity · Opening Valuation Rate"
      footer={
        result ? (
          <button className="btn-primary" onClick={() => { reset(); onClose() }}>Done</button>
        ) : (
          <>
            <button className="btn-ghost" onClick={() => { reset(); onClose() }}>Cancel</button>
            <button className="btn-primary" onClick={commit} disabled={busy || !analysis?.ready}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Package size={15} />}
              {analysis ? ` Import ${analysis.ready} row${analysis.ready === 1 ? '' : 's'}` : ' Import'}
            </button>
          </>
        )
      }
    >
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{error}</p>}

      {!analysis && !result && (
        <>
          <div className="flex items-center justify-between rounded-xl border border-brand-100 bg-brand-50/40 p-3">
            <div>
              <p className="text-sm font-semibold text-ink">Use the template</p>
              <p className="text-xs text-muted">Your own column names work too — headings are matched flexibly.</p>
            </div>
            <button className="btn-ghost" onClick={template}><Download size={15} /> Template</button>
          </div>

          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 p-8 text-center hover:border-brand-300 hover:bg-brand-50/20">
            <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => pick(e.target.files?.[0])} />
            <Upload size={22} className="text-brand-500" />
            <span className="text-sm font-semibold text-ink">{file ? file.name : 'Choose your opening stock file'}</span>
            <span className="text-xs text-muted">Nothing is written until you review the preview</span>
          </label>

          {busy && <p className="flex items-center gap-2 text-sm text-muted"><Loader2 size={15} className="animate-spin" /> Reading the file…</p>}
        </>
      )}

      {analysis && !result && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Rows" value={analysis.total} tone="text-ink" />
            <Stat label="Ready" value={analysis.ready} tone="text-emerald-600" />
            <Stat label="Blocked" value={analysis.blocked} tone={analysis.blocked ? 'text-rose-600' : 'text-slate-400'} />
          </div>

          <p className="text-xs text-muted">
            Columns matched: {Object.entries(analysis.plan).map(([k, v]) => `${k} → "${v}"`).join('  ·  ')}
          </p>

          <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="th">Row</th><th className="th">Item</th><th className="th">Warehouse</th>
                  <th className="th text-right">Qty</th><th className="th text-right">Rate</th><th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {analysis.lines.map((l) => (
                  <tr key={l.row} className={l.ok ? '' : 'bg-rose-50/50'}>
                    <td className="td text-slate-400">{l.row}</td>
                    <td className="td">
                      <span className="font-medium text-ink">{l.item_name || l.item}</span>
                      {l.item_code && <span className="block text-[10px] text-slate-400">{l.item_code}</span>}
                    </td>
                    <td className="td text-slate-500">{l.warehouse || '— default —'}</td>
                    <td className="td text-right font-semibold">{l.qty ?? '—'}</td>
                    <td className="td text-right">{l.rate ?? '—'}</td>
                    <td className="td">
                      {l.ok
                        ? <span className="inline-flex items-center gap-1 font-semibold text-emerald-600"><CheckCircle2 size={12} /> Ready</span>
                        : <span className="inline-flex items-start gap-1 text-rose-600"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {l.problems.join('; ')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {analysis.blocked > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {analysis.blocked} row(s) will be skipped. Fix them in the file and upload again — they are
              reported rather than guessed, so nothing is created that you did not define.
            </p>
          )}
        </>
      )}

      {result && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Posted to stock" value={result.posted} tone="text-emerald-600" />
            <Stat label="Valuation rates set" value={result.rate_updated} tone="text-brand-600" />
            <Stat label="Failed" value={result.errors.length} tone={result.errors.length ? 'text-rose-600' : 'text-slate-400'} />
          </div>
          {result.errors.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-xs text-rose-700">
              {result.errors.slice(0, 8).map((e, i) => <p key={i}>Row {e.row}: {e.error}</p>)}
            </div>
          )}
          <p className="text-xs text-muted">
            Quantities were posted through the stock engine, so the balance and the stock ledger agree.
            Valuation rates are now available to automatic quotation pricing.
          </p>
        </div>
      )}
    </Modal>
  )
}

function Stat({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-0.5 text-2xl font-extrabold ${tone}`}>{value}</p>
    </div>
  )
}
