import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { PageHeader, ChartCard } from '../components/ui.jsx'
import { sar } from '../data/mockData.js'
import { revenueExpense } from '../data/financeData.js'
import { useData } from '../store/DataContext.jsx'

export default function FinancialReports() {
  const { invoices, payables } = useData()
  const income = Math.round(invoices.reduce((s, i) => s + i.total / 1.15, 0))
  const vatOut = Math.round(invoices.reduce((s, i) => s + (i.total - i.total / 1.15), 0))
  const expense = payables.reduce((s, p) => s + p.amount, 0)
  const grossProfit = income - expense
  const collected = invoices.reduce((s, i) => s + i.paid, 0)
  const paidOut = payables.reduce((s, p) => s + p.paid, 0)

  const PL = [
    { k: 'Revenue (Net of VAT)', v: income, bold: true },
    { k: 'Cost of Goods / Procurement', v: -expense },
    { k: 'Gross Profit', v: grossProfit, bold: true, hl: true },
    { k: 'Operating Expenses (est.)', v: -Math.round(income * 0.08) },
    { k: 'Net Profit', v: grossProfit - Math.round(income * 0.08), bold: true, hl: true },
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
            <Line k="Output VAT (collected, 15%)" v={vatOut} />
            <Line k="Input VAT (on purchases)" v={Math.round(expense - expense / 1.15)} />
            <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 font-bold text-ink"><span>Net VAT Payable</span><span>{sar(vatOut - Math.round(expense - expense / 1.15))}</span></div>
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
            <span className={r.v < 0 ? 'text-rose-600' : r.hl ? 'text-brand-700' : ''}>{r.v < 0 ? `(${sar(-r.v)})` : sar(r.v)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Line({ k, v }) {
  return <div className="flex justify-between py-1 text-sm text-slate-600"><span>{k}</span><span>{sar(v)}</span></div>
}
