import { supabase } from '../../config/supabase.js'
import { uploadSurveyPhoto, signSurveyPhoto, removeSurveyPhotos } from './storage.js'
import {
  PHOTO_KINDS, VISIT_STATUSES, LINE_CONDITIONS,
  lineTotals, publicItem, catalogRowsFromMaster, normalizeLineQuantities,
} from './catalog.js'
import { DATA as MASTER_DATA } from './data/masterData.js'

function fail(status, message) {
  const err = new Error(message)
  err.status = status
  throw err
}

const uuid = (v) => (v === '' || v === undefined ? null : v)
const str = (v) => (v === '' || v === undefined ? null : v)
const nowIso = () => new Date().toISOString()

async function loadSite(id) {
  const { data, error } = await supabase
    .from('sites')
    .select('id, customer_id, name, location, project_id, notes, created_at, updated_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) fail(404, 'Site not found')
  return data
}

async function attachCustomers(sites = []) {
  const ids = [...new Set(sites.map((s) => s.customer_id).filter(Boolean))]
  if (!ids.length) return sites.map((s) => ({ ...s, customer: null }))
  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, name, code, category')
    .in('id', ids)
  if (error) throw error
  const byId = Object.fromEntries((customers || []).map((c) => [c.id, c]))
  return sites.map((s) => ({ ...s, customer: byId[s.customer_id] || null }))
}

export async function listSites({ customer_id } = {}) {
  let q = supabase.from('sites').select('*').order('name')
  if (customer_id) q = q.eq('customer_id', customer_id)
  const { data, error } = await q
  if (error) throw error
  return attachCustomers(data || [])
}

export async function createSite(body) {
  const customer_id = uuid(body.customer_id)
  const name = String(body.name || '').trim()
  if (!customer_id) fail(422, 'customer_id required')
  if (!name) fail(422, 'site name required')
  const { data: customer } = await supabase.from('customers').select('id').eq('id', customer_id).maybeSingle()
  if (!customer) fail(404, 'Customer not found')
  if (body.project_id) {
    const { data: project } = await supabase.from('projects').select('id').eq('id', body.project_id).maybeSingle()
    if (!project) fail(404, 'Project not found')
  }
  const { data, error } = await supabase.from('sites').insert({
    customer_id,
    name,
    location: str(body.location),
    project_id: uuid(body.project_id),
    notes: str(body.notes),
  }).select().single()
  if (error) {
    if (error.code === '23505') fail(409, 'A site with this name already exists for the customer')
    throw error
  }
  const [row] = await attachCustomers([data])
  return row
}

export async function updateSite(id, body) {
  await loadSite(id)
  const patch = {}
  if (body.name !== undefined) {
    const name = String(body.name || '').trim()
    if (!name) fail(422, 'site name required')
    patch.name = name
  }
  if (body.location !== undefined) patch.location = str(body.location)
  if (body.notes !== undefined) patch.notes = str(body.notes)
  if (body.project_id !== undefined) {
    const project_id = uuid(body.project_id)
    if (project_id) {
      const { data: project } = await supabase.from('projects').select('id').eq('id', project_id).maybeSingle()
      if (!project) fail(404, 'Project not found')
    }
    patch.project_id = project_id
  }
  if (!Object.keys(patch).length) fail(422, 'No fields to update')
  const { data, error } = await supabase.from('sites').update(patch).eq('id', id).select().single()
  if (error) {
    if (error.code === '23505') fail(409, 'A site with this name already exists for the customer')
    throw error
  }
  const [row] = await attachCustomers([data])
  return row
}

function bundledCatalog({ q, category } = {}) {
  const { attrRows, typeRows, categories } = catalogRowsFromMaster(MASTER_DATA)
  const safe = String(q || '').replace(/[%*,()]/g, '').trim().toLowerCase()
  let types = typeRows.map((t) => ({ ...t }))
  if (category) types = types.filter((t) => t.category === category)
  if (safe) {
    types = types.filter((t) =>
      t.code.toLowerCase().includes(safe)
      || (t.name || '').toLowerCase().includes(safe)
      || (t.aliases || '').toLowerCase().includes(safe))
  }
  return {
    categories: category ? [...new Set(types.map((t) => t.category))] : categories,
    types,
    attr_defs: attrRows,
    photo_kinds: PHOTO_KINDS,
    conditions: LINE_CONDITIONS,
    visit_statuses: VISIT_STATUSES,
    source: 'bundle',
  }
}

export async function getCatalog({ q, category } = {}) {
  let typesQ = supabase.from('survey_equipment_types').select('*').order('code')
  if (category) typesQ = typesQ.eq('category', category)
  if (q) {
    const safe = String(q).replace(/[%*,()]/g, '').trim().slice(0, 80)
    if (safe) {
      const like = `%${safe}%`
      typesQ = typesQ.or(`code.ilike.${like},name.ilike.${like},aliases.ilike.${like}`)
    }
  }
  const [{ data: types, error: tErr }, { data: defs, error: dErr }] = await Promise.all([
    typesQ,
    supabase.from('survey_attr_defs').select('*').order('key'),
  ])
  if (tErr || dErr || !(types || []).length) {
    return bundledCatalog({ q, category })
  }
  const categories = [...new Set((types || []).map((t) => t.category).filter(Boolean))]
  return {
    categories,
    types: types || [],
    attr_defs: defs || [],
    photo_kinds: PHOTO_KINDS,
    conditions: LINE_CONDITIONS,
    visit_statuses: VISIT_STATUSES,
    source: 'db',
  }
}

function customLineName(attrs) {
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return null
  const n = String(attrs['Custom Equipment Name'] || '').trim()
  return n || null
}

function sanitizeLine(body, { type } = {}) {
  const q = normalizeLineQuantities(body)
  let attrs = body.attrs
  if (attrs && typeof attrs === 'string') {
    try { attrs = JSON.parse(attrs) } catch { attrs = {} }
  }
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) attrs = {}
  const custom = customLineName(attrs)
  return {
    type_code: type?.code || body.type_code,
    type_name: custom || type?.name || str(body.type_name),
    category: type?.category || str(body.category),
    qty: q.qty,
    qty_good: q.qty_good,
    qty_ns: q.qty_ns,
    qty_oos: q.qty_oos,
    condition: q.condition,
    notes: str(body.notes),
    attrs,
    item_id: uuid(body.item_id),
    sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
  }
}

