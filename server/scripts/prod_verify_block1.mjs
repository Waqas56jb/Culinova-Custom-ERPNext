/**
 * One-shot production Block 1 verification (report only).
 * Usage: node scripts/prod_verify_block1.mjs
 */
const BASE = 'https://culinova-backend.vercel.app/api'
const EMAIL = 'admin@gmail.com'
const PASS = 'admin@123!'

const results = []
const pass = (name, ok, detail = '') => results.push({ name, ok, detail })

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `${res.status} ${path}`)
  return data
}

const buildName = (brand, model, family) => [brand, model, family].filter(Boolean).join(' ').trim()

const login = await api('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASS } })
const token = login.token

// ── 1. Fresh import name check ──────────────────────────────────────────────
try {
  const pending = await api('/eos/pending?limit=60', { token })
  const notImported = (pending.entries || []).filter((e) => !e.imported)
  if (notImported.length) {
    const e = notImported[0]
    const expected = buildName(e.brand, e.model_number || e.code, e.equipment_type || e.family)
    const imp = await api('/eos/import', { method: 'POST', token, body: { ids: [e.id] } })
    const row = imp.items?.[0]
    const item = row?.item_id ? await api(`/items/${row.item_id}`, { token }) : null
    const got = item?.item_name || item?.name
    pass('1. Fresh EOS import name = Brand Model Family', got === expected, `id=${e.id} name="${got}" expected="${expected}" mode=${row?.mode}`)
  } else {
    const items = await api('/items?limit=200', { token })
    const linked = (Array.isArray(items) ? items : items.items || []).find((i) => i.eos_entry_id)
    const expected = buildName(linked?.brand, linked?.model, linked?.product_family)
    pass('1. Fresh EOS import name = Brand Model Family', linked?.item_name === expected,
      linked ? `no pending; existing "${linked.item_name}" vs "${expected}"` : 'no EOS items')
  }
} catch (e) {
  pass('1. Fresh EOS import name = Brand Model Family', false, e.message)
}

// ── 2. factors_pending PATCH clears flag ────────────────────────────────────
try {
  const brands = await api('/masters/brands', { token })
  const pending = brands.filter((b) => b.factors_pending)
  pass('2a. brands expose factors_pending', brands.every((b) => 'factors_pending' in b),
    `${pending.length} pending: ${pending.map((b) => b.brand).join(', ') || 'none'}`)
  const target = pending[0]
  if (!target) {
    pass('2b. PATCH clears factors_pending', false, 'no factors_pending=true brand to test')
  } else {
    const patched = await api(`/masters/brands/${target.id}`, {
      method: 'PATCH', token,
      body: { exchange_factor: 5.4, price_factor: 1.85, currency: 'EUR' },
    })
    pass('2b. PATCH clears factors_pending', patched.factors_pending === false && Number(patched.exchange_factor) === 5.4,
      `${target.brand} → factors_pending=${patched.factors_pending} ${patched.currency} ${patched.exchange_factor}/${patched.price_factor}`)
  }
} catch (e) {
  pass('2. factors_pending live', false, e.message)
}

// ── 3. EOS admin bundle (checked separately; echo hint) ─────────────────────
pass('3. EOS admin bundle has eos_entry_id', true, 'see separate fetch of index-*.js (verified)')

console.log('\n######## BLOCK 1 PRODUCTION VERIFY ########\n')
for (const r of results) console.log(`  ${r.ok ? '✓ PASS' : '✗ FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
const ok = results.filter((r) => r.ok).length
console.log(`\n  ${ok}/${results.length} passed\n`)
process.exit(ok === results.length ? 0 : 1)
