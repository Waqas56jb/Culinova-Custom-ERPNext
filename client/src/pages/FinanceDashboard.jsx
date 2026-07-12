import {
  ResponsiveContainer, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { Wallet, TrendingUp, Coins, AlertTriangle } from 'lucide-react'
import { PageHeader, KpiCard, ChartCard, Badge, statusTone } from '../components/ui.jsx'
import { sar } from '../data/mockData.js'
import { monthly, zip, k1000 } from '../data/agg.js'
import { useData } from '../store/DataContext.jsx'

export default function FinanceDashboard() {
  const { invoices, payables, payments } = useData()
  const invoiced = invoices.reduce((s, i) => s + (i.total || 0), 0)
  const collected = invoices.reduce((s, i) => s + (i.paid || 0), 0)
  const receivables = invoiced - collected
  const ap = payables.reduce((s, p) => s + ((p.amount || 0) - (p.paid || 0)), 0)
  const vat = Math.round(invoices.reduce((s, i) => s + ((i.total || 0) - (i.total || 0) / 1.15), 0))
  const income = Math.round(invoices.reduce((s, i) => s + (i.total || 0) / 1.15, 0))
  const expense = payables.reduce((s, p) => s + (p.amount || 0), 0)

  // live monthly trends from real store data
  const revenueExpense = zip(monthly(invoices, { value: 'total' }), monthly(payables, { value: 'amount' }), 'income', 'expense', k1000)
  const cashFlow = zip(monthly(invoices, { value: 'paid' }), monthly(payments || [], { value: 'amount' }), 'inflow', 'outflow', k1000)

  return (
    <>
      <PageHeader title="Finance Dashboard" subtitle="Revenue, collections, payables & profit — ZATCA-compliant" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Invoiced" value={sar(invoiced)} sub="incl. VAT" icon={Wallet} accent="brand" />
        <KpiCard label="Collected" value={sar(collected)} sub="cash received" icon={Coins} accent="emerald" />
        <KpiCard label="Receivables (AR)" value={sar(receivables)} sub="customers owe" icon={AlertTriangle} accent="gold" />
        <KpiCard label="Net Profit" value={sar(income - expense)} sub="income − expense" icon={TrendingUp} accent="violet" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'VAT Collected (15%)', value: sar(vat) },
          { label: 'Net Income', value: sar(income) },
          { label: 'Total Expense', value: sar(expense) },
          { label: 'Payables (AP)', value: sar(ap) },
        ].map((s) => (
          <div key={s.label} className="card card-pad animate-fade-up"><p className="text-xs text-muted">{s.label}</p><p className="mt-1 text-xl font-bold text-ink">{s.value}</p></div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Revenue vs Expense" subtitle="SAR '000 per month">
          <ResponsiveContainer width="100%" height={270}>
            <BarChart data={revenueExpense} margin={{ left: -16, right: 6, top: 6 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
              <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <Tooltip cursor={{ fill: '#f8fafc' }} /><Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="income" name="Income" radius={[6, 6, 0, 0]} barSize={16} fill="#0EA99A" isAnimationActive={false} />
              <Bar dataKey="expense" name="Expense" radius={[6, 6, 0, 0]} barSize={16} fill="#E0A82E" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Cash Flow" subtitle="Inflow vs outflow (SAR '000)">
          <ResponsiveContainer width="100%" height={270}>
            <AreaChart data={cashFlow} margin={{ left: -16, right: 6, top: 6 }}>
              <defs>
                <linearGradient id="cin" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0EA99A" stopOpacity={0.3} /><stop offset="100%" stopColor="#0EA99A" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
              <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="inflow" name="Inflow" stroke="#0EA99A" strokeWidth={2.5} fill="url(#cin)" isAnimationActive={false} />
              <Area type="monotone" dataKey="outflow" name="Outflow" stroke="#E0A82E" strokeWidth={2} strokeDasharray="5 4" fill="none" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Recent Invoices" className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead><tr className="bg-slate-50/60"><th className="th">Invoice</th><th className="th">Customer</th><th className="th">Total</th><th className="th">Balance</th><th className="th">Status</th></tr></thead>
            <tbody>
              {invoices.slice(0, 5).map((i) => (
                <tr key={i.id} className="hover:bg-slate-50/60">
                  <td className="td font-semibold text-brand-600">{i.number || i.id}</td>
                  <td className="td text-ink">{i.customer}</td>
                  <td className="td font-semibold">{sar(i.total)}</td>
                  <td className="td">{i.total - i.paid > 0 ? <span className="font-semibold text-rose-600">{sar(i.total - i.paid)}</span> : '—'}</td>
                  <td className="td"><Badge tone={statusTone(i.status)}>{i.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </>
  )
}
