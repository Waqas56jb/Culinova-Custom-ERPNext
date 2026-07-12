// ============================================================
// M9 — AI Business Intelligence
// Every insight is COMPUTED from real rows in this database (deterministic statistics that are always
// available). An LLM — read from env at request time so a key can be added later without a code change —
// is used ONLY to turn those computed numbers into a short narrative recommendation. When no key is
// configured the endpoints still return the full statistical insight with { llm:false, note:'…' }.
// Nothing here fabricates a number, and the endpoint never fails just because there is no LLM key.
// Read panel is 'projects' (Management, System Admin, Project Manager) — all money-bearing responses
// are passed through redactFinancials so a role without financial visibility never receives cost/margin.
// ============================================================
import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { authRequired } from '../../middleware/auth.js'
import { authorize, redactFinancials } from '../../middleware/rbac.js'
import { asyncWrap } from '../../middleware/error.js'
import { logAudit } from '../../core/audit.js'

const round = (n) => Math.round((Number(n) || 0) * 100) / 100
const n0 = (v) => Number(v) || 0
const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v))
const avg = (arr) => (arr.length ? round(arr.reduce((a, b) => a + b, 0) / arr.length) : null)
const dayMs = 1000 * 60 * 60 * 24

function median(values) {
  const a = (values || []).filter((x) => x != null && !Number.isNaN(Number(x))).map(Number).sort((x, y) => x - y)
  if (!a.length) return null
  const mid = Math.floor(a.length / 2)
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2
}

// item value helpers (an item can carry the price/cost under several legacy columns)
const priceOf = (it) => n0(it.selling_price) || n0(it.selling_rate) || n0(it.calculated_sale_price)
const landedOf = (it) => n0(it.landed_cost) || n0(it.cost) || n0(it.avg_cost)
const familyOf = (it) => it.product_family || it.category || it.item_group || 'Ungrouped'
const itemGpPct = (it) => {
  const p = priceOf(it), c = landedOf(it)
  if (it.gp_percent != null && p > 0) return round(Number(it.gp_percent))
  if (p > 0 && c > 0) return round(((p - c) / p) * 100)
  return null
}
// effective unit rate of a PO row (explicit rate wins; else amount / qty)
const poRate = (p) => {
  const r = n0(p.rate)
  if (r > 0) return r
  const q = n0(p.qty)
  return q > 0 ? n0(p.amount) / q : 0
}

// ── LLM narrative (optional, env-driven) ─────────────────────────────────────
// The key is read on every call (never cached) so the owner can add OPENAI_API_KEY to the server .env
// and get narratives with zero code change. Failure here NEVER fails the insight.
const llmKey = () => process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || ''
const llmModel = () => process.env.OPENAI_INSIGHTS_MODEL || process.env.OPENAI_EXTRACTION_MODEL || 'gpt-4o-mini'

async function narrate(kind, facts, hasData) {
  const key = llmKey()
  if (!key) return { llm: false, narrative: null, note: 'Narrative disabled — no LLM key configured. Statistics below are live.', model: null }
  if (!hasData) return { llm: false, narrative: null, note: 'Not enough data yet to generate a narrative.', model: null }
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 14000)
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: llmModel(),
        temperature: 0.2,
        max_tokens: 220,
        messages: [
          {
            role: 'system',
            content:
              'You are a procurement and pricing analyst for Culinova, a commercial-kitchen-equipment company in Saudi Arabia. ' +
              'You are given ONLY pre-computed statistics from the ERP database. Write a concise, specific recommendation of 2–3 sentences. ' +
              'Use only the numbers provided — never invent figures. Currency is SAR.',
          },
          { role: 'user', content: `Insight type: ${kind}\nComputed facts (JSON):\n${JSON.stringify(facts).slice(0, 4000)}` },
        ],
      }),
    })
    clearTimeout(timer)
    if (!res.ok) return { llm: false, narrative: null, note: `Narrative unavailable — LLM error ${res.status}. Statistics are live.`, model: llmModel() }
    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content?.trim() || null
    return text
      ? { llm: true, narrative: text, note: null, model: llmModel() }
      : { llm: false, narrative: null, note: 'Narrative unavailable — empty LLM response.', model: llmModel() }
  } catch (e) {
    const reason = e?.name === 'AbortError' ? 'LLM timeout' : (e?.message || 'LLM error')
    return { llm: false, narrative: null, note: `Narrative unavailable — ${reason}. Statistics are live.`, model: llmModel() }
  }
}

