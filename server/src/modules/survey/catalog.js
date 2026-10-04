/**
 * Survey catalog helpers — type list lives in survey_equipment_types (seeded from the
 * field-survey master list). No Item Master / pricing fields here.
 */
export const PHOTO_KINDS = [
  'Equipment',
  'Nameplate',
  'Problem',
  'Interior/Filter',
  'Control Panel',
  'Other',
]

export const VISIT_STATUSES = ['Draft', 'Submitted']

export const LINE_CONDITIONS = ['good', 'ns', 'oos', 'mixed']

const num = (v, fallback = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** Stored-line splits as-is (no silent adjust). Used for visit totals. */
export function splitQty(line = {}) {
  return {
    qty: num(line.qty),
    qty_good: num(line.qty_good),
    qty_ns: num(line.qty_ns),
    qty_oos: num(line.qty_oos),
  }
}

export function normalizeCondition(raw) {
  const s = String(raw || '').trim().toLowerCase()
  if (s === 'good') return 'good'
  if (s === 'ns' || s === 'need service' || s === 'need_service') return 'ns'
  if (s === 'oos' || s === 'out of service' || s === 'out_of_service') return 'oos'
  if (s === 'mixed') return 'mixed'
  return null
}

function asInt(v, field) {
  if (v === '' || v === null || v === undefined) {
    const err = new Error(`${field} must be an integer`)
    err.status = 400
    throw err
  }
  const n = Number(v)
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    const err = new Error(`${field} must be an integer`)
    err.status = 400
    throw err
  }
  return n
}

/**
 * Line qty rules:
 * Mixed — qty_good + qty_ns + qty_oos must equal qty (400 if not).
 * Good / Need Service / OOS — all qty in that bucket; client splits ignored.
 */
export function normalizeLineQuantities(body = {}) {
  const condition = normalizeCondition(body.condition)
  if (!condition) {
    const err = new Error('condition must be Good, Need Service, OOS, or Mixed')
    err.status = 400
    throw err
  }
  const qty = asInt(body.qty, 'qty')
  if (qty < 1) {
    const err = new Error('qty must be an integer >= 1')
    err.status = 400
    throw err
  }
  if (condition === 'mixed') {
    const qty_good = asInt(body.qty_good, 'qty_good')
    const qty_ns = asInt(body.qty_ns, 'qty_ns')
    const qty_oos = asInt(body.qty_oos, 'qty_oos')
    if (qty_good < 0 || qty_ns < 0 || qty_oos < 0) {
      const err = new Error('splits must be integers >= 0')
      err.status = 400
      throw err
    }
    if (qty_good + qty_ns + qty_oos !== qty) {
      const err = new Error('Good + Need Service + OOS must equal Qty')
      err.status = 400
      throw err
    }
    return { qty, qty_good, qty_ns, qty_oos, condition }
  }
  if (condition === 'good') return { qty, qty_good: qty, qty_ns: 0, qty_oos: 0, condition }
  if (condition === 'ns') return { qty, qty_good: 0, qty_ns: qty, qty_oos: 0, condition }
  return { qty, qty_good: 0, qty_ns: 0, qty_oos: qty, condition }
}

export function inferCondition({ qty_good, qty_ns, qty_oos }) {
  const parts = [qty_good > 0, qty_ns > 0, qty_oos > 0].filter(Boolean).length
  if (parts > 1) return 'mixed'
  if (qty_oos > 0) return 'oos'
  if (qty_ns > 0) return 'ns'
  return 'good'
}

export function lineTotals(lines = []) {
  const t = { total: 0, good: 0, ns: 0, oos: 0, problems: 0, line_count: lines.length }
  for (const it of lines) {
    const s = splitQty(it)
    t.total += s.qty
    t.good += s.qty_good
    t.ns += s.qty_ns
    t.oos += s.qty_oos
    if (s.qty_ns + s.qty_oos > 0) t.problems += 1
  }
  return t
}

export function catalogRowsFromMaster(DATA) {
  const cats = DATA?.cats || []
  const defs = DATA?.defs || {}
  const attrRows = Object.entries(defs).map(([key, d]) => ({
    key,
    label: d.l || key,
    input_type: d.t || 't',
    options: Array.isArray(d.o) ? d.o : null,
  }))
  const typeRows = (DATA?.eq || []).map((e) => {
    const [code, catIdx, name, alias, attrKeys] = e
    const indexes = Array.isArray(catIdx) ? catIdx : [catIdx]
    return {
      code,
      name,
      aliases: alias || null,
      category: cats[indexes[0]] || 'Other',
      attr_keys: Array.isArray(attrKeys) ? attrKeys : [],
    }
  })
  return { attrRows, typeRows, categories: cats }
}

export function publicItem(item) {
  if (!item) return null
  return {
    id: item.id,
    item_code: item.item_code || item.code || null,
    item_name: item.item_name || item.name || null,
    brand: item.brand || null,
  }
}
