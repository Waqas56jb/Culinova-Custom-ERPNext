import { useState, useEffect, useCallback } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie, AreaChart, Area,
} from 'recharts'
import {
  Sparkles, Tags, Coins, Percent, Truck, PackageSearch, Info, Save, RefreshCw,
  TrendingUp, TrendingDown, Building2, AlertTriangle, Bot, CheckCircle2,
} from 'lucide-react'
import { PageHeader, KpiCard, ChartCard, Badge } from '../components/ui.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

// Roles allowed to see cost / margin / supplier-price (mirrors server rbac/permissions.financialRoles).
// The server already redacts for anyone else — this only decides whether to render the money columns
// at all, so a redacted (undefined) value never shows as "NaN".
const FINANCIAL_ROLES = ['Management', 'System Admin', 'Accounts User', 'Purchase User', 'Stock User', 'Project Manager']
const WRITE_LEVELS = ['Create', 'Edit', 'Approval', 'Full Admin']

const PALETTE = ['#0EA99A', '#6366f1', '#E0A82E', '#3b82f6', '#8b5cf6', '#14b8a6', '#f43f5e']
const n = (v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v))
const money = (v) => (n(v) == null ? '—' : sar(v))
const pct = (v) => (n(v) == null ? '—' : `${n(v)}%`)
const gpTone = (v) => (n(v) == null ? 'text-muted' : n(v) >= 0 ? 'text-emerald-600' : 'text-rose-600')

const TABS = [
  { key: 'pricing-suggestions', label: 'Pricing', icon: Tags },
  { key: 'cost-optimization', label: 'Cost Optimization', icon: Coins },
  { key: 'margin-analysis', label: 'Margins', icon: Percent },
  { key: 'supplier-recommendations', label: 'Suppliers', icon: Building2 },
  { key: 'purchasing-insights', label: 'Purchasing', icon: Truck },
]

