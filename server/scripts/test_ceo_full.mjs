// End-to-end CEO Item Master verification: import (CEO headers) → pricing chain → redaction → masters → cleanup
const BASE = process.env.BASE || 'http://localhost:5050/api'
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
const login = async (email, password) => { const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) }); const d = await j(r); if (!d.token) throw new Error('login failed ' + email + ': ' + JSON.stringify(d)); return d.token }
const H = (t) => ({ 'content-type': 'application/json', authorization: `Bearer ${t}` })
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m) } else { fail++; console.log('  ✗ FAIL:', m) } }

const admin = await login('admin@gmail.com', 'admin@123!')
console.log('\n[1] Admin logged in')

// ── Ensure a Sales user exists for redaction test ──
let salesTok = null
try { salesTok = await login('sales.test@culinova.local', 'sales@123!') } catch {
  await fetch(`${BASE}/users`, { method: 'POST', headers: H(admin), body: JSON.stringify({ name: 'Sales Test', email: 'sales.test@culinova.local', password: 'sales@123!', role: 'Sales User', access_level: 'Create', department: 'Sales' }) }).then(j)
  try { salesTok = await login('sales.test@culinova.local', 'sales@123!') } catch (e) { console.log('  (sales user unavailable:', e.message, ')') }
}

// ── [2] Import a CEO-format row (original CEO headers) ──
console.log('\n[2] CEO-format import (original headers + pricing chain)')
const rows = [{
  'Item Group': 'Cooking Equipment', 'sub Item Group': 'Ranges', 'Product family': 'Open Burner Range',
  'Brand': 'CEOBrand', 'Model No.': 'OB-6', 'Model Name': '6 Open Burner Range',
  'Dimensions': '900x700x850', 'Power type': 'Gas', 'Product Type': 'Item',
  'country of origin': 'Italy', 'Currency': 'EUR',
  'Supplier Net Price': 1000, 'Exchange Factor': 5, 'Price Factor': 1.75,
  'Add Margin %': 3, 'Special Offer %': 0,
  'Stock Item': 'Yes', 'Status': 'Active', 'Show Room': 'checked', 'Local Purchasing': 'No',
  'SN Control': 'Yes', 'Alternatives Note': 'See MB-6 equivalent',
}]
const imp = await fetch(`${BASE}/items/import`, { method: 'POST', headers: H(admin), body: JSON.stringify({ rows }) }).then(j)
ok(imp.created === 1 && imp.failed === 0, `import created=${imp.created} failed=${imp.failed} ${imp.errors ? JSON.stringify(imp.errors) : ''}`)

// ── [3] Fetch created item and verify all fields ──
const list = await fetch(`${BASE}/items?search=OB-6`, { headers: H(admin) }).then(j)
const arr = Array.isArray(list) ? list : (list.items || list.data || [])
const it = arr.find((x) => x.model === 'OB-6')
ok(!!it, 'item found by model OB-6')
if (it) {
  ok(it.item_name === '6 Open Burner Range', `item_name = "${it.item_name}"`)
  ok(it.product_family === 'Open Burner Range', `product_family = "${it.product_family}"`)
  ok(it.dimensions === '900x700x850', `dimensions = "${it.dimensions}"`)
  ok((it.power_type || '').toLowerCase() === 'gas', `power_type = "${it.power_type}"`)
  ok(it.currency === 'EUR', `currency = "${it.currency}"`)
  ok(it.show_room === true, `show_room = ${it.show_room}`)
  ok(it.local_purchasing === false, `local_purchasing = ${it.local_purchasing}`)
  ok(it.alternatives_note === 'See MB-6 equivalent', `alternatives_note = "${it.alternatives_note}"`)
  // Pricing chain: 1000 × 5 = 5000 landed → × 1.75 = 8750 calc → × 1.03 = 9012.5 selling
  ok(Math.abs(it.landed_cost - 5000) < 0.01, `landed_cost = ${it.landed_cost} (expect 5000)`)
  ok(Math.abs(it.calculated_sale_price - 8750) < 0.01, `calculated_sale_price = ${it.calculated_sale_price} (expect 8750)`)
  ok(Math.abs(it.selling_price - 9012.5) < 0.01, `selling_price = ${it.selling_price} (expect 9012.5)`)
  const gp = ((it.selling_price - it.landed_cost) / it.selling_price) * 100
  ok(Math.abs((it.gp_percent ?? gp) - 44.52) < 0.5, `gp_percent ≈ ${it.gp_percent ?? gp.toFixed(2)} (expect ~44.52)`)
}

