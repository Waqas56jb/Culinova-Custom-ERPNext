/**
 * S5B2 — production E2E prep (read + light confirm, no destructive changes).
 * BASE defaults to prod.
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { supabase } from '../src/config/supabase.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const BASE = (process.env.BASE || 'https://culinova-backend.vercel.app/api').replace(/\/$/, '')
const PASS = 'admin@123!'
const CUST_PASS = 'cust@123!'

async function login(email, password = PASS) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, token: body.token, user: body.user, error: body.error }
}

async function api(token, p) {
  const res = await fetch(`${BASE}${p}`, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

console.log('\n======== S5B2 PROD PREP ========')
console.log('BASE', BASE)

const health = await fetch(`${BASE}/health`).then((r) => r.json())
console.log('HEALTH', JSON.stringify(health))

const accounts = [
  ['admin', 'admin@gmail.com', PASS],
  ['ali', 'ali@culinova.sa', PASS],
]
const { data: whUsers } = await supabase.from('users').select('email, name, role').ilike('role', '%warehouse%').limit(5)
const { data: stockUsers } = await supabase.from('users').select('email, name, role').or('role.ilike.%Stock%,role.ilike.%warehouse%').limit(10)
console.log('\nWarehouse/Stock users in DB:')
for (const u of [...(whUsers || []), ...(stockUsers || [])]) {
  console.log(`  ${u.email} | ${u.role} | ${u.name}`)
}

const { data: custUsers } = await supabase.from('users').select('email, name, role').eq('role', 'Customer').limit(15)
console.log('\nCustomer portal users:')
for (const u of custUsers || []) console.log(`  ${u.email} | ${u.name}`)

// Try common warehouse emails
for (const email of ['warehouse@culinova.sa', 'stock@culinova.sa', 'muhammad@culinova.sa', 'ali.warehouse@culinova.sa']) {
  accounts.push(['probe', email, PASS])
}

console.log('\n-- Login probes --')
const okLogins = {}
for (const [label, email, pw] of accounts) {
  const r = await login(email, pw)
  const key = `${label}:${email}`
  console.log(`${r.token ? 'OK' : 'FAIL'} ${email} status=${r.status} role=${r.user?.role || r.error || ''}`)
  if (r.token) okLogins[email] = r
}

// Portal customer — try waqas emails
for (const [email, pw] of [
  ['waqas56jb@gmail.com', CUST_PASS],
  ['waqas56jb@gmail.com', PASS],
  ['waqas@culinova.sa', CUST_PASS],
  ['waqas@gmail.com', CUST_PASS],
]) {
  const r = await login(email, pw)
  console.log(`${r.token ? 'OK' : 'FAIL'} portal ${email} / ${pw === PASS ? 'admin-pass' : 'cust@123!'} status=${r.status} role=${r.user?.role || r.error || ''}`)
  if (r.token) okLogins[email] = r
}

const adminTok = okLogins['admin@gmail.com']?.token
if (!adminTok) {
  console.error('Admin login failed — abort data probe')
  process.exit(1)
}

// FAGOR brand + hero item
const { data: fagorBrand } = await supabase.from('brands').select('*').ilike('brand', '%fagor%').limit(3)
console.log('\n-- FAGOR brands --')
for (const b of fagorBrand || []) {
  console.log(`  ${b.brand} exch=${b.exchange_factor} pf=${b.price_factor} curr=${b.currency}`)
}

const { data: fagorItems } = await supabase.from('items')
  .select('id, item_code, item_name, model, brand, valuation_rate, selling_price, landed_cost, available_qty, qty, reserved_qty')
  .ilike('brand', '%fagor%')
  .eq('disabled', false)
  .order('selling_price', { ascending: false })
  .limit(8)
console.log('\n-- FAGOR items (top sell) --')
for (const i of fagorItems || []) {
  const vr = Number(i.valuation_rate) || 0
  const b = (fagorBrand || [])[0]
  const expect = b ? Math.round(vr * Number(b.exchange_factor) * Number(b.price_factor) * 100) / 100 : null
  console.log(`  ${i.model || '-'} | ${i.item_name} | VR=${vr} sell=${i.selling_price} expect≈${expect} code=${i.item_code}`)
}

// Low stock: available ~2
const { data: stockRows } = await supabase.from('stock_balances')
  .select('item_id, warehouse, qty, reserved, items(item_code, item_name, model, brand, selling_price, valuation_rate)')
  .gt('qty', 0)
  .order('qty', { ascending: true })
  .limit(25)
console.log('\n-- Low stock candidates (qty small) --')
for (const s of stockRows || []) {
  const avail = Number(s.qty) - Number(s.reserved || 0)
  if (avail <= 0 || avail > 5) continue
  const it = s.items
  console.log(`  avail=${avail} phys=${s.qty} res=${s.reserved} | ${it?.model} ${it?.item_name} | ${it?.brand} sell=${it?.selling_price}`)
}

// Blender known from S2
const { data: blender } = await supabase.from('items').select('item_code, item_name, model, brand, valuation_rate, selling_price').ilike('model', '%150193%').limit(3)
console.log('\n-- Bartscher blender --', blender)

// waqas credit / overdue
const { data: waqasParty } = await supabase.from('parties').select('id, name, email, credit_limit, outstanding, overdue_amount, status').or('name.ilike.%waqas%,email.ilike.%waqas%').limit(5)
console.log('\n-- waqas parties --', waqasParty)

const { data: overdue } = await supabase.from('parties').select('name, email, outstanding, overdue_amount, credit_limit').gt('overdue_amount', 0).limit(5)
console.log('\n-- overdue parties --', overdue)

// SMTP: health-ish — try send on a Draft complete quote if any (report only whether smtp configured via dry)
console.log('\n-- SMTP env on THIS machine (not Vercel) --', {
  host: !!process.env.SMTP_HOST,
  from: process.env.SMTP_FROM || null,
})

console.log('\n======== END PREP ========')
