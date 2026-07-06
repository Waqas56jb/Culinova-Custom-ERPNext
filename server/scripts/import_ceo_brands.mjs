// Idempotent import of the CEO's 180 real brands (Exchange + Pricing Factor + countries) from the Brands sheet.
import XLSX from 'xlsx'; import fs from 'fs'
const BASE = process.env.BASE || 'http://localhost:5050/api'
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
const login = async (e, p) => (await j(await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: e, password: p }) }))).token
const t = await login('admin@gmail.com', 'admin@123!')
const H = { authorization: `Bearer ${t}`, 'content-type': 'application/json' }

const wb = XLSX.read(fs.readFileSync('../ITEM MASTER CUILINVA 2.xlsb'))
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Brands'], { header: 1, defval: '' }).slice(1)
const brands = rows.map((r) => ({
  brand: String(r[1] || '').trim(),
  country_of_origin: String(r[2] || '').trim() || null,
  country_of_purchase: String(r[3] || '').trim() || null,
  exchange_factor: Number(r[4]) || 1,
  price_factor: Number(r[5]) || 1,
})).filter((b) => b.brand)

const existing = await fetch(`${BASE}/masters/brands`, { headers: H }).then(j)
const byName = new Map((existing || []).map((b) => [b.brand.toLowerCase(), b]))

let created = 0, updated = 0, failed = 0
for (const b of brands) {
  const cur = byName.get(b.brand.toLowerCase())
  try {
    if (cur) {
      await fetch(`${BASE}/masters/brands/${cur.id}`, { method: 'PATCH', headers: H, body: JSON.stringify(b) }).then(j)
      updated++
    } else {
      const res = await fetch(`${BASE}/masters/brands`, { method: 'POST', headers: H, body: JSON.stringify(b) }).then(j)
      if (res && res.id) created++; else { failed++; console.log('  ✗', b.brand, JSON.stringify(res)) }
    }
  } catch (e) { failed++; console.log('  ✗', b.brand, e.message) }
}
console.log(`\nBrands: ${created} created, ${updated} updated, ${failed} failed (of ${brands.length})`)
const total = await fetch(`${BASE}/masters/brands`, { headers: H }).then(j)
console.log('Total brands in DB now:', (total || []).length)