// ── [4] Redaction: Sales must NOT see cost/landed/gp/factors ──
console.log('\n[4] Cost redaction for Sales User')
if (salesTok && it) {
  const sList = await fetch(`${BASE}/items?search=OB-6`, { headers: H(salesTok) }).then(j)
  const sArr = Array.isArray(sList) ? sList : (sList.items || sList.data || [])
  const sIt = sArr.find((x) => x.model === 'OB-6')
  ok(!!sIt, 'sales can see the item')
  if (sIt) {
    ok(sIt.selling_price != null, `sales SEES selling_price = ${sIt.selling_price}`)
    ok(sIt.landed_cost == null, `sales cannot see landed_cost (${sIt.landed_cost})`)
    ok(sIt.supplier_price == null, `sales cannot see supplier_price (${sIt.supplier_price})`)
    ok(sIt.gp_percent == null, `sales cannot see gp_percent (${sIt.gp_percent})`)
    ok(sIt.price_factor == null, `sales cannot see price_factor (${sIt.price_factor})`)
    ok(sIt.avg_cost == null, `sales cannot see avg_cost (${sIt.avg_cost})`)
  }
} else console.log('  (skipped — no sales token)')

// ── [5] Brand with country fields ──
console.log('\n[5] Brand master with country_of_origin / country_of_purchase')
const br = await fetch(`${BASE}/masters/brands`, { method: 'POST', headers: H(admin), body: JSON.stringify({ brand: 'CEOBrand', currency: 'EUR', exchange_factor: 5, price_factor: 1.75, country_of_origin: 'Italy', country_of_purchase: 'KSA' }) }).then(j)
const brands = await fetch(`${BASE}/masters/brands`, { headers: H(admin) }).then(j)
const brRec = (brands || []).find((b) => b.brand === 'CEOBrand')
ok(!!brRec, 'CEOBrand present in brands')
if (brRec) {
  ok(brRec.country_of_origin === 'Italy', `country_of_origin = "${brRec.country_of_origin}"`)
  ok(brRec.country_of_purchase === 'KSA', `country_of_purchase = "${brRec.country_of_purchase}"`)
}

// ── [6] Product family auto-created on import ──
console.log('\n[6] Product Family auto-created')
const fams = await fetch(`${BASE}/masters/product-families`, { headers: H(admin) }).then(j)
ok((fams || []).some((f) => f.name === 'Open Burner Range'), 'product family "Open Burner Range" exists')

// ── [7] CLEANUP test data ──
console.log('\n[7] Cleanup')
if (it) { await fetch(`${BASE}/items/${it.id}`, { method: 'DELETE', headers: H(admin) }).then(j); console.log('  · deleted test item OB-6') }
if (brRec) { await fetch(`${BASE}/masters/brands/${brRec.id}`, { method: 'DELETE', headers: H(admin) }).then(j).catch(() => {}); console.log('  · deleted CEOBrand (if delete route exists)') }
const fam = (fams || []).find((f) => f.name === 'Open Burner Range')
if (fam) { await fetch(`${BASE}/masters/product-families/${fam.id}`, { method: 'DELETE', headers: H(admin) }).then(j).catch(() => {}); console.log('  · deleted test product family') }

console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`)
process.exit(fail ? 1 : 0)
