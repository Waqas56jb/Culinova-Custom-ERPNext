// ─────────────────────────────────────────────────────────────────────────────
// CULINOVA EOS integration — EOS (the engineering knowledge base) is the SOURCE OF
// TRUTH for approved product/engineering data. The ERP Item Master imports approved
// EOS entries (identity + engineering specs + datasheet/CAD). Imports are linked by
// eos_entry_id so they de-duplicate and can be re-synced. No pricing comes from EOS
// (manual / price-list, per the Item Master spec).
// ─────────────────────────────────────────────────────────────────────────────
import { env } from '../config/env.js'
import { supabase } from '../config/supabase.js'
import { buildItemName, getBrand } from './itempricing.js'
import { eosHash, recordVersion } from './eosfields.js'

const EOS = env.eosApiUrl

async function eosFetch(path) {
  const res = await fetch(`${EOS}${path}`, { headers: { accept: 'application/json' } })
  const text = await res.text()
  let data; try { data = JSON.parse(text) } catch { data = text }
  if (!res.ok) throw new Error(typeof data === 'object' && data.error ? data.error : `EOS request failed (${res.status})`)
  return data
}

// List approved EOS knowledge entries (paginated / searchable via the EOS portal API).
export async function eosCatalog({ query = '', page = 1, limit = 60 } = {}) {
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (query) qs.set('query', query)
  return eosFetch(`/api/knowledge?${qs.toString()}`)
}

// Full approved entry detail (identity + attributes + docs/files + notes).
export async function eosDetail(id) {
  return eosFetch(`/api/knowledge/${id}`)
}

// ── mapping EOS entry detail → ERP Item Master row ──
const clean = (s) => (s == null ? null : String(s).trim() || null)
// EOS categories are engineering categories; the ERP top-level bucket is Equipment vs Custom Fabrication.
const erpCategory = (eosCat) => (/(fabricat|stainless|custom|table|sink|hood|counter|shelv|cold\s*room)/i.test(eosCat || '') ? 'Custom Fabrication' : 'Equipment')

function dimsFromAttributes(attrs = []) {
  const dim = attrs.filter((a) => a.attr_group === 'dimensions_clearance')
  const pick = (re) => { const m = dim.find((a) => re.test(a.name || '')); return m ? String(m.value).replace(/[^\d.]/g, '') : null }
  const L = pick(/length/i), W = pick(/width|depth/i), H = pick(/height/i) && !/backsplash/i.test(dim.find((a) => /height/i.test(a.name))?.name || '') ? pick(/^(?!.*backsplash).*height/i) : pick(/height/i)
  const parts = [L, W, H].filter(Boolean)
  return parts.length ? `${parts.join('×')} mm` : null
}

function datasheetUrl(detail) {
  const doc = (detail.documents || []).find((d) => d.doc_type === 'datasheet') || (detail.documents || [])[0]
  if (doc?.storage_url) return doc.storage_url
  const cad = (detail.files || []).find((f) => f.asset_type === 'cad')
  return cad?.storage_url || null
}

// Build the ERP item field-set from an EOS detail payload.
export function mapEosToItem(detail) {
  const e = detail.entry || {}, m = detail.model || {}
  const brand = clean(e.brand || m.brand)
  const model = clean(e.model_number || e.code || m.model_number)
  const family = clean(e.equipment_type || m.equipment_type)
  const category = clean(e.category || m.category)
  const name = buildItemName(brand, model, family) || clean(e.title)
  // keep the engineering attributes with the item so the ERP has the full spec sheet
  const specs = {
    source: 'CULINOVA EOS', eos_entry_id: e.id, approved_at: e.approved_at,
    attributes: (detail.attributes || []).map((a) => ({ group: a.attr_group, name: a.name, value: a.value, unit: a.unit, source_document: a.source_document, source_page: a.source_page })),
    notes: (detail.notes || []).map((n) => n.content),
  }
  return {
    fields: {
      item_name: name, name,
      brand, model, product_family: family,
      category: category, item_group: category, sub_category: family,
      power_type: clean(e.power_type || m.power_type),
      product_type: 'Item',
      description: clean(e.summary),
      dimensions: dimsFromAttributes(detail.attributes),
      image_url: clean(m.image_url),
      datasheet_url: datasheetUrl(detail),
      specifications: JSON.stringify(specs),
      eos_entry_id: e.id, eos_model_number: model,
      eos_synced_at: new Date().toISOString(),
    },
    brand, family, category,
  }
}