function isTechnician(actor) {
  return actor?.role === 'Technician'
}

function assertVisitAccess(visit, actor) {
  if (!isTechnician(actor)) return
  if (visit.technician_id && visit.technician_id === actor.id) return
  fail(403, 'Not your visit')
}

async function resolveType(code) {
  if (!code) fail(422, 'type_code required')
  const { data, error } = await supabase.from('survey_equipment_types').select('*').eq('code', code).maybeSingle()
  if (error) throw error
  if (!data) fail(422, `Unknown survey equipment type: ${code}`)
  return data
}

async function assertItem(item_id) {
  if (!item_id) return null
  const { data, error } = await supabase
    .from('items')
    .select('id, item_code, item_name, brand')
    .eq('id', item_id)
    .maybeSingle()
  if (error) throw error
  if (!data) fail(404, 'Item not found')
  return publicItem(data)
}

async function loadVisit(id) {
  const { data, error } = await supabase.from('survey_visits').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) fail(404, 'Visit not found')
  return data
}

function assertDraft(visit) {
  if (visit.status !== 'Draft') fail(422, 'Submitted visits cannot be edited')
}

async function enrichVisit(visit) {
  const [{ data: lines, error: lErr }, site] = await Promise.all([
    supabase.from('survey_visit_lines').select('*').eq('visit_id', visit.id).order('sort_order').order('created_at'),
    loadSite(visit.site_id),
  ])
  if (lErr) throw lErr
  const lineIds = (lines || []).map((l) => l.id)
  let photos = []
  if (lineIds.length) {
    const { data: ph, error: pErr } = await supabase.from('survey_photos').select('*').in('line_id', lineIds)
    if (pErr) throw pErr
    photos = ph || []
  }
  const signed = await signPhotos(photos)
  const byLine = {}
  for (const p of signed) {
    (byLine[p.line_id] ||= []).push(p)
  }
  const itemIds = [...new Set((lines || []).map((l) => l.item_id).filter(Boolean))]
  let itemsById = {}
  if (itemIds.length) {
    const { data: items, error: iErr } = await supabase
      .from('items')
      .select('id, item_code, item_name, brand')
      .in('id', itemIds)
    if (iErr) throw iErr
    itemsById = Object.fromEntries((items || []).map((i) => [i.id, publicItem(i)]))
  }
  const [siteRow] = await attachCustomers([site])
  const withPhotos = (lines || []).map((l) => {
    const custom = customLineName(l.attrs)
    return {
      ...l,
      type_name: custom || l.type_name,
      photos: byLine[l.id] || [],
      item: l.item_id ? itemsById[l.item_id] || null : null,
    }
  })
  return {
    ...visit,
    site: siteRow,
    lines: withPhotos,
    totals: lineTotals(withPhotos),
  }
}

