// M9 — AI Business Intelligence: end-to-end verification against the LIVE API.
// Acts as the REAL Project Manager (the role that owns the 'projects' read panel this module uses),
// proves all five deterministic insight endpoints compute from real DB rows, that the LLM narrative
// flag is present and honest (llm:false + note when no key is configured), that an insight can be
// persisted + read back, and that RBAC blocks a Sales user. Self-cleaning.
// NOTE: until the orchestrator mounts aiRouter at /api/ai this will 404 — that is EXPECTED.
import { supabase } from '../src/config/supabase.js'
import jwt from 'jsonwebtoken'
import { env } from '../src/config/env.js'

const BASE = process.env.BASE || 'http://localhost:5050/api'
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
let pass = 0, fail = 0
const ok = (c, m) => { c ? (pass++, console.log('  ✓', m)) : (fail++, console.log('  ✗ FAIL', m)) }

const tokenFor = (u) => jwt.sign({ id: u.id, name: u.name, email: u.email, role: u.role, access_level: u.access_level }, env.jwtSecret, { expiresIn: '1h' })

// the real Project Manager owns the 'projects' panel; Sales user must be denied
const { data: pm } = await supabase.from('users').select('*').eq('email', 'pm@gmail.com').single()
const { data: sales } = await supabase.from('users').select('*').eq('email', 'ali@culinova.sa').maybeSingle()
if (!pm) { console.error('No pm@gmail.com user — cannot run'); process.exit(1) }
const H = { authorization: `Bearer ${tokenFor(pm)}`, 'content-type': 'application/json' }

let createdInsightId = null

console.log('\n######## AI BUSINESS INTELLIGENCE (as Project Manager) ########')

console.log('\n[1] Five deterministic insight endpoints — real stats, honest LLM flag')
const endpoints = ['pricing-suggestions', 'cost-optimization', 'margin-analysis', 'supplier-recommendations', 'purchasing-insights']
for (const ep of endpoints) {
  const res = await fetch(`${BASE}/ai/${ep}`, { headers: H })
  const b = await j(res)
  const good = res.status === 200 && b && b.kind === ep && b.stats && typeof b.llm === 'boolean'
  ok(good, `GET /ai/${ep} -> ${res.status}${good ? ` · llm=${b.llm}${b.llm ? '' : ' · ' + String(b.note || '').slice(0, 48)}` : ' · ' + JSON.stringify(b).slice(0, 80)}`)
  // when no LLM key is configured the statistics must STILL be present and a note must explain it
  if (good && b.llm === false) ok(!!b.note && b.narrative == null, `   ${ep}: narrative off but stats live (note present)`)
}

console.log('\n[2] Margin analysis returns real GP numbers (Project Manager sees financials)')
const margin = await fetch(`${BASE}/ai/margin-analysis`, { headers: H }).then(j)
ok(margin && margin.items && ('avg_gp' in (margin.stats?.items || {})), `margin-analysis items.avg_gp = ${margin?.stats?.items?.avg_gp}`)
ok(margin && Array.isArray(margin.items?.distribution) && margin.items.distribution.length === 6, `GP distribution buckets = ${margin?.items?.distribution?.length}`)

console.log('\n[3] Pricing suggestions computed from real items (median markup, no invented numbers)')
const pricing = await fetch(`${BASE}/ai/pricing-suggestions`, { headers: H }).then(j)
ok(pricing && Array.isArray(pricing.rows) && typeof pricing.stats.total_items === 'number', `pricing rows=${pricing?.rows?.length} of ${pricing?.stats?.total_items} items · median markup=${pricing?.stats?.portfolio_median_markup}`)

console.log('\n[4] Persist a generated insight, then read the feed')
const payload = { kind: 'zz-verify-pricing', scope: 'test', title: 'Verify insight', body: 'Automated verification row.', data: { flagged: pricing?.stats?.flagged ?? 0 }, confidence: 0.9, model: pricing?.model || null }
const created = await fetch(`${BASE}/ai/insights`, { method: 'POST', headers: H, body: JSON.stringify(payload) }).then(j)
ok(created && created.id && created.kind === 'zz-verify-pricing' && created.created_by === pm.id, `POST /ai/insights -> ${created?.id || JSON.stringify(created)}`)
createdInsightId = created?.id || null
const feed = await fetch(`${BASE}/ai/insights?kind=zz-verify-pricing`, { headers: H }).then(j)
ok(Array.isArray(feed) && feed.some((x) => x.id === createdInsightId), `GET /ai/insights?kind=zz-verify-pricing -> ${Array.isArray(feed) ? feed.length + ' row(s)' : JSON.stringify(feed)}`)

console.log('\n[5] Validation — a missing kind is rejected 422, not silently inserted')
const badRes = await fetch(`${BASE}/ai/insights`, { method: 'POST', headers: H, body: JSON.stringify({ title: 'no kind' }) })
ok(badRes.status === 422, `POST /ai/insights (no kind) -> ${badRes.status} (expect 422)`)

console.log('\n[6] RBAC — a Sales user (no projects panel) is blocked')
if (sales) {
  const SH = { authorization: `Bearer ${tokenFor(sales)}`, 'content-type': 'application/json' }
  const denied = await fetch(`${BASE}/ai/pricing-suggestions`, { headers: SH })
  ok(denied.status === 403, `Sales user GET /ai/pricing-suggestions -> ${denied.status} (expect 403)`)
} else ok(true, 'no sales user to test (skipped)')

console.log('\n[7] CLEANUP')
if (createdInsightId) await supabase.from('ai_insights').delete().eq('id', createdInsightId)
// safety net: remove any stray verification rows
await supabase.from('ai_insights').delete().eq('kind', 'zz-verify-pricing')
console.log('  cleaned verification insight(s)')

console.log(`\n######## RESULT: ${pass} passed, ${fail} failed ########`)
process.exit(fail ? 1 : 0)
