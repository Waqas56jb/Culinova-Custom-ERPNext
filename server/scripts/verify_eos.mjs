// End-to-end EOS integration flow: status → pending queue → detail preview → import (approved only,
// de-duped) → version history → read-only enforcement (validate-edit) → re-sync → RBAC. Hits the LIVE
// API as the REAL Stock User (warehouse@culinova.sa) and is fully self-cleaning.
// Model: server/scripts/verify_stock_flow.mjs. NOTE: 404s until the orchestrator mounts /eos.
import { supabase } from '../src/config/supabase.js'
import jwt from 'jsonwebtoken'
import { env } from '../src/config/env.js'
import { EOS_OWNED_FIELDS } from '../src/core/eosfields.js'

const BASE = process.env.BASE || 'http://localhost:5050/api'
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
let pass = 0, fail = 0
const ok = (c, m) => { c ? (pass++, console.log('  ✓', m)) : (fail++, console.log('  ✗ FAIL', m)) }

// act as the real Item Master user (Stock User → warehouse panel) — proves RBAC for the actual role
const { data: u } = await supabase.from('users').select('*').eq('email', 'warehouse@culinova.sa').single()
const token = jwt.sign({ id: u.id, name: u.name, email: u.email, role: u.role, access_level: u.access_level }, env.jwtSecret, { expiresIn: '1h' })
const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

console.log('\n######## EOS INTEGRATION FLOW (as Stock User) ########')

// cleanup handles (populated as we go)
let itemId = null, candBM = null, candFam = null
let brandsBefore = new Set(), famBefore = new Set()
// sync-all snapshot so [10] is fully self-cleaning (it legitimately bumps every EOS-linked item that
// lacks a stored hash; we restore those items + drop the version rows it writes so a re-run leaves no trace)
let preState = new Map(), preVerIds = new Set(), syncAllRan = false