async function signPhotos(photos = []) {
  const out = []
  for (const p of photos) {
    if (!p?.path) { out.push({ ...p, url: null }); continue }
    const url = await signSurveyPhoto(p.path)
    out.push({ ...p, url })
  }
  return out
}

export async function listVisits({ site_id, customer_id, status } = {}, actor) {
  let siteIds = null
  if (customer_id && !site_id) {
    const { data: sites, error } = await supabase.from('sites').select('id').eq('customer_id', customer_id)
    if (error) throw error
    siteIds = (sites || []).map((s) => s.id)
    if (!siteIds.length) return []
  }
  let q = supabase.from('survey_visits').select('*').order('visited_at', { ascending: false })
  if (isTechnician(actor)) q = q.eq('technician_id', actor.id)
  if (site_id) q = q.eq('site_id', site_id)
  else if (siteIds) q = q.in('site_id', siteIds)
  if (status) q = q.eq('status', status)
  const { data, error } = await q.limit(300)
  if (error) throw error
  const visits = data || []
  if (!visits.length) return []
  const ids = visits.map((v) => v.id)
  const siteIdList = [...new Set(visits.map((v) => v.site_id))]
  const [{ data: lines, error: lErr }, { data: sites, error: sErr }] = await Promise.all([
    supabase.from('survey_visit_lines').select('visit_id, qty, qty_good, qty_ns, qty_oos').in('visit_id', ids),
    supabase.from('sites').select('*').in('id', siteIdList),
  ])
  if (lErr) throw lErr
  if (sErr) throw sErr
  const sitesDecorated = await attachCustomers(sites || [])
  const siteById = Object.fromEntries(sitesDecorated.map((s) => [s.id, s]))
  const byVisit = {}
  for (const l of lines || []) (byVisit[l.visit_id] ||= []).push(l)
  return visits.map((v) => ({
    ...v,
    site: siteById[v.site_id] || null,
    totals: lineTotals(byVisit[v.id] || []),
  }))
}

export async function getVisit(id, actor) {
  const visit = await loadVisit(id)
  assertVisitAccess(visit, actor)
  return enrichVisit(visit)
}

export async function createVisit(body, actor) {
  const site = await loadSite(body.site_id)
  const visited_at = body.visited_at || nowIso()
  const { data, error } = await supabase.from('survey_visits').insert({
    site_id: site.id,
    technician_id: uuid(body.technician_id) || actor?.id || null,
    technician_name: str(body.technician_name) || actor?.name || null,
    visited_at,
    status: 'Draft',
    notes: str(body.notes),
    created_by: actor?.id || null,
  }).select().single()
  if (error) throw error
  const incoming = Array.isArray(body.lines) ? body.lines : []
  for (let i = 0; i < incoming.length; i++) {
    const type = await resolveType(incoming[i].type_code)
    await assertItem(uuid(incoming[i].item_id))
    const row = sanitizeLine({ ...incoming[i], sort_order: incoming[i].sort_order ?? i }, { type })
    const { error: lErr } = await supabase.from('survey_visit_lines').insert({ visit_id: data.id, ...row })
    if (lErr) throw lErr
  }
  return enrichVisit(data)
}

export async function updateVisit(id, body, actor) {
  const visit = await loadVisit(id)
  assertVisitAccess(visit, actor)
  assertDraft(visit)
  const patch = {}
  if (body.visited_at !== undefined) patch.visited_at = body.visited_at || nowIso()
  if (body.notes !== undefined) patch.notes = str(body.notes)
  if (body.technician_id !== undefined) patch.technician_id = uuid(body.technician_id)
  if (body.technician_name !== undefined) patch.technician_name = str(body.technician_name)
  if (body.site_id !== undefined) {
    const site = await loadSite(body.site_id)
    patch.site_id = site.id
  }
  if (!Object.keys(patch).length) return enrichVisit(visit)
  const { data, error } = await supabase.from('survey_visits').update(patch).eq('id', id).select().single()
  if (error) throw error
  return enrichVisit(data)
}

export async function submitVisit(id, actor) {
  const visit = await loadVisit(id)
  assertVisitAccess(visit, actor)
  if (visit.status === 'Submitted') fail(422, 'Visit is already submitted')
  const { data: lines } = await supabase.from('survey_visit_lines').select('id').eq('visit_id', id)
  if (!lines?.length) fail(422, 'Add at least one equipment line before submitting')
  const { data, error } = await supabase.from('survey_visits').update({
    status: 'Submitted',
    submitted_at: nowIso(),
  }).eq('id', id).select().single()
  if (error) throw error
  return enrichVisit(data)
}

