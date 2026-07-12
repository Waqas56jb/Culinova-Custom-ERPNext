// End-to-end RFQ flow (M4): create RFQ from EOS items → send to suppliers → receive multi-currency
// quotes → compare (base-currency, lowest/fastest, recommended) → award → PO is minted.
// Signs a JWT for REAL users and hits the LIVE API. Self-cleaning. Model: verify_stock_flow.mjs.
// NOTE: 404s until the orchestrator mounts /rfqs — that is expected.
import { supabase } from '../src/config/supabase.js'
import jwt from 'jsonwebtoken'
import { env } from '../src/config/env.js'
const BASE = process.env.BASE || 'http://localhost:5050/api'
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
let pass = 0, fail = 0
const ok = (c, m) => { c ? (pass++, console.log('  ✓', m)) : (fail++, console.log('  ✗ FAIL', m)) }

const tok = (u) => jwt.sign({ id: u.id, name: u.name, email: u.email, role: u.role, access_level: u.access_level }, env.jwtSecret, { expiresIn: '1h' })

// admin = Management / Full Admin (procurement panel + approve). pm = Project Manager / Edit (procurement
// panel but NO approve → must be blocked from award).
const { data: admin } = await supabase.from('users').select('*').eq('email', 'admin@gmail.com').single()
const { data: pm } = await supabase.from('users').select('*').eq('email', 'pm@gmail.com').maybeSingle()
const AH = { authorization: `Bearer ${tok(admin)}`, 'content-type': 'application/json' }
const PH = pm ? { authorization: `Bearer ${tok(pm)}`, 'content-type': 'application/json' } : null

let rfqId = null

