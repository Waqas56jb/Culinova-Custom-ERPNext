/**
 * S3B2 eyes-on seed — overdue customer + invoice for browser round.
 * Prints names/IDs. Cleanup: node scripts/seed_s3b2_eyeson.mjs --cleanup
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const { supabase } = await import('../src/config/supabase.js')

const cleanup = process.argv.includes('--cleanup')
const TAG = 'S3B2-EYES'
const customerName = 'S3B2 Eyes Overdue'
const invNumber = `INV-${TAG}`

if (cleanup) {
  const { data: quotes } = await supabase.from('quotations').select('id').ilike('customer', customerName)
  for (const q of quotes || []) {
    await supabase.from('quotation_items').delete().eq('quotation_id', q.id)
    await supabase.from('quotation_revisions').delete().eq('quotation_id', q.id)
    await supabase.from('notifications').delete().eq('ref_id', q.id)
    await supabase.from('quotations').delete().eq('id', q.id)
  }
  await supabase.from('credit_override_requests').delete().ilike('customer', customerName)
  await supabase.from('invoices').delete().eq('number', invNumber)
  await supabase.from('messages').delete().ilike('customer_name', customerName)
  await supabase.from('opportunities').delete().ilike('customer', customerName)
  // keep customer master row optional wipe:
  await supabase.from('customers').delete().eq('name', customerName)
  console.log('CLEANUP done for', customerName)
  process.exit(0)
}

const pastDue = new Date()
pastDue.setDate(pastDue.getDate() - 21)

await supabase.from('customers').upsert({
  name: customerName,
  cr_number: 'CR-S3B2-EYES',
  vat_number: 'VAT-S3B2-EYES',
  national_address: 'Riyadh',
  billing_address: 'Riyadh',
  email: 'waqas56jb@gmail.com',
  contact: 'Waqas Eyes',
  status: 'Active',
}, { onConflict: 'name' })

await supabase.from('invoices').delete().eq('number', invNumber)
const { data: inv, error: invErr } = await supabase.from('invoices').insert({
  number: invNumber,
  customer: customerName,
  total: 44970,
  paid: 0,
  due_date: pastDue.toISOString().slice(0, 10),
  status: 'Unpaid',
}).select().single()
if (invErr) {
  console.error('invoice fail', invErr.message)
  process.exit(1)
}

const { data: opp } = await supabase.from('opportunities').select('id, number').ilike('customer', customerName).eq('stage', 'Quotation').limit(1).maybeSingle()
let oppId = opp?.id
let oppNumber = opp?.number
if (!oppId) {
  const { data: admin } = await supabase.from('users').select('id').eq('email', 'admin@gmail.com').maybeSingle()
  const { data: created, error: oErr } = await supabase.from('opportunities').insert({
    number: `OPP-${TAG}`,
    customer: customerName,
    stage: 'Quotation',
    value: 44970,
    probability: 50,
    next_action_date: new Date().toISOString().slice(0, 10),
    opportunity_type: 'Retail Sale',
    project_name: 'S3B2 Eyes Project',
    project_location: 'Riyadh → Al Malqa',
    contact_person: 'Waqas Eyes',
    customer_email: 'waqas56jb@gmail.com',
    owner_id: admin?.id || null,
  }).select().single()
  if (oErr) {
    console.error('opp fail', oErr.message)
    process.exit(1)
  }
  oppId = created.id
  oppNumber = created.number
}

const { creditStatus } = await import('../src/core/customerCredit.js')
const credit = await creditStatus(customerName)

console.log(`
======== S3B2 EYES-ON SEED READY ========
Customer:     ${customerName}
Invoice:      ${inv.number}  due=${inv.due_date}  outstanding=SAR ${inv.total}
Opportunity:  ${oppNumber}  id=${oppId}
Credit:       overdue=SAR ${credit.overdue_amount}  active_quotes=${credit.active_quotations_count}  blocked=${credit.blocked}
Email to:     waqas56jb@gmail.com  (Send will hit this inbox)
Portal:       match customer name OR use waqas if you rename — for portal notify, Customer user.name must = "${customerName}"
              (or send on a quote whose customer matches portal user "waqas" after editing customer field)

Browser A–D:
  A) Builder → customer "${customerName}" → amber overdue SAR ${credit.overdue_amount}
  B) Create 3 quotes (Admin OK) then 4th as Ali/Sales → credit override bell
  C) Send complete Draft → overdue confirm → check inbox + portal
  D) Customer Master → Manage "${customerName}" → Credit card

Cleanup later:
  node scripts/seed_s3b2_eyeson.mjs --cleanup
=========================================
`)