// Ensure the referenced Brand + Product Family master records exist (dropdowns + comparison).
/** Legacy auto-names from EOS import — used to upgrade names on re-sync without clobbering manual edits. */
function legacyAutoNames(detail) {
  const e = detail.entry || {}, m = detail.model || {}
  const b = clean(e.brand || m.brand)
  const mod = clean(e.model_number || e.code || m.model_number)
  return { title: clean(e.title), brandModel: [b, mod].filter(Boolean).join(' ') }
}

function nameShouldUpgrade(existingName, detail) {
  const cur = clean(existingName)
  if (!cur) return true
  const { title, brandModel } = legacyAutoNames(detail)
  return (title && cur === title) || (brandModel && cur === brandModel)
}

async function ensureMasters({ brand, family, category }) {
  if (brand) {
    const existing = await getBrand(brand)
    if (!existing) {
      await supabase.from('brands').insert({
        brand, currency: 'SAR', exchange_factor: 1, price_factor: 1, factors_pending: true,
      }).select().maybeSingle()
    }
  }
  if (family) {
    const { data: fam } = await supabase.from('product_families').select('id').ilike('name', family).limit(1).maybeSingle()
    if (!fam) await supabase.from('product_families').insert({ name: family, category: category || null })
  }
}

const num = () => `ITM-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`

// Import (or re-sync) one EOS entry into the ERP Item Master. Idempotent:
//  - if an item is already linked to this EOS entry  → refresh its engineering fields (keep pricing)
//  - else if an item with the same brand+model exists → LINK + refresh it (no duplicate)
//  - else                                             → create a new item (no price; manual later)
export async function importEosEntry(id, user) {
  const detail = await eosDetail(id)
  if (!detail?.entry) throw new Error('EOS entry not found')
  if (detail.entry.current_status !== 'approved') throw new Error('Only approved EOS entries can be imported')
  const mapped = mapEosToItem(detail)
  await ensureMasters(mapped)
  const f = { ...mapped.fields, eos_status: detail.entry.current_status }
  const hash = eosHash(f)

  // 1) already linked to this EOS entry?
  let { data: existing } = await supabase.from('items').select('*').eq('eos_entry_id', id).maybeSingle()
  let mode = 'updated'
  // 2) else match an existing item by brand + model (link it instead of duplicating)
  if (!existing && f.brand && f.model) {
    const { data: byModel } = await supabase.from('items').select('*').ilike('brand', f.brand).ilike('model', f.model).limit(1).maybeSingle()
    if (byModel) { existing = byModel; mode = 'linked' }
  }

  if (existing) {
    // nothing changed upstream → don't churn a new version, just report it
    if (mode === 'updated' && existing.eos_last_hash === hash) {
      return { mode: 'unchanged', item: existing }
    }
    // refresh engineering data + link, but PRESERVE identity & pricing:
    //  - item_name / name are NOT changed — sales quotations resolve item cost BY NAME, renaming breaks them
    //  - item_code and all pricing fields are untouched (EOS carries no price)
    const patch = { ...f }
    delete patch.name; delete patch.item_name
    if (nameShouldUpgrade(existing.item_name || existing.name, detail)) {
      patch.item_name = f.item_name
      patch.name = f.item_name
    }
    patch.eos_version = (Number(existing.eos_version) || 0) + 1
    patch.eos_last_hash = hash
    const { data, error } = await supabase.from('items').update(patch).eq('id', existing.id).select().single()
    if (error) throw new Error(error.message)
    // snapshot the PREVIOUS state so an EOS change is always auditable and reversible
    await recordVersion(existing.id, {
      source: mode === 'linked' ? 'eos-link' : 'eos-sync',
      changed_by: user?.id || null,
      change_note: `EOS entry ${id} → v${patch.eos_version}`,
      snapshot: existing,
    })
    return { mode, item: data }
  }

  // 3) create new
  const item_code = num()
  const row = { ...f, item_code, code: item_code, stock_uom: 'Nos', is_stock_item: true, is_sales_item: true, is_purchase_item: true, eos_version: 1, eos_last_hash: hash }
  const { data, error } = await supabase.from('items').insert(row).select().single()
  // the unique index on eos_entry_id is the last line of defence against a duplicate import
  if (error) throw new Error(error.code === '23505' ? 'This EOS entry has already been imported' : error.message)
  await recordVersion(data.id, { source: 'eos-import', changed_by: user?.id || null, change_note: `Imported from EOS entry ${id}`, snapshot: data })
  return { mode: 'created', item: data }
}