console.log('\n######## RFQ MANAGEMENT (M4) ########')
try {
  // two EOS-linked items straight from the Item Master
  const { data: eosItems } = await supabase.from('items').select('id, item_name, specifications, eos_entry_id')
    .not('eos_entry_id', 'is', null).limit(2)
  ok((eosItems || []).length >= 1, `EOS-linked items available: ${(eosItems || []).length}`)
  const it0 = eosItems?.[0]
  const it1 = eosItems?.[1] || eosItems?.[0]

  console.log('\n[1] CREATE RFQ (multi-item, linked to EOS items)')
  const created = await fetch(`${BASE}/rfqs`, { method: 'POST', headers: AH, body: JSON.stringify({
    project_name: 'ZZ RFQ Test Project', due_date: '2026-12-31', notes: 'ZZ verify RFQ',
    items: [{ item_id: it0?.id, qty: 3 }, { item_id: it1?.id, qty: 2 }],
  }) }).then(j)
  ok(created?.id && created?.number?.startsWith('RFQ'), `RFQ created ${created?.number} (${created?.status})`)
  rfqId = created?.id
  ok((created?.items || []).length >= 1, `rfq_items rows: ${(created?.items || []).length}`)
  const specCopied = (created?.items || []).some((li) => li.specifications && it0?.specifications && li.specifications === it0.specifications)
  ok(specCopied || !it0?.specifications, 'item specification copied onto the rfq_item (supplier sees the spec)')

  console.log('\n[2] GET detail')
  const detail = await fetch(`${BASE}/rfqs/${rfqId}`, { headers: AH }).then(j)
  ok(detail?.id === rfqId && Array.isArray(detail?.items) && Array.isArray(detail?.suppliers) && Array.isArray(detail?.quotes), 'detail returns items + suppliers + quotes + comparison')

  console.log('\n[3] SEND to suppliers (idempotent)')
  const send1 = await fetch(`${BASE}/rfqs/${rfqId}/suppliers`, { method: 'POST', headers: AH, body: JSON.stringify({ suppliers: ['ZZ Supplier A', 'ZZ Supplier B'] }) }).then(j)
  ok(Array.isArray(send1) && send1.length === 2 && send1.every((s) => s.status === 'Sent'), `sent to ${Array.isArray(send1) ? send1.length : '?'} suppliers, status Sent`)
  const send2 = await fetch(`${BASE}/rfqs/${rfqId}/suppliers`, { method: 'POST', headers: AH, body: JSON.stringify({ suppliers: ['ZZ Supplier A', 'ZZ Supplier B'] }) }).then(j)
  ok(Array.isArray(send2) && send2.length === 2, `idempotent re-send → still ${Array.isArray(send2) ? send2.length : '?'} rows (no duplicates)`)
  const afterSend = await fetch(`${BASE}/rfqs/${rfqId}`, { headers: AH }).then(j)
  ok(afterSend?.status === 'Sent' && !!afterSend?.sent_at, `RFQ marked Sent + sent_at stamped`)

  console.log('\n[4] RECEIVE quotes (multi-currency)')
  // A: 1000 USD (base 3750) lead 5 (fastest) · B: 3000 SAR (base 3000, lowest) lead 10
  const qa = await fetch(`${BASE}/rfqs/${rfqId}/quotes`, { method: 'POST', headers: AH, body: JSON.stringify({ supplier: 'ZZ Supplier A', quote: 1000, currency: 'USD', lead_time_days: 5, validity_days: 30 }) }).then(j)
  ok(qa?.id && qa?.currency === 'USD', `quote A recorded (${qa?.quote} ${qa?.currency})`)
  const qb = await fetch(`${BASE}/rfqs/${rfqId}/quotes`, { method: 'POST', headers: AH, body: JSON.stringify({ supplier: 'ZZ Supplier B', quote: 3000, currency: 'SAR', lead_time_days: 10, validity_days: 30 }) }).then(j)
  ok(qb?.id && qb?.currency === 'SAR', `quote B recorded (${qb?.quote} ${qb?.currency})`)
  // upsert: re-quote A → still one row, updated
  await fetch(`${BASE}/rfqs/${rfqId}/quotes`, { method: 'POST', headers: AH, body: JSON.stringify({ supplier: 'ZZ Supplier A', quote: 1100, currency: 'USD', lead_time_days: 5 }) }).then(j)
  const { data: qrows } = await supabase.from('rfq_quotes').select('*').eq('rfq_id', rfqId)
  ok((qrows || []).length === 2, `re-quote upserts (2 quote rows, not 3)`)
  const supA = (await fetch(`${BASE}/rfqs/${rfqId}`, { headers: AH }).then(j)).suppliers.find((s) => s.supplier === 'ZZ Supplier A')
  ok(supA?.status === 'Responded', 'supplier A flipped to Responded')

  console.log('\n[5] COMPARE (base-currency, flags, recommendation)')
  const cmp = await fetch(`${BASE}/rfqs/${rfqId}/compare`, { headers: AH }).then(j)
  ok(cmp?.base_currency === 'SAR' && (cmp?.rows || []).length === 2, `comparison in ${cmp?.base_currency} with ${(cmp?.rows || []).length} rows`)
  const rowA = cmp.rows.find((x) => x.supplier === 'ZZ Supplier A')
  const rowB = cmp.rows.find((x) => x.supplier === 'ZZ Supplier B')
  ok(rowA?.base_quote === 4125 && rowB?.base_quote === 3000, `USD 1100 → base ${rowA?.base_quote} (expect 4125); SAR 3000 → ${rowB?.base_quote}`)
  ok(rowB?.is_lowest === true && rowA?.is_lowest !== true, 'B flagged is_lowest (cheapest in base currency)')
  ok(rowA?.is_fastest === true && rowB?.is_fastest !== true, 'A flagged is_fastest (5 vs 10 days)')
  ok(cmp?.recommended === 'ZZ Supplier B', `recommended = cheapest = ${cmp?.recommended}`)

  console.log('\n[6] AWARD is blocked without approve')
  if (PH) {
    const denied = await fetch(`${BASE}/rfqs/${rfqId}/award`, { method: 'POST', headers: PH, body: JSON.stringify({ supplier: 'ZZ Supplier B' }) })
    ok(denied.status === 403, `Project Manager (Edit) award → HTTP ${denied.status} (expect 403)`)
  } else { ok(true, 'no pm@gmail.com account — skipped approve-guard check') }

  console.log('\n[7] AWARD with no quote → 422')
  const noQuote = await fetch(`${BASE}/rfqs/${rfqId}/award`, { method: 'POST', headers: AH, body: JSON.stringify({ supplier: 'ZZ Ghost Supplier' }) })
  ok(noQuote.status === 422, `award unquoted supplier → HTTP ${noQuote.status} (expect 422)`)

  console.log('\n[8] AWARD → PO is minted')
  const award = await fetch(`${BASE}/rfqs/${rfqId}/award`, { method: 'POST', headers: AH, body: JSON.stringify({ supplier: 'ZZ Supplier B' }) }).then(j)
  ok(award?.rfq?.status === 'Awarded' && award?.rfq?.awarded_supplier === 'ZZ Supplier B' && !!award?.rfq?.awarded_at, 'RFQ status Awarded + awarded_supplier + awarded_at')
  ok(award?.po?.number?.startsWith('PO') && Number(award?.po?.amount) === 3000 && award?.po?.rfq_id === rfqId && award?.po?.status === 'Pending', `PO ${award?.po?.number} amount ${award?.po?.amount} linked to RFQ, status Pending`)
  const { data: awardedQuote } = await supabase.from('rfq_quotes').select('is_awarded').eq('rfq_id', rfqId).ilike('supplier', 'ZZ Supplier B').maybeSingle()
  ok(awardedQuote?.is_awarded === true, 'winning quote flagged is_awarded')
} catch (e) {
  ok(false, 'unexpected error: ' + e.message)
}

console.log('\n[9] CLEANUP')
if (rfqId) {
  await supabase.from('purchase_orders').delete().eq('rfq_id', rfqId)
  await supabase.from('rfqs').delete().eq('id', rfqId) // cascades rfq_items / rfq_suppliers / rfq_quotes
  console.log('  removed test PO + RFQ (children cascade)')
}

console.log(`\n######## RESULT: ${pass} passed, ${fail} failed ########`)
process.exit(fail ? 1 : 0)
