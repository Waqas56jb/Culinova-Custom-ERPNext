/**
 * S3B2 manual eyes-on driver (API parity for A–D)
 * Uses live customer "waqas", Ali sales, Admin approve, real SMTP send.
 * Tagged quotes cleaned at end unless --keep
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import jwt from 'jsonwebtoken'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const { supabase } = await import('../src/config/supabase.js')
const { env } = await import('../src/config/env.js')
const { creditStatus } = await import('../src/core/customerCredit.js')

const BASE = (process.env.BASE || `http://localhost:${process.env.PORT || 5050}/api`).replace(/\/$/, '')
const KEEP = process.argv.includes('--keep')
const CUSTOMER = 'waqas'
const EMAIL_TO = 'waqas56jb@gmail.com'
const TAG = `EYES-${Date.now().toString().slice(-5)}`
const results = []
const pass = (id, ok, detail = '') => {
  results.push({ id, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}${detail ? ` — ${detail}` : ''}`)
}
const secret = process.env.JWT_SECRET || env.jwtSecret

const j = async (res) => {
  const text = await res.text()
  try { return text ? JSON.parse(text) : {} } catch { return { error: text } }
}
async function login(email, password = 'admin@123!') {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return (await j(res)).token
}
async function tokenFor(email, password = 'admin@123!') {
  let t = await login(email, password)
  if (t) return t
  const { data: u } = await supabase.from('users').select('id, name, email, role, access_level, status').eq('email', email).maybeSingle()
  if (!u || (u.status && u.status !== 'Active')) return null
  return jwt.sign(
    { id: u.id, name: u.name, email: u.email, role: u.role, access_level: u.access_level },
    secret, { expiresIn: '8h' },
  )
}
const api = async (token, p, opts = {}) => {
  const { body, ...rest } = opts
  const res = await fetch(`${BASE}${p}`, {
    ...rest,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(rest.headers || {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: await j(res) }
}

console.log('\n######## S3B2 MANUAL EYES-ON (API DRIVER) ########\n')

const cleanup = { quotes: [], opps: [], invoices: [], overrides: [] }

try {
  const adminToken = await tokenFor('admin@gmail.com')
  const aliToken = await tokenFor('ali@culinova.sa')
  const { data: adminUser } = await supabase.from('users').select('id, name').eq('email', 'admin@gmail.com').maybeSingle()
  const { data: waqasUser } = await supabase.from('users').select('id, name, email').eq('role', 'Customer').ilike('name', CUSTOMER).maybeSingle()
  pass('setup admin', !!adminToken)
  pass('setup Ali', !!aliToken, aliToken ? 'ali@culinova.sa' : 'missing')
  pass('setup portal waqas', !!waqasUser?.id, waqasUser?.name || '')
  pass('setup SMTP env', !!(process.env.SMTP_HOST && process.env.SMTP_FROM && process.env.SMTP_PASS))

  // UI source (amber banner + credit card) — browser would show these
  const qSrc = fs.readFileSync(path.resolve(__dirname, '../../client/src/pages/Quotations.jsx'), 'utf8')
  const partySrc = fs.readFileSync(path.resolve(__dirname, '../../client/src/components/PartyDetailModal.jsx'), 'utf8')
  pass('UI A banner code', /overdue balance SAR/.test(qSrc) && /creditWarn/.test(qSrc))
  pass('UI D Credit card code', /Credit/.test(partySrc) && /overdue_amount/.test(partySrc) && /Wallet/.test(partySrc))
  pass('UI C overdue confirm', /CREDIT_OVERDUE_CONFIRM/.test(qSrc) && /send anyway/.test(qSrc))
  pass('UI B credit override msg', /CREDIT_OVERRIDE_REQUIRED|requires_approval|Credit override/.test(qSrc + fs.readFileSync(path.resolve(__dirname, '../../client/src/components/NotificationBell.jsx'), 'utf8')))

  // Ensure overdue invoice
  await supabase.from('invoices').delete().eq('number', 'INV-S3B2-EYES-WAQAS')
  const past = new Date(); past.setDate(past.getDate() - 21)
  const { data: inv, error: invErr } = await supabase.from('invoices').insert({
    number: 'INV-S3B2-EYES-WAQAS',
    customer: CUSTOMER,
    total: 44970,
    paid: 0,
    due_date: past.toISOString().slice(0, 10),
    status: 'Unpaid',
  }).select().single()
  if (invErr) throw new Error(invErr.message)
  cleanup.invoices.push(inv.id)

  // ── A) credit + create warning ──
  const credit0 = await creditStatus(CUSTOMER)
  pass('A1 overdue SAR 44970', credit0.has_overdue && credit0.overdue_amount === 44970,
    `overdue=${credit0.overdue_amount} active=${credit0.active_quotations_count}`)

  const creditApi = await api(adminToken, `/sales/customers/${encodeURIComponent(CUSTOMER)}/credit`)
  pass('A/D credit API', creditApi.status === 200 && creditApi.body?.overdue_amount === 44970,
    JSON.stringify({ overdue: creditApi.body?.overdue_amount, inv: creditApi.body?.overdue_invoice_count, active: creditApi.body?.active_quotations_count }))

  const { data: item } = await supabase.from('items').select('id')
    .eq('id', '23da79cb-325c-422b-8d7c-48baf51590a2').maybeSingle()
  if (!item?.id) throw new Error('missing FAGOR item')

  const { data: opp, error: oppErr } = await supabase.from('opportunities').insert({
    number: `OPP-${TAG}`,
    customer: CUSTOMER,
    stage: 'Quotation',
    value: 44970,
    probability: 50,
    next_action_date: new Date().toISOString().slice(0, 10),
    opportunity_type: 'Retail Sale',
    project_name: `Eyes ${TAG}`,
    project_location: 'Riyadh → Al Malqa',
    contact_person: 'Waqas',
    customer_email: EMAIL_TO,
    owner_id: adminUser?.id,
  }).select().single()
  if (oppErr) throw new Error(oppErr.message)
  cleanup.opps.push(opp.id)

  const quoteBody = (extra = {}) => ({
    opportunity_id: opp.id,
    customer: CUSTOMER,
    contact_person: 'Waqas',
    project_name: `Eyes ${TAG}`,
    project_location: 'Riyadh → Al Malqa',
    payment_terms: '100% Advanced Payment',
    validity_days: 30,
    customer_email: EMAIL_TO,
    override_reason: 'S3B2 eyes-on',
    items: [{ item_id: item.id, qty: 1 }],
    ...extra,
  })

  const created = await api(adminToken, '/quotations', { method: 'POST', body: quoteBody() })
  pass('A2 create credit_warning (not block)', created.status === 201 && created.body?.credit_warning?.overdue_amount > 0,
    `status=${created.status} warn=${JSON.stringify(created.body?.credit_warning)}`)
  if (created.body?.id) cleanup.quotes.push(created.body.id)

  // ── B) fill to 3 active then Ali 4th ──
  let credit = await creditStatus(CUSTOMER)
  while (credit.active_quotations_count < 3) {
    const r = await api(adminToken, '/quotations', {
      method: 'POST',
      body: quoteBody({ items: [{ item_id: item.id, qty: credit.active_quotations_count + 1 }] }),
    })
    if (r.status !== 201) throw new Error(`fill active failed: ${r.status} ${r.body?.error}`)
    cleanup.quotes.push(r.body.id)
    credit = await creditStatus(CUSTOMER)
  }
  pass('B1 three active ready', credit.active_quotations_count >= 3, `active=${credit.active_quotations_count}`)

  const blocked = await api(aliToken, '/quotations', { method: 'POST', body: quoteBody({ items: [{ item_id: item.id, qty: 1 }] }) })
  pass('B2 Ali 4th → requires_approval', blocked.status === 422 && blocked.body?.requires_approval === true,
    `status=${blocked.status} code=${blocked.body?.code}`)
  const overrideId = blocked.body?.credit_override_request_id
  if (overrideId) cleanup.overrides.push(overrideId)

  const { data: notif } = await supabase.from('notifications').select('id, title, body')
    .eq('user_id', adminUser.id).eq('type', 'credit_override').eq('ref_id', overrideId)
    .eq('action_status', 'pending').maybeSingle()
  pass('B3 Admin bell Credit override', !!notif?.id && /Credit override/i.test(notif?.title || ''),
    notif?.title || 'missing')

  const act = await api(adminToken, `/notifications/${notif.id}/act`, {
    method: 'POST', body: { decision: 'approved' },
  })
  pass('B4 Admin approve', act.status === 200 && act.body?.ok, JSON.stringify(act.body))

  const q4 = await api(aliToken, '/quotations', { method: 'POST', body: quoteBody({ items: [{ item_id: item.id, qty: 1 }] }) })
  pass('B5 Ali create after approve', q4.status === 201 && !!q4.body?.id, `status=${q4.status} ${q4.body?.error || q4.body?.number || ''}`)
  if (q4.body?.id) cleanup.quotes.push(q4.body.id)

  // ── C) Real send ──
  const sendQ = created.body?.id
  await supabase.from('quotations').update({
    status: 'Draft',
    approval_status: 'Approved',
    contact_person: 'Waqas',
    project_name: `Eyes ${TAG}`,
    project_location: 'Riyadh → Al Malqa',
    payment_terms: '100% Advanced Payment',
    validity_days: 30,
    customer_email: EMAIL_TO,
    customer: CUSTOMER,
  }).eq('id', sendQ)

  const warn = await api(adminToken, `/sales/quotations/${sendQ}/send`, { method: 'POST', body: {} })
  pass('C1 send without confirm → 422', warn.status === 422 && warn.body?.code === 'CREDIT_OVERDUE_CONFIRM',
    warn.body?.error || '')

  const sent = await api(adminToken, `/sales/quotations/${sendQ}/send`, {
    method: 'POST', body: { confirm_overdue: true },
  })
  pass('C2 Sent', sent.status === 200 && sent.body?.status === 'Sent', JSON.stringify({ status: sent.body?.status, number: created.body?.number }))
  pass('C3 email SENT (SMTP live)', sent.body?.channels?.email === 'sent',
    JSON.stringify(sent.body?.channels))
  pass('C3b sent_to inbox', sent.body?.sent_to === EMAIL_TO, sent.body?.sent_to || '')
  pass('C4 portal channel', sent.body?.channels?.portal === true, `recipients=${sent.body?.channels?.portal_recipients}`)

  const { data: portalN } = await supabase.from('notifications').select('id, title, type')
    .eq('user_id', waqasUser.id).eq('type', 'quotation_sent').eq('ref_id', sendQ)
  pass('C5 portal notification row', (portalN || []).length >= 1, JSON.stringify(portalN))

  const { data: audits } = await supabase.from('audit_log').select('action, details')
    .eq('entity_id', sendQ).eq('action', 'quotation_sent').order('created_at', { ascending: false }).limit(1)
  pass('C6 audit channels email sent', audits?.[0]?.details?.channels?.email === 'sent',
    JSON.stringify(audits?.[0]?.details?.channels))

  // ── D) Credit card numbers ──
  const after = await api(adminToken, `/sales/customers/${encodeURIComponent(CUSTOMER)}/credit`)
  pass('D Credit card data', after.status === 200 && after.body?.overdue_amount === 44970 && after.body?.overdue_invoice_count >= 1,
    JSON.stringify({
      overdue: after.body?.overdue_amount,
      invoices: after.body?.overdue_invoice_count,
      active: after.body?.active_quotations_count,
    }))

} catch (e) {
  pass('FATAL', false, e.message)
  console.error(e)
} finally {
  if (KEEP) {
    console.log('\n--keep: leaving fixtures (quotes/invoice)\n')
  } else {
    console.log('\n-- cleanup --')
    for (const id of cleanup.quotes) {
      await supabase.from('quotation_items').delete().eq('quotation_id', id)
      await supabase.from('quotation_revisions').delete().eq('quotation_id', id)
      await supabase.from('notifications').delete().eq('ref_id', id)
      await supabase.from('quotations').delete().eq('id', id)
    }
    for (const id of cleanup.opps) await supabase.from('opportunities').delete().eq('id', id)
    for (const id of cleanup.invoices) await supabase.from('invoices').delete().eq('id', id)
    for (const id of cleanup.overrides) await supabase.from('credit_override_requests').delete().eq('id', id)
    await supabase.from('credit_override_requests').delete().ilike('customer', CUSTOMER).eq('status', 'Consumed')
    await supabase.from('invoices').delete().eq('number', 'INV-S3B2-EYES-WAQAS')
    // leave pre-existing waqas quotes alone
    pass('E cleanup', true, `removed ${cleanup.quotes.length} quotes + invoice + opp`)
  }
}

console.log('\n-- summary --')
const failed = results.filter((r) => !r.ok)
const a = results.filter((r) => r.id.startsWith('A') || r.id.startsWith('UI A')).every((r) => r.ok)
const b = results.filter((r) => r.id.startsWith('B')).every((r) => r.ok)
const c = results.filter((r) => r.id.startsWith('C')).every((r) => r.ok)
const d = results.filter((r) => r.id.startsWith('D') || r.id === 'A/D credit API' || r.id.startsWith('UI D')).every((r) => r.ok)
console.log(`A ${a ? '✅' : '❌'} | B ${b ? '✅' : '❌'} | C ${c ? '✅' : '❌'} | D ${d ? '✅' : '❌'} | fails=${failed.length}`)
if (c) console.log(`Email: sent → ${EMAIL_TO}  (check Gmail inbox + spam)`)
console.log(`\n######## ${failed.length ? 'FAIL' : 'PASS'} — ${results.filter((r) => r.ok).length}/${results.length} ########\n`)
process.exit(failed.length ? 1 : 0)