export async function addLine(visitId, body, actor) {
  const visit = await loadVisit(visitId)
  assertVisitAccess(visit, actor)
  assertDraft(visit)
  const type = await resolveType(body.type_code)
  await assertItem(uuid(body.item_id))
  const row = sanitizeLine(body, { type })
  const { data, error } = await supabase.from('survey_visit_lines').insert({ visit_id: visitId, ...row }).select().single()
  if (error) throw error
  return data
}

export async function updateLine(visitId, lineId, body, actor) {
  const visit = await loadVisit(visitId)
  assertVisitAccess(visit, actor)
  assertDraft(visit)
  const { data: existing } = await supabase.from('survey_visit_lines').select('*').eq('id', lineId).eq('visit_id', visitId).maybeSingle()
  if (!existing) fail(404, 'Line not found')
  const type = body.type_code ? await resolveType(body.type_code) : { code: existing.type_code, name: existing.type_name, category: existing.category }
  if (body.item_id !== undefined) await assertItem(uuid(body.item_id))
  const merged = sanitizeLine({ ...existing, ...body }, { type })
  const { data, error } = await supabase.from('survey_visit_lines').update(merged).eq('id', lineId).select().single()
  if (error) throw error
  return data
}

export async function deleteLine(visitId, lineId, actor) {
  const visit = await loadVisit(visitId)
  assertVisitAccess(visit, actor)
  assertDraft(visit)
  const { data: existing } = await supabase.from('survey_visit_lines').select('id').eq('id', lineId).eq('visit_id', visitId).maybeSingle()
  if (!existing) fail(404, 'Line not found')
  const { data: photos, error: photoErr } = await supabase.from('survey_photos').select('id, path').eq('line_id', lineId)
  if (photoErr) throw photoErr
  await removeSurveyPhotos((photos || []).map((p) => p.path))
  const { error } = await supabase.from('survey_visit_lines').delete().eq('id', lineId)
  if (error) throw error
  return { ok: true }
}

export async function addPhoto(visitId, lineId, body, actor) {
  const visit = await loadVisit(visitId)
  assertVisitAccess(visit, actor)
  assertDraft(visit)
  const { data: line } = await supabase.from('survey_visit_lines').select('id').eq('id', lineId).eq('visit_id', visitId).maybeSingle()
  if (!line) fail(404, 'Line not found')
  const site = await loadSite(visit.site_id)
  const kind = PHOTO_KINDS.includes(body.kind) ? body.kind : 'Other'
  const stored = await uploadSurveyPhoto({
    dataUrl: body.dataUrl,
    name: body.name || 'photo.jpg',
    customer_id: site.customer_id,
    site_id: site.id,
    visit_id: visit.id,
    line_id: lineId,
  })
  const { data, error } = await supabase.from('survey_photos').insert({
    line_id: lineId,
    kind,
    path: stored.path,
    name: stored.name,
  }).select().single()
  if (error) throw error
  const [signed] = await signPhotos([data])
  return signed
}

export async function deletePhoto(photoId, actor) {
  const { data: photo } = await supabase.from('survey_photos').select('id, line_id, path').eq('id', photoId).maybeSingle()
  if (!photo) fail(404, 'Photo not found')
  const { data: line } = await supabase.from('survey_visit_lines').select('visit_id').eq('id', photo.line_id).maybeSingle()
  if (line?.visit_id) {
    const visit = await loadVisit(line.visit_id)
    assertVisitAccess(visit, actor)
    assertDraft(visit)
  }
  await removeSurveyPhotos([photo.path])
  const { error } = await supabase.from('survey_photos').delete().eq('id', photoId)
  if (error) throw error
  return { ok: true }
}

export async function updatePhoto(photoId, body, actor) {
  const { data: photo } = await supabase.from('survey_photos').select('*').eq('id', photoId).maybeSingle()
  if (!photo) fail(404, 'Photo not found')
  const { data: line } = await supabase.from('survey_visit_lines').select('visit_id').eq('id', photo.line_id).maybeSingle()
  if (line?.visit_id) {
    const visit = await loadVisit(line.visit_id)
    assertVisitAccess(visit, actor)
    assertDraft(visit)
  }
  const kind = str(body.kind)
  if (!PHOTO_KINDS.includes(kind)) fail(400, `kind must be one of: ${PHOTO_KINDS.join(', ')}`)
  const { data, error } = await supabase.from('survey_photos').update({ kind }).eq('id', photoId).select().single()
  if (error) throw error
  const [signed] = await signPhotos([data])
  return signed
}