export default function AIInsights() {
  const d = useData()
  const { user } = useAuth()
  const canFinance = FINANCIAL_ROLES.includes(user?.role)
  const canSave = WRITE_LEVELS.includes(user?.access_level)

  const [tab, setTab] = useState('pricing-suggestions')
  const [data, setData] = useState({})       // kind -> insight payload
  const [feed, setFeed] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setErr('')
    try {
      const results = await Promise.all(TABS.map((t) => d.resList(`ai/${t.key}`).catch((e) => ({ error: e.message, kind: t.key }))))
      const map = {}
      results.forEach((r, i) => { map[TABS[i].key] = r })
      setData(map)
    } catch (e) { setErr(e.message) } finally { setLoading(false) }
    try { setFeed(await d.resList('ai/insights')) } catch { /* feed optional */ }
  }, [d])

  useEffect(() => { load() }, [load])

  const active = data[tab]
  // the LLM flag is consistent across endpoints; derive it from whichever payload we have
  const anyPayload = Object.values(data).find((x) => x && typeof x.llm === 'boolean')
  const llmOn = anyPayload ? anyPayload.llm : false
  const llmNote = anyPayload?.note || null

  const saveInsight = async (payload) => {
    if (!payload) return
    const body = {
      kind: payload.kind,
      scope: 'portfolio',
      title: payload.title || payload.kind,
      body: payload.narrative || 'Statistical insight (no narrative — LLM not configured).',
      data: payload.stats || {},
      confidence: payload.llm ? 0.8 : null,
      model: payload.model || null,
    }
    try { await d.resAdd('ai/insights', body); setFeed(await d.resList('ai/insights')) } catch (e) { setErr(e.message) }
  }

  return (
    <>
      <PageHeader title="AI Business Intelligence" subtitle="Live analytics computed from your data · pricing · cost · margins · suppliers · purchasing">
        <button className="btn-ghost" onClick={load}><RefreshCw size={16} /> Refresh</button>
      </PageHeader>

      {/* LLM status banner — honest about whether narratives are on */}
      <div className={`mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${llmOn ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
        {llmOn ? <Bot size={18} className="mt-0.5 shrink-0" /> : <Info size={18} className="mt-0.5 shrink-0" />}
        <div>
          <p className="font-semibold">{llmOn ? 'AI narratives are on' : 'AI narratives are off — statistics are live'}</p>
          <p className="text-xs opacity-90">
            {llmOn
              ? 'Every table and chart is computed from your database; an LLM turns the numbers into a written recommendation.'
              : (llmNote || 'No LLM key is configured. All tables and charts below are computed live from your database; only the written narrative is disabled. Add an OPENAI_API_KEY on the server to enable it.')}
          </p>
        </div>
      </div>

      {err && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700">{err}</div>}

      {/* tabs */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${tab === key ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid min-h-[40vh] place-items-center text-sm text-muted">Computing insights from live data…</div>
      ) : active?.error ? (
        <div className="card card-pad text-sm text-rose-600">Could not load this insight: {active.error}</div>
      ) : (
        <>
          {/* narrative + save */}
          <NarrativeCard payload={active} llmOn={llmOn} canSave={canSave} onSave={() => saveInsight(active)} />

          {tab === 'pricing-suggestions' && <PricingTab p={active} canFinance={canFinance} />}
          {tab === 'cost-optimization' && <CostTab p={active} canFinance={canFinance} />}
          {tab === 'margin-analysis' && <MarginTab p={active} canFinance={canFinance} />}
          {tab === 'supplier-recommendations' && <SupplierTab p={active} canFinance={canFinance} />}
          {tab === 'purchasing-insights' && <PurchasingTab p={active} canFinance={canFinance} />}
        </>
      )}

      <SavedFeed feed={feed} />
    </>
  )
}

// ── shared pieces ─────────────────────────────────────────────────────────────
function NarrativeCard({ payload, llmOn, canSave, onSave }) {
  if (!payload) return null
  return (
    <div className="card card-pad mb-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 text-white shadow-soft"><Sparkles size={18} /></div>
          <div>
            <h3 className="text-[15px] font-bold text-ink">{payload.title}</h3>
            {payload.narrative
              ? <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">{payload.narrative}</p>
              : <p className="mt-1 text-xs text-muted">{llmOn ? (payload.note || 'No narrative available.') : 'Written recommendation is off — the analytics below are live.'}</p>}
          </div>
        </div>
        {canSave && (
          <button className="btn-ghost shrink-0" onClick={onSave} title="Save this insight to the feed"><Save size={15} /> Save</button>
        )}
      </div>
    </div>
  )
}

function Empty({ icon: Icon = Info, children }) {
  return (
    <div className="grid place-items-center px-5 py-12 text-center text-sm text-muted">
      <div><Icon className="mx-auto mb-2 text-slate-300" /> {children}</div>
    </div>
  )
}

function Panel({ title, subtitle, children, right, className = '' }) {
  return (
    <div className={`card overflow-hidden ${className}`}>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h3 className="text-[15px] font-bold text-ink">{title}</h3>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

const reasonBadge = (r) => (r === 'no_price' ? <Badge tone="amber">No price</Badge> : <Badge tone="blue">Below family GP</Badge>)

// ── PRICING ───────────────────────────────────────────────────────────────────
function PricingTab({ p, canFinance }) {
  const s = p?.stats || {}
  const rows = p?.rows || []
  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Items" value={s.total_items ?? 0} sub="in catalog" icon={PackageSearch} accent="brand" />
        <KpiCard label="Flagged" value={s.flagged ?? 0} sub="need attention" icon={AlertTriangle} accent="gold" />
        <KpiCard label="Actionable" value={s.actionable ?? 0} sub="price can be suggested" icon={CheckCircle2} accent="emerald" />
        <KpiCard label="No Price" value={s.no_price ?? 0} sub="unpriced items" icon={Tags} accent="violet" />
        {canFinance && <KpiCard label="Median Markup" value={s.portfolio_median_markup != null ? `${s.portfolio_median_markup}×` : '—'} sub="portfolio" icon={Percent} accent="brand" />}
      </div>

      <Panel className="mt-5" title="Pricing Suggestions" subtitle="Suggested price = landed cost × the family's median markup (real median). No numbers are invented.">
        {rows.length === 0 ? (
          <Empty icon={Tags}>No pricing gaps found — every item is priced at or above its family's average GP.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/60">
                  <th className="th">Item</th><th className="th">Family</th><th className="th">Reason</th>
                  {canFinance && <><th className="th text-right">Current</th><th className="th text-right">Suggested</th><th className="th text-right">Δ</th><th className="th text-right">GP %</th></>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.item_id} className="border-t border-slate-100 hover:bg-slate-50/70">
                    <td className="td font-medium text-ink">{r.item_name || '—'}{r.item_code && <span className="ml-1 text-[11px] text-muted">{r.item_code}</span>}</td>
                    <td className="td text-slate-500">{r.product_family}</td>
                    <td className="td">{reasonBadge(r.reason)}</td>
                    {canFinance && <>
                      <td className="td text-right text-slate-500">{money(r.current_price)}</td>
                      <td className="td text-right font-semibold text-ink">{r.suggested_price == null ? <span className="text-muted">enter a cost</span> : money(r.suggested_price)}</td>
                      <td className={`td text-right font-medium ${n(r.delta) > 0 ? 'text-emerald-600' : 'text-muted'}`}>{r.delta == null ? '—' : (n(r.delta) > 0 ? '+' : '') + money(r.delta)}</td>
                      <td className={`td text-right ${gpTone(r.current_gp_percent)}`}>{pct(r.current_gp_percent)}</td>
                    </>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  )
}

// ── COST OPTIMIZATION ─────────────────────────────────────────────────────────
function CostTab({ p, canFinance }) {
  const s = p?.stats || {}
  const switches = p?.rows?.supplier_switches || []
  const sheets = p?.rows?.high_overhead_sheets || []
  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Cheaper Supplier" value={switches.length} sub="switch opportunities" icon={Coins} accent="brand" />
        {canFinance && <KpiCard label="Saving / unit" value={money(s.total_saving_per_unit)} sub="if all switched" icon={TrendingDown} accent="emerald" />}
        <KpiCard label="High-Overhead Sheets" value={sheets.length} sub="above portfolio avg" icon={AlertTriangle} accent="gold" />
        <KpiCard label="Avg Overhead" value={pct(s.portfolio_avg_overhead_pct)} sub="portfolio" icon={Percent} accent="violet" />
      </div>

      <Panel className="mt-5" title="Cheaper Supplier Available" subtitle="From real purchase-order rate history — a supplier who has quoted/sold this item for less than the one currently used.">
        {switches.length === 0 ? (
          <Empty icon={Coins}>No cheaper alternatives found. This needs at least two suppliers with purchase-order history for the same item.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50/60"><th className="th">Item</th><th className="th">Current Supplier</th>{canFinance && <th className="th text-right">Current Rate</th>}<th className="th">Cheaper Supplier</th>{canFinance && <><th className="th text-right">Best Rate</th><th className="th text-right">Saving</th></>}</tr></thead>
              <tbody>
                {switches.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/70">
                    <td className="td font-medium text-ink">{r.item_name}</td>
                    <td className="td text-slate-500">{r.current_supplier}</td>
                    {canFinance && <td className="td text-right text-slate-500">{money(r.current_rate)}</td>}
                    <td className="td font-medium text-emerald-700">{r.best_supplier}</td>
                    {canFinance && <><td className="td text-right text-ink">{money(r.best_rate)}</td>
                    <td className="td text-right font-semibold text-emerald-600">{money(r.saving_per_unit)} <span className="text-[11px] text-muted">({pct(r.saving_pct)})</span></td></>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel className="mt-4" title="Cost Sheets Above Average Overhead" subtitle="Overhead % higher than the portfolio average — candidates for review.">
        {sheets.length === 0 ? (
          <Empty icon={Percent}>No cost sheets exceed the portfolio's average overhead. Create cost sheets in the Cost Engine to populate this.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50/60"><th className="th">Cost Sheet</th><th className="th text-right">Overhead %</th><th className="th text-right">vs Avg</th>{canFinance && <><th className="th text-right">Overhead Cost</th><th className="th text-right">Total Cost</th></>}</tr></thead>
              <tbody>
                {sheets.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                    <td className="td font-medium text-ink">{r.number || r.name || '—'}</td>
                    <td className="td text-right font-semibold text-ink">{pct(r.overhead_pct)}</td>
                    <td className="td text-right text-amber-600">+{n(r.delta_pts)} pts</td>
                    {canFinance && <><td className="td text-right text-slate-500">{money(r.overhead_cost)}</td><td className="td text-right text-slate-500">{money(r.total_cost)}</td></>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  )
}

// ── MARGINS ───────────────────────────────────────────────────────────────────
function MarginTab({ p, canFinance }) {
  if (!canFinance) return <div className="card card-pad text-sm text-muted">Margin analysis is restricted to roles with financial visibility.</div>
  const items = p?.items || {}
  const quotes = p?.quotations || {}
  const projects = p?.projects || {}
  const dist = (items.distribution || []).map((b, i) => ({ ...b, fill: PALETTE[i % PALETTE.length] }))
  const families = (p?.families_dragging || [])
  const hasAny = (items.count || 0) + (quotes.count || 0) + (projects.count || 0) > 0
  if (!hasAny) return <div className="card"><Empty icon={Percent}>No priced items, quotations or projects with a margin yet.</Empty></div>
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Avg Item GP" value={pct(items.avg_gp)} sub={`${items.count || 0} priced items`} icon={Percent} accent="brand" />
        <KpiCard label="Avg Quotation GP" value={pct(quotes.avg_gp)} sub={`${quotes.count || 0} quotations`} icon={Percent} accent="violet" />
        <KpiCard label="Avg Project GP" value={pct(projects.avg_gp)} sub={`${projects.count || 0} projects`} icon={Percent} accent="emerald" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Item GP% Distribution" subtitle="How many items fall in each margin band">
          {items.count ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={dist} margin={{ left: -16, right: 6, top: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="count" name="Items" radius={[6, 6, 0, 0]} barSize={34} isAnimationActive={false}>
                  {dist.map((b) => <Cell key={b.label} fill={b.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="grid h-[250px] place-items-center text-xs text-muted">No priced items yet.</div>}
        </ChartCard>

        <ChartCard title="Product Families Dragging Margin" subtitle="Lowest average GP% first">
          {families.length ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={families} layout="vertical" margin={{ left: 8, right: 12, top: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} unit="%" />
                <YAxis type="category" dataKey="family" width={120} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(v) => `${v}%`} />
                <Bar dataKey="avg_gp" name="Avg GP" radius={[0, 6, 6, 0]} barSize={16} isAnimationActive={false}>
                  {families.map((f, i) => <Cell key={f.family} fill={n(f.avg_gp) < 0 ? '#f43f5e' : PALETTE[i % PALETTE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="grid h-[250px] place-items-center text-xs text-muted">No family data yet.</div>}
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <BestWorst title="Items" best={items.best} worst={items.worst} nameKey="name" />
        <BestWorst title="Projects" best={projects.best} worst={projects.worst} nameKey="name" subKey="number" />
      </div>
    </>
  )
}

function BestWorst({ title, best = [], worst = [], nameKey, subKey }) {
  const Row = ({ r }) => (
    <div className="flex items-center justify-between px-2 py-1.5 text-sm">
      <span className="truncate text-slate-600">{r[nameKey] || r[subKey] || '—'}</span>
      <span className={`ml-2 font-semibold ${gpTone(r.gp)}`}>{pct(r.gp)}</span>
    </div>
  )
  return (
    <div className="card card-pad">
      <h3 className="mb-2 text-[15px] font-bold text-ink">{title} — Best & Worst GP%</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-emerald-600"><TrendingUp size={13} /> Best</p>
          {best.length ? best.map((r, i) => <Row key={i} r={r} />) : <p className="px-2 text-xs text-muted">No data</p>}
        </div>
        <div>
          <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-rose-600"><TrendingDown size={13} /> Worst</p>
          {worst.length ? worst.map((r, i) => <Row key={i} r={r} />) : <p className="px-2 text-xs text-muted">No data</p>}
        </div>
      </div>
    </div>
  )
}

// ── SUPPLIERS ─────────────────────────────────────────────────────────────────
function SupplierTab({ p, canFinance }) {
  const s = p?.stats || {}
  const rows = p?.rows || []
  const recs = p?.recommendations || []
  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Suppliers" value={s.suppliers ?? 0} sub="in master" icon={Building2} accent="brand" />
        <KpiCard label="With Data" value={s.suppliers_with_data ?? 0} sub="POs or quotes" icon={CheckCircle2} accent="emerald" />
        <KpiCard label="Categories" value={s.categories ?? 0} sub="to source" icon={Tags} accent="violet" />
        <KpiCard label="Recommended" value={s.categories_recommended ?? 0} sub="categories with a pick" icon={Sparkles} accent="gold" />
      </div>

      <Panel className="mt-5" title="Recommended Supplier per Category" subtitle="Ranked by on-time %, average lead time and price competitiveness (rfq_quotes) — the same real metrics as supplier performance.">
        {recs.length === 0 ? (
          <Empty icon={Building2}>No supplier categories yet. Add suppliers with a category to get recommendations.</Empty>
        ) : (
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {recs.map((rec) => (
              <div key={rec.category} className="rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{rec.category}</p>
                {rec.supplier ? (
                  <>
                    <p className="mt-1 text-[15px] font-bold text-ink">{rec.supplier}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{rec.reason}</p>
                    <div className="mt-2 inline-flex items-center gap-1"><Badge tone="green">Score {n(rec.score)}</Badge></div>
                  </>
                ) : (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-600"><AlertTriangle size={13} /> {rec.note || 'Not enough data'}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel className="mt-4" title="Supplier Ranking" subtitle="Real delivery + price metrics. Suppliers with no transactional data are shown honestly as no-data.">
        {rows.length === 0 ? (
          <Empty icon={Building2}>No suppliers yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50/60"><th className="th">Supplier</th><th className="th">Category</th><th className="th text-right">On-time</th><th className="th text-right">Avg Lead</th><th className="th text-right">Quotes</th><th className="th text-right">Win %</th>{canFinance && <th className="th text-right">Premium</th>}<th className="th text-right">Score</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/70">
                    <td className="td font-medium text-ink">{r.supplier}</td>
                    <td className="td text-slate-500">{r.category || '—'}</td>
                    <td className="td text-right">{r.on_time_pct == null ? <span className="text-muted">—</span> : pct(r.on_time_pct)}</td>
                    <td className="td text-right text-slate-500">{r.avg_lead_time_days == null ? '—' : `${r.avg_lead_time_days}d`}</td>
                    <td className="td text-right text-slate-500">{r.quotes || 0}</td>
                    <td className="td text-right text-slate-500">{r.win_rate == null ? '—' : pct(r.win_rate)}</td>
                    {canFinance && <td className="td text-right text-slate-500">{r.avg_premium_pct == null ? '—' : pct(r.avg_premium_pct)}</td>}
                    <td className="td text-right font-semibold text-ink">{r.score == null ? <Badge tone="gray">no data</Badge> : r.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  )
}

// ── PURCHASING ────────────────────────────────────────────────────────────────
function PurchasingTab({ p, canFinance }) {
  const s = p?.stats || {}
  const bySupplier = (p?.spend_by_supplier || []).slice(0, 8).map((x) => ({ ...x, name: String(x.supplier).split(' ')[0] }))
  const byCategory = p?.spend_by_category || []
  const byMonth = (p?.spend_by_month || []).map((x) => ({ ...x, k: Math.round((x.amount || 0) / 1000) }))
  const rising = p?.rising_prices || []
  const reorder = p?.reorder_suggestions || []
  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {canFinance && <KpiCard label="Total Spend" value={money(s.total_spend)} sub={`${s.purchase_orders || 0} POs`} icon={Coins} accent="brand" />}
        <KpiCard label="Suppliers" value={s.suppliers ?? 0} sub="with spend" icon={Building2} accent="violet" />
        <KpiCard label="Rising Prices" value={s.rising_items ?? 0} sub="items trending up" icon={TrendingUp} accent="gold" />
        <KpiCard label="Reorder Now" value={s.reorder_items ?? 0} sub="below reorder level" icon={PackageSearch} accent="emerald" />
      </div>

      {canFinance && (
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
          <ChartCard title="Spend by Month" subtitle="SAR '000" className="xl:col-span-2">
            {byMonth.length ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={byMonth} margin={{ left: -16, right: 6, top: 6 }}>
                  <defs><linearGradient id="aisp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0EA99A" stopOpacity={0.3} /><stop offset="100%" stopColor="#0EA99A" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip formatter={(v) => `SAR ${v}k`} />
                  <Area type="monotone" dataKey="k" name="Spend" stroke="#0EA99A" strokeWidth={2.5} fill="url(#aisp)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <div className="grid h-[250px] place-items-center text-xs text-muted">No purchase orders yet.</div>}
          </ChartCard>

          <ChartCard title="Spend by Category" subtitle="Share of procurement spend">
            {byCategory.length ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={byCategory} dataKey="amount" nameKey="category" innerRadius={54} outerRadius={84} paddingAngle={3} stroke="none" isAnimationActive={false}>
                    {byCategory.map((c, i) => <Cell key={c.category} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v, nm) => [sar(v), nm]} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="grid h-[250px] place-items-center text-xs text-muted">No spend yet.</div>}
          </ChartCard>
        </div>
      )}

      {canFinance && bySupplier.length > 0 && (
        <ChartCard title="Top Suppliers by Spend" subtitle="SAR" className="mt-4">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={bySupplier} margin={{ left: -10, right: 6, top: 6 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} interval={0} angle={-15} textAnchor="end" height={44} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(v) => sar(v)} />
              <Bar dataKey="amount" name="Spend" radius={[6, 6, 0, 0]} barSize={26} isAnimationActive={false}>
                {bySupplier.map((x, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Rising Prices" subtitle="Items whose PO rate increased over time (earliest vs latest).">
          {rising.length === 0 ? (
            <Empty icon={TrendingUp}>No rising-price trend detected. Needs at least two POs for the same item.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-slate-50/60"><th className="th">Item</th>{canFinance && <><th className="th text-right">First</th><th className="th text-right">Latest</th></>}<th className="th text-right">Change</th></tr></thead>
                <tbody>
                  {rising.map((r, i) => (
                    <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/70">
                      <td className="td font-medium text-ink">{r.item_name}</td>
                      {canFinance && <><td className="td text-right text-slate-500">{money(r.first_rate)}</td><td className="td text-right text-ink">{money(r.last_rate)}</td></>}
                      <td className="td text-right font-semibold text-rose-600">+{pct(r.change_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Reorder Suggestions" subtitle="On-hand stock below the item's reorder level.">
          {reorder.length === 0 ? (
            <Empty icon={PackageSearch}>Nothing below reorder level. Set a reorder level on items to enable this.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-slate-50/60"><th className="th">Item</th><th className="th text-right">On Hand</th><th className="th text-right">Reorder Lvl</th><th className="th text-right">Shortfall</th></tr></thead>
                <tbody>
                  {reorder.map((r) => (
                    <tr key={r.item_id} className="border-t border-slate-100 hover:bg-slate-50/70">
                      <td className="td font-medium text-ink">{r.item_name}</td>
                      <td className="td text-right text-slate-500">{n(r.on_hand)} {r.uom}</td>
                      <td className="td text-right text-slate-500">{n(r.reorder_level)}</td>
                      <td className="td text-right font-semibold text-amber-600">{n(r.shortfall)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  )
}

// ── SAVED FEED ────────────────────────────────────────────────────────────────
function SavedFeed({ feed }) {
  if (!feed || feed.length === 0) return null
  return (
    <Panel className="mt-6" title="Saved Insights" subtitle="Insights you have pinned to the feed">
      <div className="divide-y divide-slate-100">
        {feed.slice(0, 12).map((f) => (
          <div key={f.id} className="flex items-start gap-3 px-5 py-3">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600"><Sparkles size={15} /></div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium text-ink">{f.title || f.kind}</p>
                <Badge tone="violet">{f.kind}</Badge>
              </div>
              {f.body && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{f.body}</p>}
            </div>
            <span className="shrink-0 text-[11px] text-muted">{(f.created_at || '').slice(0, 10)}</span>
          </div>
        ))}
      </div>
    </Panel>
  )
}
