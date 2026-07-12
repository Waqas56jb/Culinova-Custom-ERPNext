import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { PageHeader, ChartCard } from '../components/ui.jsx'
import { sar } from '../data/mockData.js'
import { monthly, zip, k1000 } from '../data/agg.js'
import { useData } from '../store/DataContext.jsx'

export default function FinancialReports() {
  const { invoices, payables, settings } = useData()
  // VAT rate resolved from Company Settings (never hardcoded); null when not configured
  const vatPct = (() => {
    const rows = settings?.vatSettings || []
    const def = rows.find((v) => v.is_default && v.is_active) || rows.find((v) => v.is_active) || rows[0]
    const r = Number(def?.rate)
    return r > 0 ? r / 100 : null
  })()
  const vatRateLabel = vatPct != null ? `${Math.round(vatPct * 100)}%` : null
  // prefer each invoice's stored VAT/net split; fall back to the configured rate only when absent
  const invVat = (i) => { const v = Number(i.vat_amount); if (v > 0) return v; return vatPct != null ? (i.total || 0) - (i.total || 0) / (1 + vatPct) : 0 }
  const invNet = (i) => { const n = Number(i.net_amount); if (n > 0) return n; return vatPct != null ? (i.total || 0) / (1 + vatPct) : (i.total || 0) }

  const revenueExpense = zip(monthly(invoices, { value: 'total' }), monthly(payables, { value: 'amount' }), 'income', 'expense', k1000)
  const income = Math.round(invoices.reduce((s, i) => s + invNet(i), 0))
  const vatOut = Math.round(invoices.reduce((s, i) => s + invVat(i), 0))
  const expense = payables.reduce((s, p) => s + (p.amount || 0), 0)
  const grossProfit = income - expense
  const collected = invoices.reduce((s, i) => s + (i.paid || 0), 0)
  const paidOut = payables.reduce((s, p) => s + (p.paid || 0), 0)

  // Operating expenses are not tracked as real data yet — shown honestly as unavailable rather than a fabricated % of revenue.
  const PL = [
    { k: 'Revenue (Net of VAT)', v: income, bold: true },
    { k: 'Cost of Goods / Procurement', v: -expense },
    { k: 'Gross Profit', v: grossProfit, bold: true, hl: true },
    { k: 'Operating Expenses', text: 'not tracked yet' },
    { k: 'Net Profit (excl. OpEx)', v: grossProfit, bold: true, hl: true },
  ]
  const CF = [
    { k: 'Cash Inflow (collections)', v: collected },
    { k: 'Cash Outflow (supplier payments)', v: -paidOut },
    { k: 'Net Cash Flow', v: collected - paidOut, bold: true, hl: true },
  ]

  return (
    <>
      <PageHeader title="Financial Reports" subtitle="Profit &amp; Loss · Cash Flow · VAT summary" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Statement title="Profit & Loss" rows={PL} />
        <div className="space-y-4">
          <Statement title="Cash Flow" rows={CF} />
          <div className="card card-pad">
            <h3 className="mb-3 font-bold text-ink">VAT Summary (ZATCA)</h3>
            <Line k={`Output VAT (collected${vatRateLabel ? `, ${vatRateLabel}` : ''})`} v={vatOut} />
            <Line k="Input VAT (on purchases)" text="not tracked yet" />
            <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 font-bold text-ink"><span>VAT Payable (output only)</span><span>{sar(vatOut)}</span></div>
          </div>
        </div>
      </div>

      <ChartCard title="Revenue vs Expense Trend" subtitle="SAR '000 per month" className="mt-4">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={revenueExpense} margin={{ left: -16, right: 6, top: 6 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
            <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
            <Tooltip cursor={{ fill: '#f8fafc' }} /><Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="income" name="Income" radius={[6, 6, 0, 0]} barSize={18} fill="#0EA99A" isAnimationActive={false} />
            <Bar dataKey="expense" name="Expense" radius={[6, 6, 0, 0]} barSize={18} fill="#E0A82E" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </>
  )
}

function Statement({ title, rows }) {
  return (
    <div className="card card-pad">
      <h3 className="mb-3 font-bold text-ink">{title}</h3>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.k} className={`flex justify-between px-2 py-2 text-sm ${r.hl ? 'rounded-lg bg-brand-50' : ''} ${r.bold ? 'font-bold text-ink' : 'text-slate-600'}`}>
            <span>{r.k}</span>
            {r.text != null
              ? <span className="italic text-muted">{r.text}</span>
              : <span className={r.v < 0 ? 'text-rose-600' : r.hl ? 'text-brand-700' : ''}>{r.v < 0 ? `(${sar(-r.v)})` : sar(r.v)}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

function Line({ k, v, text }) {
  return <div className="flex justify-between py-1 text-sm text-slate-600"><span>{k}</span>{text != null ? <span className="italic text-muted">{text}</span> : <span>{sar(v)}</span>}</div>
}
