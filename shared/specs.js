/**
 * Rendering item specifications for display (shared by client + print PDF).
 *
 * `items.specifications` is a TEXT column holding a JSON document synced from CULINOVA EOS:
 *
 *   { source, eos_entry_id, approved_at,
 *     attributes: [ { group, name, value, unit, source_document, source_page }, … ],
 *     notes: [ … ] }
 */

const META_KEYS = new Set(['source', 'eos_entry_id', 'approved_at', 'notes', 'entry_id', 'version_id'])
const EMPTY = /^\s*(n\s*\/?\s*a|not applicable|none|null|nil|-{1,3}|—|–)\s*$/i
const isBlank = (v) => v == null || String(v).trim() === '' || EMPTY.test(String(v))

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

export function specRows(raw) {
  const doc = parseSpec(raw)
  if (!doc) return []

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

  if (Array.isArray(doc)) {
    return doc
      .filter((a) => a && !isBlank(a.value))
      .map((a) => ({ group: a.group || null, name: a.name || '', value: String(a.value), unit: a.unit || null }))
  }

  return Object.entries(doc)
    .filter(([k, v]) => !META_KEYS.has(k) && typeof v !== 'object' && !isBlank(v))
    .map(([k, v]) => ({ group: null, name: k, value: String(v), unit: null }))
}

export const specLine = (row) => `${row.name}: ${row.value}${row.unit ? ` ${row.unit}` : ''}`

export function specPreview(raw, len = 90) {
  if (!raw) return ''
  const rows = specRows(raw)

  let text
  if (rows.length) {
    text = rows.map(specLine).join(' · ')
  } else if (typeof raw === 'object') {
    return ''
  } else {
    text = String(raw)
  }

  text = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length > len ? `${text.slice(0, len)}…` : text
}

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