// Import a batch; returns a per-id result summary.
export async function importEosEntries(ids = [], user) {
  const results = { created: 0, updated: 0, linked: 0, unchanged: 0, failed: 0, items: [], errors: [] }
  for (const id of ids) {
    try {
      const r = await importEosEntry(id, user)
      results[r.mode] = (results[r.mode] || 0) + 1
      results.items.push({ id, mode: r.mode, item_id: r.item.id, item_name: r.item.item_name })
    } catch (e) { results.failed++; results.errors.push({ id, error: e.message }) }
  }
  return results
}

// ── SYNC ─────────────────────────────────────────────────────────────────────
// Re-pull every EOS-linked item from EOS. Items whose engineering payload is unchanged are skipped,
// so a sync is cheap and its report only lists what actually moved.
export async function syncLinkedItems(user, { ids } = {}) {
  let q = supabase.from('items').select('id, item_name, eos_entry_id, eos_version').not('eos_entry_id', 'is', null)
  if (ids?.length) q = q.in('id', ids)
  const { data: linked, error } = await q
  if (error) throw new Error(error.message)

  const report = { checked: linked.length, updated: 0, unchanged: 0, failed: 0, changes: [], errors: [] }
  for (const it of linked) {
    try {
      const r = await importEosEntry(it.eos_entry_id, user)
      if (r.mode === 'unchanged') { report.unchanged++; continue }
      report.updated++
      report.changes.push({ item_id: it.id, item_name: r.item.item_name, version: r.item.eos_version })
    } catch (e) {
      report.failed++
      report.errors.push({ item_id: it.id, item_name: it.item_name, error: e.message })
    }
  }
  return report
}

// ── UPDATE AVAILABLE (client item 19) ────────────────────────────────────────
// Which EOS-linked items have NEWER engineering data upstream? Read-only: we recompute the
// engineering hash from live EOS and compare it with the hash stored at the last sync. Nothing is
// written — the engineer decides in the UI whether to pull the update (per item or Sync All).
export async function eosUpdatesAvailable() {
  const { data: linked, error } = await supabase
    .from('items')
    .select('id, item_name, item_code, brand, model, eos_entry_id, eos_version, eos_last_hash, eos_synced_at')
    .not('eos_entry_id', 'is', null)
  if (error) throw new Error(error.message)

  const report = { checked: (linked || []).length, updates: [], unchanged: 0, failed: 0, errors: [] }
  for (const it of linked || []) {
    try {
      const detail = await eosDetail(it.eos_entry_id)
      if (!detail?.entry) throw new Error('entry no longer exists in EOS')
      const mapped = mapEosToItem(detail)
      const hash = eosHash({ ...mapped.fields, eos_status: detail.entry.current_status })
      if (hash === it.eos_last_hash) { report.unchanged++; continue }
      report.updates.push({
        item_id: it.id,
        item_name: it.item_name,
        item_code: it.item_code,
        brand: it.brand,
        model: it.model,
        eos_entry_id: it.eos_entry_id,
        erp_version: it.eos_version,
        last_synced_at: it.eos_synced_at || null,
        update_available: true,
      })
    } catch (e) {
      report.failed++
      report.errors.push({ item_id: it.id, item_name: it.item_name, error: e.message })
    }
  }
  return report
}

// Which approved EOS entries are NOT yet in the ERP — the pending import queue Ali works through.
export async function eosPending({ query = '', page = 1, limit = 60 } = {}) {
  const cat = await eosCatalog({ query, page, limit })
  const rows = cat?.entries || cat?.items || cat?.data || []
  const { data: linked } = await supabase.from('items').select('eos_entry_id').not('eos_entry_id', 'is', null)
  const have = new Set((linked || []).map((r) => String(r.eos_entry_id)))
  const marked = rows.map((r) => ({ ...r, imported: have.has(String(r.id)) }))
  return { ...cat, entries: marked, pending: marked.filter((r) => !r.imported).length, imported: marked.filter((r) => r.imported).length }
}