try {
  console.log('\n[1] STATUS strip')
  const status = await fetch(`${BASE}/eos/status`, { headers: H }).then(j)
  ok(status && typeof status.total_items === 'number', `GET /eos/status -> ${status.total_items} items · ${status.eos_linked} EOS-linked · ${status.pending_approved} pending`)

  console.log('\n[2] PENDING queue (approved, marked imported:true/false)')
  const pend = await fetch(`${BASE}/eos/pending?page=1`, { headers: H }).then(j)
  ok(Array.isArray(pend.entries), `GET /eos/pending -> ${(pend.entries || []).length} approved, ${pend.pending} to import`)

  // pick a GUARANTEED-create candidate: not EOS-linked AND no existing item shares brand+model
  // (so import creates a fresh row we fully own and can delete — never mutating pre-existing data).
  let cand = null
  for (const e of (pend.entries || []).filter((x) => !x.imported)) {
    const brand = e.brand, model = e.model_number || e.code
    if (!brand || !model) continue
    const { data: m } = await supabase.from('items').select('id').ilike('brand', brand).ilike('model', model).limit(1).maybeSingle()
    if (!m) { cand = e; candBM = { brand, model }; candFam = e.equipment_type || null; break }
  }
  ok(!!cand, cand ? `create-candidate: ${cand.title} [${candBM.brand}/${candBM.model}]` : 'NO create-candidate available (all pending match an existing item)')

  if (cand) {
    // snapshot masters so cleanup can drop any brand/family the import creates as a side effect
    brandsBefore = new Set(((await supabase.from('brands').select('brand')).data || []).map((b) => (b.brand || '').toLowerCase()))
    famBefore = new Set(((await supabase.from('product_families').select('name')).data || []).map((f) => (f.name || '').toLowerCase()))

    console.log('\n[3] DETAIL preview')
    const detail = await fetch(`${BASE}/eos/detail/${cand.id}`, { headers: H }).then(j)
    ok(detail?.entry?.id === cand.id && detail.imported === false, `GET /eos/detail/:id -> ${detail?.entry?.title} · imported=${detail?.imported}`)
    ok(detail?.entry?.current_status === 'approved', `candidate is approved (only approved are importable)`)

    console.log('\n[4] IMPORT (approved only, de-duped)')
    const imp = await fetch(`${BASE}/eos/import`, { method: 'POST', headers: H, body: JSON.stringify({ ids: [cand.id] }) }).then(j)
    ok(imp.created === 1, `POST /eos/import -> created ${imp.created}, linked ${imp.linked}, unchanged ${imp.unchanged}, failed ${imp.failed}`)
    itemId = imp.items?.[0]?.item_id
    ok(!!itemId, `new item id: ${itemId}`)

    console.log('\n[5] DUPLICATE PREVENTION — re-import same entry does not churn a new version')
    const imp2 = await fetch(`${BASE}/eos/import`, { method: 'POST', headers: H, body: JSON.stringify({ ids: [cand.id] }) }).then(j)
    ok(imp2.unchanged === 1 && imp2.created === 0, `re-import -> unchanged ${imp2.unchanged}, created ${imp2.created}`)

    console.log('\n[6] PENDING no longer lists the imported entry')
    const pend2 = await fetch(`${BASE}/eos/pending?page=1`, { headers: H }).then(j)
    const stillPending = (pend2.entries || []).filter((x) => !x.imported).some((x) => String(x.id) === String(cand.id))
    ok(!stillPending, `imported entry dropped out of the pending queue`)

    console.log('\n[7] VERSION HISTORY')
    const vers = await fetch(`${BASE}/eos/versions/${itemId}`, { headers: H }).then(j)
    ok(Array.isArray(vers) && vers.length >= 1 && vers[0].source === 'eos-import', `GET /eos/versions/:id -> v${vers[0]?.version} (${vers[0]?.source})`)

    console.log('\n[8] READ-ONLY ENFORCEMENT — validate-edit blocks EOS-owned fields')
    const ve = await fetch(`${BASE}/eos/validate-edit`, { method: 'POST', headers: H, body: JSON.stringify({ item_id: itemId, patch: { brand: 'ZZZ CHANGED', selling_price: 4321 } }) }).then(j)
    ok(ve.eos_linked === true && (ve.blocked || []).includes('brand'), `blocked engineering field(s): ${JSON.stringify(ve.blocked)}`)
    ok(ve.safe_patch?.selling_price === 4321 && !('brand' in (ve.safe_patch || {})), `safe_patch keeps commercial (selling_price), drops brand`)

    console.log('\n[9] RE-SYNC single item')
    const sync1 = await fetch(`${BASE}/eos/sync/${itemId}`, { method: 'POST', headers: H, body: JSON.stringify({}) }).then(j)
    ok(sync1.checked === 1, `POST /eos/sync/:id -> checked ${sync1.checked}, updated ${sync1.updated}, unchanged ${sync1.unchanged}`)

    console.log('\n[10] RE-SYNC all linked items (snapshot first so it stays self-cleaning)')
    const { data: preLinked } = await supabase.from('items').select('*').not('eos_entry_id', 'is', null)
    preState = new Map((preLinked || []).map((i) => [i.id, i]))
    preVerIds = new Set(((await supabase.from('item_versions').select('id')).data || []).map((v) => v.id))
    syncAllRan = true
    const syncAll = await fetch(`${BASE}/eos/sync`, { method: 'POST', headers: H, body: JSON.stringify({}) }).then(j)
    ok(typeof syncAll.checked === 'number' && syncAll.checked >= 1, `POST /eos/sync -> checked ${syncAll.checked}, updated ${syncAll.updated}, failed ${syncAll.failed}`)
  }

  console.log('\n[11] RBAC — a Sales user must NOT reach the EOS/Item-Master import queue')
  const { data: sales } = await supabase.from('users').select('*').eq('email', 'ali@culinova.sa').single()
  if (sales) {
    const sTok = jwt.sign({ id: sales.id, name: sales.name, email: sales.email, role: sales.role, access_level: sales.access_level }, env.jwtSecret, { expiresIn: '1h' })
    const res = await fetch(`${BASE}/eos/pending`, { headers: { authorization: `Bearer ${sTok}` } })
    ok(res.status === 403, `Sales user GET /eos/pending -> ${res.status} (expect 403)`)
  } else ok(false, 'sales user ali@culinova.sa not found')

  console.log('\n[12] VALIDATION — bad input returns 422, not a garbage insert')
  const bad = await fetch(`${BASE}/eos/import`, { method: 'POST', headers: H, body: JSON.stringify({ ids: [] }) })
  ok(bad.status === 422, `POST /eos/import [] -> ${bad.status} (expect 422)`)
  const bad2 = await fetch(`${BASE}/eos/validate-edit`, { method: 'POST', headers: H, body: JSON.stringify({ patch: {} }) })
  ok(bad2.status === 422, `POST /eos/validate-edit (no item_id) -> ${bad2.status} (expect 422)`)
} catch (e) {
  ok(false, 'unexpected error: ' + e.message)
}

console.log('\n[CLEANUP]')
if (syncAllRan) {
  // restore every pre-existing linked item sync-all touched, and delete the version rows it created
  for (const [id, st] of preState) { if (id === itemId) continue; const restore = {}; for (const k of EOS_OWNED_FIELDS) restore[k] = st[k]; await supabase.from('items').update(restore).eq('id', id) }
  const newVerIds = ((await supabase.from('item_versions').select('id')).data || []).map((v) => v.id).filter((id) => !preVerIds.has(id))
  if (newVerIds.length) await supabase.from('item_versions').delete().in('id', newVerIds)
  console.log(`  reverted ${preState.size - (itemId ? 1 : 0)} synced items + removed ${newVerIds.length} sync-generated version rows`)
}
if (itemId) {
  await supabase.from('item_versions').delete().eq('item_id', itemId)
  await supabase.from('items').delete().eq('id', itemId)
  // drop any brand / product-family the import created as a side effect (leave pre-existing masters)
  if (candBM?.brand && !brandsBefore.has(candBM.brand.toLowerCase())) await supabase.from('brands').delete().ilike('brand', candBM.brand)
  if (candFam && !famBefore.has(candFam.toLowerCase())) await supabase.from('product_families').delete().ilike('name', candFam)
  const { data: gone } = await supabase.from('items').select('id').eq('id', itemId).maybeSingle()
  ok(!gone, 'deleted the test item + its versions')
  console.log('  cleaned test item, versions and side-effect masters')
} else {
  console.log('  nothing to clean (no item created)')
}

console.log(`\n######## RESULT: ${pass} passed, ${fail} failed ########`)
process.exit(fail ? 1 : 0)