export function aiRouter() {
  const r = Router()
  const readGuard = [authRequired, authorize('projects', 'read')]

  // ── GET /ai/pricing-suggestions ────────────────────────────────────────────
  // Items with no price at all, or whose GP% is below their product family's average. Suggested price
  // = landed cost × the family's MEDIAN markup (real median from the items table; falls back to the
  // portfolio median markup when the family has none). Returns current vs suggested + the delta.
  r.get('/pricing-suggestions', ...readGuard, asyncWrap(async (req, res) => {
    const { data: items } = await supabase.from('items').select('*')
    const rows = items || []

    const markupOf = (it) => {
      const m = num(it.markup_factor)
      if (m != null && m > 0) return m
      const p = priceOf(it), c = landedOf(it)
      return p > 0 && c > 0 ? p / c : null
    }

    const fam = {}
    for (const it of rows) {
      const k = familyOf(it)
      const f = fam[k] || (fam[k] = { gps: [], markups: [] })
      const gp = itemGpPct(it); if (gp != null) f.gps.push(gp)
      const mk = markupOf(it); if (mk != null && mk > 0) f.markups.push(mk)
    }
    const famStats = {}
    for (const [k, f] of Object.entries(fam)) {
      famStats[k] = { avg_gp: avg(f.gps), priced: f.gps.length, median_markup: median(f.markups) }
    }
    const portfolioMedianMarkup = median(rows.map(markupOf).filter((x) => x != null && x > 0))

    const suggestions = []
    for (const it of rows) {
      const k = familyOf(it)
      const fs = famStats[k] || {}
      const price = priceOf(it), landed = landedOf(it), gp = itemGpPct(it)
      const noPrice = price <= 0
      const belowFam = !noPrice && gp != null && fs.avg_gp != null && fs.priced >= 2 && gp < fs.avg_gp - 0.5
      if (!noPrice && !belowFam) continue

      const mk = fs.median_markup != null ? fs.median_markup : portfolioMedianMarkup
      let suggested = null, basis = 'none'
      if (landed > 0 && mk) { suggested = round(landed * mk); basis = fs.median_markup != null ? 'family_median_markup' : 'portfolio_median_markup' }
      // A below-family-GP item is only worth flagging when we can actually suggest a HIGHER price.
      // A no-price item is always surfaced (it is unpriced); when it also has no cost basis we say so
      // honestly (suggested = null, basis = 'none — enter a cost to price it') instead of inventing a number.
      if (belowFam && (suggested == null || suggested <= price)) continue

      suggestions.push({
        item_id: it.id,
        item_name: it.item_name || it.name,
        item_code: it.item_code || it.code,
        product_family: k,
        reason: noPrice ? 'no_price' : 'below_family_gp',
        current_price: round(price),
        current_gp_percent: gp,
        family_avg_gp_percent: fs.avg_gp != null ? round(fs.avg_gp) : null,
        family_median_markup: fs.median_markup != null ? round(fs.median_markup) : null,
        landed_cost: round(landed),
        suggested_price: suggested,
        delta: round(suggested - price),
        delta_pct: price > 0 ? round(((suggested - price) / price) * 100) : null,
        basis,
      })
    }
    // actionable rows (we can suggest a number) first, then no-price items, then the largest uplift
    suggestions.sort((a, b) =>
      (a.suggested_price != null ? 0 : 1) - (b.suggested_price != null ? 0 : 1) ||
      (a.reason === 'no_price' ? 0 : 1) - (b.reason === 'no_price' ? 0 : 1) ||
      n0(b.delta) - n0(a.delta))

    const stats = {
      total_items: rows.length,
      flagged: suggestions.length,
      actionable: suggestions.filter((s) => s.suggested_price != null).length,
      no_price: suggestions.filter((s) => s.reason === 'no_price').length,
      below_family_gp: suggestions.filter((s) => s.reason === 'below_family_gp').length,
      portfolio_median_markup: portfolioMedianMarkup != null ? round(portfolioMedianMarkup) : null,
    }
    const facts = { ...stats, examples: suggestions.slice(0, 8).map((s) => ({ item: s.item_name, family: s.product_family, reason: s.reason, current: s.current_price, suggested: s.suggested_price })) }
    const nar = await narrate('pricing-suggestions', facts, suggestions.length > 0)
    res.json(redactFinancials(req.user.role, {
      kind: 'pricing-suggestions', title: 'AI Pricing Suggestions',
      generated_at: new Date().toISOString(), stats, rows: suggestions.slice(0, 100), ...nar,
    }))
  }))

  // ── GET /ai/cost-optimization ──────────────────────────────────────────────
  // (1) Items where PO rate history shows a cheaper supplier than the one currently used.
  // (2) Cost sheets whose overhead % is above the portfolio average. Real rows only.
  r.get('/cost-optimization', ...readGuard, asyncWrap(async (req, res) => {
    const [{ data: pos }, { data: sheets }] = await Promise.all([
      supabase.from('purchase_orders').select('*'),
      supabase.from('cost_sheets').select('*'),
    ])

    const byItem = {}
    for (const p of pos || []) {
      if ((p.status || '') === 'Cancelled') continue
      const key = String(p.item_name || '').trim().toLowerCase()
      if (!key) continue
      const rate = poRate(p); if (rate <= 0) continue
      const supplier = p.supplier || 'Unknown'
      const g = byItem[key] || (byItem[key] = { item_name: p.item_name, bySupplier: {}, latest: null })
      const s = g.bySupplier[supplier] || (g.bySupplier[supplier] = { supplier, rates: [], min: Infinity, last: null, lastAt: null })
      s.rates.push(rate); s.min = Math.min(s.min, rate)
      if (!s.lastAt || (p.created_at || '') > s.lastAt) { s.lastAt = p.created_at || ''; s.last = rate }
      if (!g.latest || (p.created_at || '') > g.latest.at) g.latest = { at: p.created_at || '', supplier, rate }
    }

    const supplier_switches = []
    for (const g of Object.values(byItem)) {
      const suppliers = Object.values(g.bySupplier)
      if (suppliers.length < 2) continue // need a real alternative to compare against
      const currentSupplier = g.latest.supplier
      const currentRate = g.bySupplier[currentSupplier]?.last ?? g.latest.rate
      let best = null
      for (const s of suppliers) if (best == null || s.min < best.min) best = { supplier: s.supplier, min: s.min }
      if (best && best.supplier !== currentSupplier && best.min < currentRate) {
        supplier_switches.push({
          item_name: g.item_name,
          current_supplier: currentSupplier, current_rate: round(currentRate),
          best_supplier: best.supplier, best_rate: round(best.min),
          saving_per_unit: round(currentRate - best.min),
          saving_pct: currentRate > 0 ? round(((currentRate - best.min) / currentRate) * 100) : null,
          suppliers: suppliers
            .map((s) => ({ supplier: s.supplier, min_rate: round(s.min), avg_rate: round(s.rates.reduce((a, b) => a + b, 0) / s.rates.length), pos: s.rates.length }))
            .sort((a, b) => a.min_rate - b.min_rate),
        })
      }
    }
    supplier_switches.sort((a, b) => n0(b.saving_per_unit) - n0(a.saving_per_unit))

    const sheetRows = sheets || []
    const ovs = sheetRows.map((s) => n0(s.overhead_pct)).filter((x) => x > 0)
    const portfolio_avg_overhead_pct = avg(ovs)
    const high_overhead_sheets = portfolio_avg_overhead_pct == null ? [] : sheetRows
      .filter((s) => n0(s.overhead_pct) > portfolio_avg_overhead_pct)
      .map((s) => ({
        id: s.id, number: s.number, name: s.name,
        overhead_pct: round(n0(s.overhead_pct)), overhead_cost: round(n0(s.overhead_cost)),
        total_cost: round(n0(s.total_cost)),
        portfolio_avg_overhead_pct, delta_pts: round(n0(s.overhead_pct) - portfolio_avg_overhead_pct),
      }))
      .sort((a, b) => b.delta_pts - a.delta_pts)

    const stats = {
      items_with_po_history: Object.keys(byItem).length,
      supplier_switches: supplier_switches.length,
      total_saving_per_unit: round(supplier_switches.reduce((s, x) => s + n0(x.saving_per_unit), 0)),
      cost_sheets: sheetRows.length,
      high_overhead_sheets: high_overhead_sheets.length,
      portfolio_avg_overhead_pct,
    }
    const facts = {
      ...stats,
      switch_examples: supplier_switches.slice(0, 6).map((s) => ({ item: s.item_name, from: s.current_supplier, to: s.best_supplier, saving_pct: s.saving_pct })),
      overhead_examples: high_overhead_sheets.slice(0, 6).map((s) => ({ sheet: s.number || s.name, overhead_pct: s.overhead_pct, vs_avg: s.delta_pts })),
    }
    const nar = await narrate('cost-optimization', facts, supplier_switches.length > 0 || high_overhead_sheets.length > 0)
    res.json(redactFinancials(req.user.role, {
      kind: 'cost-optimization', title: 'AI Cost Optimization',
      generated_at: new Date().toISOString(), stats,
      rows: { supplier_switches, high_overhead_sheets }, ...nar,
    }))
  }))

  // ── GET /ai/margin-analysis ────────────────────────────────────────────────
  // GP% distribution across items / quotations / projects: best & worst performers, the average, and
  // which product families drag the margin down. All real numbers.
  r.get('/margin-analysis', ...readGuard, asyncWrap(async (req, res) => {
    const [{ data: items }, { data: quotes }, { data: projects }] = await Promise.all([
      supabase.from('items').select('*'),
      supabase.from('quotations').select('id, number, customer, gp_percent, total_amount, cost_amount, status'),
      supabase.from('projects').select('id, number, name, customer, contract_value, actual_cost, committed_cost'),
    ])

    // items
    const itemGp = []
    for (const it of items || []) {
      const gp = itemGpPct(it)
      if (gp != null) itemGp.push({ id: it.id, name: it.item_name || it.name, family: familyOf(it), gp })
    }
    const buckets = [
      { label: '<0%', min: -Infinity, max: 0 }, { label: '0–10%', min: 0, max: 10 },
      { label: '10–20%', min: 10, max: 20 }, { label: '20–30%', min: 20, max: 30 },
      { label: '30–40%', min: 30, max: 40 }, { label: '40%+', min: 40, max: Infinity },
    ]
    const distribution = buckets.map((b) => ({ label: b.label, count: itemGp.filter((x) => x.gp >= b.min && x.gp < b.max).length }))
    const itemsSorted = [...itemGp].sort((a, b) => b.gp - a.gp)

    const famMap = {}
    for (const x of itemGp) (famMap[x.family] = famMap[x.family] || []).push(x.gp)
    const families = Object.entries(famMap)
      .map(([family, gps]) => ({ family, avg_gp: round(gps.reduce((a, b) => a + b, 0) / gps.length), items: gps.length }))
      .sort((a, b) => a.avg_gp - b.avg_gp)

    // quotations
    const qGp = (quotes || []).filter((q) => q.gp_percent != null).map((q) => ({ id: q.id, number: q.number, customer: q.customer, status: q.status, gp: round(Number(q.gp_percent)) }))
    const qSorted = [...qGp].sort((a, b) => b.gp - a.gp)

    // projects — GP% = (contract value − actual/committed cost) / contract value
    const pGp = []
    for (const p of projects || []) {
      const cv = n0(p.contract_value); const cost = n0(p.actual_cost) || n0(p.committed_cost)
      if (cv > 0) pGp.push({ id: p.id, number: p.number, name: p.name, gp: round(((cv - cost) / cv) * 100) })
    }
    const pSorted = [...pGp].sort((a, b) => b.gp - a.gp)

    const stats = {
      items: { count: itemGp.length, avg_gp: avg(itemGp.map((x) => x.gp)) },
      quotations: { count: qGp.length, avg_gp: avg(qGp.map((x) => x.gp)) },
      projects: { count: pGp.length, avg_gp: avg(pGp.map((x) => x.gp)) },
    }
    const payload = {
      items: {
        ...stats.items, distribution,
        best: itemsSorted.slice(0, 5), worst: itemsSorted.slice(-5).reverse(),
      },
      quotations: { ...stats.quotations, best: qSorted.slice(0, 5), worst: qSorted.slice(-5).reverse() },
      projects: { ...stats.projects, best: pSorted.slice(0, 5), worst: pSorted.slice(-5).reverse() },
      families_dragging: families.slice(0, 5),
    }
    const facts = {
      item_avg_gp: stats.items.avg_gp, quotation_avg_gp: stats.quotations.avg_gp, project_avg_gp: stats.projects.avg_gp,
      worst_families: families.slice(0, 3), worst_items: payload.items.worst.slice(0, 3),
    }
    const hasData = itemGp.length + qGp.length + pGp.length > 0
    const nar = await narrate('margin-analysis', facts, hasData)
    res.json(redactFinancials(req.user.role, {
      kind: 'margin-analysis', title: 'AI Margin Analysis',
      generated_at: new Date().toISOString(), stats, ...payload, ...nar,
    }))
  }))

  // ── GET /ai/supplier-recommendations ───────────────────────────────────────
  // Ranks suppliers by the SAME real transactional metrics as /procurement/supplier-performance
  // (on-time %, average lead time from POs+GRNs) PLUS price competitiveness from rfq_quotes, then
  // recommends one supplier per category. Honest "Not enough data" when a category has no signals.
  r.get('/supplier-recommendations', ...readGuard, asyncWrap(async (req, res) => {
    const [{ data: suppliers }, { data: pos }, { data: quotes }] = await Promise.all([
      supabase.from('suppliers').select('id, name, category, status, rating, on_time'),
      supabase.from('purchase_orders').select('*'),
      supabase.from('rfq_quotes').select('rfq_id, supplier, quote'),
    ])
    const poIds = (pos || []).map((p) => p.id)
    const { data: grns } = poIds.length
      ? await supabase.from('goods_receipts').select('po_id, qty, created_at').in('po_id', poIds)
      : { data: [] }
    const grnByPo = {}
    for (const g of grns || []) {
      const e = grnByPo[g.po_id] || (grnByPo[g.po_id] = { qty: 0, last: null })
      e.qty += n0(g.qty)
      if (!e.last || (g.created_at || '') > e.last) e.last = g.created_at || ''
    }

    // per-supplier delivery aggregation (mirrors procurement/supplier-performance)
    const agg = {}
    const ensure = (name, id, category, rating) => {
      const key = (name || 'Unknown').toLowerCase()
      return agg[key] || (agg[key] = {
        supplier: name || 'Unknown', supplier_id: id || null, category: category || null, rating: n0(rating),
        total_pos: 0, total_value: 0, received_pos: 0, on_time_count: 0, on_time_den: 0, lead_sum: 0, lead_n: 0,
      })
    }
    for (const s of suppliers || []) ensure(s.name, s.id, s.category, s.rating)
    for (const p of pos || []) {
      if ((p.status || '') === 'Cancelled') continue
      const a = ensure(p.supplier, p.supplier_id)
      a.total_pos += 1; a.total_value += n0(p.amount)
      const g = grnByPo[p.id]
      if (g) {
        a.received_pos += 1
        if (p.created_at && g.last) { a.lead_sum += Math.max(0, (new Date(g.last).getTime() - new Date(p.created_at).getTime()) / dayMs); a.lead_n += 1 }
        if (p.expected_date) { a.on_time_den += 1; if (new Date(g.last).getTime() <= new Date(p.expected_date).getTime() + dayMs - 1) a.on_time_count += 1 }
      }
    }

    // price competitiveness from rfq_quotes: lowest quote per RFQ is the benchmark
    const minByRfq = {}
    for (const q of quotes || []) { const v = n0(q.quote); if (v <= 0) continue; if (minByRfq[q.rfq_id] == null || v < minByRfq[q.rfq_id]) minByRfq[q.rfq_id] = v }
    const priceAgg = {}
    for (const q of quotes || []) {
      const v = n0(q.quote); if (v <= 0) continue
      const min = minByRfq[q.rfq_id]
      const key = (q.supplier || 'Unknown').toLowerCase()
      const a = priceAgg[key] || (priceAgg[key] = { quotes: 0, wins: 0, premSum: 0 })
      a.quotes += 1
      if (v <= min + 1e-9) a.wins += 1
      if (min > 0) a.premSum += ((v - min) / min) * 100
    }

    const rows = Object.values(agg).map((a) => {
      const pa = priceAgg[a.supplier.toLowerCase()]
      const on_time_pct = a.on_time_den > 0 ? Math.round((a.on_time_count / a.on_time_den) * 100) : null
      const avg_lead_time_days = a.lead_n > 0 ? round(a.lead_sum / a.lead_n) : null
      const quotes_count = pa?.quotes || 0
      const win_rate = quotes_count > 0 ? Math.round((pa.wins / quotes_count) * 100) : null
      const avg_premium_pct = quotes_count > 0 ? round(pa.premSum / quotes_count) : null

      // composite score (0–100) from whatever REAL transactional signals exist — not the master rating
      const signals = []
      if (on_time_pct != null) signals.push(on_time_pct)
      if (avg_premium_pct != null) signals.push(Math.max(0, 100 - avg_premium_pct))
      if (avg_lead_time_days != null) signals.push(Math.max(0, 100 - avg_lead_time_days))
      const score = signals.length ? round(signals.reduce((x, y) => x + y, 0) / signals.length) : null
      return {
        supplier: a.supplier, supplier_id: a.supplier_id, category: a.category, rating: a.rating || null,
        total_pos: a.total_pos, total_value: round(a.total_value),
        on_time_pct, avg_lead_time_days, quotes: quotes_count, win_rate, avg_premium_pct,
        score, has_data: a.total_pos > 0 || quotes_count > 0,
      }
    })
    rows.sort((x, y) => (y.score ?? -1) - (x.score ?? -1) || y.total_value - x.total_value)

    const reasonFor = (s) => {
      const bits = []
      if (s.on_time_pct != null) bits.push(`${s.on_time_pct}% on-time`)
      if (s.avg_lead_time_days != null) bits.push(`${s.avg_lead_time_days}d avg lead`)
      if (s.avg_premium_pct != null) bits.push(`${s.avg_premium_pct}% price premium vs lowest`)
      return bits.join(' · ') || 'ranked on available data'
    }
    const categories = [...new Set(rows.map((r) => r.category).filter(Boolean))].sort()
    const recommendations = categories.map((cat) => {
      const inCat = rows.filter((r) => r.category === cat && r.has_data && r.score != null)
      if (!inCat.length) return { category: cat, supplier: null, score: null, note: 'Not enough data' }
      const top = inCat[0]
      return { category: cat, supplier: top.supplier, score: top.score, reason: reasonFor(top) }
    })

    const withData = rows.filter((r) => r.has_data)
    const stats = {
      suppliers: rows.length,
      suppliers_with_data: withData.length,
      categories: categories.length,
      categories_recommended: recommendations.filter((r) => r.supplier).length,
      rfq_quotes: (quotes || []).length,
    }
    const facts = { ...stats, top: withData.slice(0, 6).map((s) => ({ supplier: s.supplier, category: s.category, score: s.score, on_time: s.on_time_pct })), recommendations: recommendations.filter((r) => r.supplier).slice(0, 8) }
    const nar = await narrate('supplier-recommendations', facts, withData.length > 0)
    res.json(redactFinancials(req.user.role, {
      kind: 'supplier-recommendations', title: 'AI Supplier Recommendations',
      generated_at: new Date().toISOString(), stats, rows, recommendations, ...nar,
    }))
  }))

  // ── GET /ai/purchasing-insights ────────────────────────────────────────────
  // Spend by supplier / category / month (real POs), items with rising prices (PO rates over time),
  // and reorder suggestions from stock_balances vs the item reorder level.
  r.get('/purchasing-insights', ...readGuard, asyncWrap(async (req, res) => {
    const [{ data: pos }, { data: suppliers }, { data: balances }, { data: items }] = await Promise.all([
      supabase.from('purchase_orders').select('*'),
      supabase.from('suppliers').select('name, category'),
      supabase.from('stock_balances').select('item_id, warehouse, qty'),
      supabase.from('items').select('id, item_name, name, item_code, code, reorder_level, safety_stock, uom'),
    ])
    const catOf = {}
    for (const s of suppliers || []) catOf[String(s.name || '').toLowerCase()] = s.category || 'Uncategorized'

    const bySup = {}, byCat = {}, byMonth = {}
    for (const p of pos || []) {
      if ((p.status || '') === 'Cancelled') continue
      const amt = n0(p.amount)
      const sup = p.supplier || 'Unknown'
      bySup[sup] = (bySup[sup] || 0) + amt
      const cat = catOf[sup.toLowerCase()] || 'Uncategorized'
      byCat[cat] = (byCat[cat] || 0) + amt
      const mk = String(p.created_at || '').slice(0, 7)
      if (mk) byMonth[mk] = (byMonth[mk] || 0) + amt
    }
    const spend_by_supplier = Object.entries(bySup).map(([supplier, amount]) => ({ supplier, amount: round(amount) })).sort((a, b) => b.amount - a.amount)
    const spend_by_category = Object.entries(byCat).map(([category, amount]) => ({ category, amount: round(amount) })).sort((a, b) => b.amount - a.amount)
    const spend_by_month = Object.entries(byMonth).map(([month, amount]) => ({ month, amount: round(amount) })).sort((a, b) => (a.month < b.month ? -1 : 1))

    // rising prices — compare earliest vs latest effective PO rate per item
    const byItemName = {}
    for (const p of pos || []) {
      if ((p.status || '') === 'Cancelled') continue
      const rate = poRate(p); if (rate <= 0) continue
      const key = String(p.item_name || '').trim(); if (!key) continue
      ;(byItemName[key] = byItemName[key] || []).push({ at: p.created_at || '', rate })
    }
    const rising_prices = []
    for (const [name, arr] of Object.entries(byItemName)) {
      if (arr.length < 2) continue
      arr.sort((a, b) => (a.at < b.at ? -1 : 1))
      const first = arr[0].rate, last = arr[arr.length - 1].rate
      if (last > first) rising_prices.push({ item_name: name, first_rate: round(first), last_rate: round(last), change_pct: first > 0 ? round(((last - first) / first) * 100) : null, points: arr.length })
    }
    rising_prices.sort((a, b) => n0(b.change_pct) - n0(a.change_pct))

    // reorder suggestions — on-hand (sum of stock_balances) below the item reorder level
    const qtyByItem = {}
    for (const b of balances || []) qtyByItem[b.item_id] = (qtyByItem[b.item_id] || 0) + n0(b.qty)
    const reorder_suggestions = []
    for (const it of items || []) {
      const ro = n0(it.reorder_level); if (ro <= 0) continue
      const onHand = qtyByItem[it.id] || 0
      if (onHand < ro) reorder_suggestions.push({
        item_id: it.id, item_name: it.item_name || it.name, item_code: it.item_code || it.code,
        on_hand: round(onHand), reorder_level: ro, safety_stock: n0(it.safety_stock), shortfall: round(ro - onHand), uom: it.uom || 'Nos',
      })
    }
    reorder_suggestions.sort((a, b) => b.shortfall - a.shortfall)

    const stats = {
      total_spend: round(Object.values(bySup).reduce((a, b) => a + b, 0)),
      purchase_orders: (pos || []).filter((p) => (p.status || '') !== 'Cancelled').length,
      suppliers: spend_by_supplier.length,
      rising_items: rising_prices.length,
      reorder_items: reorder_suggestions.length,
    }
    const facts = {
      ...stats,
      top_suppliers: spend_by_supplier.slice(0, 5),
      top_categories: spend_by_category.slice(0, 5),
      rising: rising_prices.slice(0, 5),
      reorder: reorder_suggestions.slice(0, 5).map((x) => ({ item: x.item_name, short: x.shortfall })),
    }
    const hasData = spend_by_supplier.length > 0 || rising_prices.length > 0 || reorder_suggestions.length > 0
    const nar = await narrate('purchasing-insights', facts, hasData)
    res.json(redactFinancials(req.user.role, {
      kind: 'purchasing-insights', title: 'AI Purchasing Insights',
      generated_at: new Date().toISOString(), stats,
      spend_by_supplier, spend_by_category, spend_by_month, rising_prices, reorder_suggestions, ...nar,
    }))
  }))

  // ── POST /ai/insights — persist a generated insight ────────────────────────
  r.post('/insights', authRequired, authorize('projects', 'create'), asyncWrap(async (req, res) => {
    const b = req.body || {}
    const kind = String(b.kind || '').trim()
    if (!kind) return res.status(422).json({ error: 'kind is required' })
    const confidence = num(b.confidence)
    if (confidence != null && (Number.isNaN(confidence) || confidence < 0 || confidence > 1)) {
      return res.status(422).json({ error: 'confidence must be a number between 0 and 1' })
    }
    let data = b.data
    if (data == null) data = {}
    if (typeof data !== 'object' || Array.isArray(data)) return res.status(422).json({ error: 'data must be a JSON object' })

    const row = {
      kind,
      scope: b.scope ? String(b.scope) : null,
      subject_id: b.subject_id ? String(b.subject_id) : null,
      title: b.title ? String(b.title) : null,
      body: b.body ? String(b.body) : null,
      data,
      confidence,
      model: b.model ? String(b.model) : null,
      created_by: req.user.id,
    }
    const { data: inserted, error } = await supabase.from('ai_insights').insert(row).select().single()
    if (error) return res.status(400).json({ error: error.message })
    await logAudit(req.user, 'ai_insight', inserted.id, 'create', { kind })
    res.status(201).json(redactFinancials(req.user.role, inserted))
  }))

  // ── GET /ai/insights?kind= — the saved insight feed ────────────────────────
  r.get('/insights', ...readGuard, asyncWrap(async (req, res) => {
    let q = supabase.from('ai_insights').select('*').order('created_at', { ascending: false }).limit(200)
    if (req.query.kind) q = q.eq('kind', String(req.query.kind))
    const { data, error } = await q
    if (error) return res.status(400).json({ error: error.message })
    res.json(redactFinancials(req.user.role, data || []))
  }))

  return r
}

export default aiRouter
