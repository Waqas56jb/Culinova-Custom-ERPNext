/**
 * Rendering item specifications for display.
 *
 * `items.specifications` is a TEXT column holding a JSON document synced from CULINOVA EOS:
 *
 *   { source, eos_entry_id, approved_at,
 *     attributes: [ { group, name, value, unit, source_document, source_page }, … ],
 *     notes: [ … ] }
 *
 * The real specification is the `attributes` ARRAY. Interpolating it into a string —
 * `${key}: ${value}` — turned every entry into "[object Object]", which is what was reaching the
 * quotation screen instead of the specification the estimator needs to read.
 *
 * These helpers pull the attributes out properly and are tolerant of the other shapes the field has
 * carried over time: a plain sentence, a flat key/value object, or an already-parsed object.
 */

/** Keys that describe the sync itself rather than the equipment. */
const META_KEYS = new Set(['source', 'eos_entry_id', 'approved_at', 'notes', 'entry_id', 'version_id'])

/** Values that mean "nothing here" and should not be shown as if they were a specification. */
const EMPTY = /^\s*(n\s*\/?\s*a|not applicable|none|null|nil|-{1,3}|—|–)\s*$/i
const isBlank = (v) => v == null || String(v).trim() === '' || EMPTY.test(String(v))

/** Parse whatever the column holds into an object, or null when it is just prose. */
function parseSpec(raw) {
  if (raw == null) return null
  if (typeof raw === 'object') return raw
  const text = String(raw).trim()
  if (!text.startsWith('{') && !text.startsWith('[')) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * Normalise specifications into a flat list of { group, name, value, unit } rows.
 * Returns [] when the field holds free text rather than structured data.
 */
export function specRows(raw) {
  const doc = parseSpec(raw)
  if (!doc) return []

  // EOS shape — the array is the specification
  if (Array.isArray(doc.attributes)) {
    return doc.attributes
      .filter((a) => a && !isBlank(a.value))
      .map((a) => ({
        group: a.group || null,
        name: a.name || '',
        value: String(a.value),
        unit: a.unit || null,
      }))
  }

  // a bare array of the same rows
  if (Array.isArray(doc)) {
    return doc
      .filter((a) => a && !isBlank(a.value))
      .map((a) => ({ group: a.group || null, name: a.name || '', value: String(a.value), unit: a.unit || null }))
  }

  // flat key/value object — keep scalars, skip sync metadata and nested structures
  return Object.entries(doc)
    .filter(([k, v]) => !META_KEYS.has(k) && typeof v !== 'object' && !isBlank(v))
    .map(([k, v]) => ({ group: null, name: k, value: String(v), unit: null }))
}

/** "Length (mm): 2000" — one row as a single readable string. */
export const specLine = (row) => `${row.name}: ${row.value}${row.unit ? ` ${row.unit}` : ''}`

/**
 * A compact one-line preview for tables and pickers.
 * Falls back to the plain-text description when the field is prose, and never emits "[object Object]".
 */
export function specPreview(raw, len = 90) {
  if (!raw) return ''
  const rows = specRows(raw)

  let text
  if (rows.length) {
    text = rows.map(specLine).join(' · ')
  } else if (typeof raw === 'object') {
    return '' // structured but nothing displayable — better blank than "[object Object]"
  } else {
    text = String(raw)
  }

  text = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length > len ? `${text.slice(0, len)}…` : text
}

/** Group the rows for a full specification table: [{ group, rows: [...] }, …]. */
export function specGroups(raw) {
  const rows = specRows(raw)
  const order = []
  const map = new Map()
  for (const row of rows) {
    const key = row.group || 'other'
    if (!map.has(key)) {
      map.set(key, [])
      order.push(key)
    }
    map.get(key).push(row)
  }
  return order.map((group) => ({
    group,
    label: String(group).replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    rows: map.get(group),
  }))
}
