// EOS owns engineering data. Once an ERP item is linked to an EOS entry, those fields become
// READ-ONLY in the ERP: an edit there would be silently overwritten by the next sync and would put
// the two systems out of agreement. Commercial fields (pricing, stock, sales flags) stay ERP-owned.
import crypto from 'crypto'
import { supabase } from '../config/supabase.js'

// Engineering fields — sourced from EOS, not editable in the ERP once linked.
export const EOS_OWNED_FIELDS = [
  'brand', 'model', 'product_family', 'category', 'item_group', 'sub_category',
  'power_type', 'description', 'dimensions', 'image_url', 'datasheet_url',
  'specifications', 'eos_entry_id', 'eos_model_number', 'eos_synced_at',
  'eos_version', 'eos_last_hash', 'eos_status',
]

// Strip EOS-owned fields from a user-supplied patch when the item is EOS-linked.
// Returns the safe patch plus the names that were rejected, so the API can tell the user WHY.
export function stripEosOwned(patch = {}, item = null) {
  if (!item?.eos_entry_id) return { patch, blocked: [] }
  const safe = {}, blocked = []
  for (const [k, v] of Object.entries(patch)) {
    if (EOS_OWNED_FIELDS.includes(k)) {
      // only block an actual CHANGE — re-sending the same value is harmless
      if (item[k] != null && String(item[k]) === String(v)) continue
      blocked.push(k)
    } else safe[k] = v
  }
  return { patch: safe, blocked }
}

// Content hash of just the engineering payload — lets a sync say "nothing changed" cheaply and
// lets the UI show whether an item has drifted from EOS.
export function eosHash(fields = {}) {
  const subset = {}
  for (const k of EOS_OWNED_FIELDS) if (k !== 'eos_synced_at' && k !== 'eos_version' && k !== 'eos_last_hash') subset[k] = fields[k] ?? null
  return crypto.createHash('sha256').update(JSON.stringify(subset)).digest('hex').slice(0, 32)
}

// Append a version snapshot. Version numbers are per-item and monotonic.
export async function recordVersion(itemId, { source, changed_by, change_note, snapshot }) {
  const { data: last } = await supabase
    .from('item_versions').select('version').eq('item_id', itemId)
    .order('version', { ascending: false }).limit(1).maybeSingle()
  const version = (Number(last?.version) || 0) + 1
  const { data, error } = await supabase.from('item_versions').insert({
    item_id: itemId, version, source: source || 'erp-edit',
    changed_by: changed_by || null, change_note: change_note || null,
    snapshot: snapshot || {},
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

export async function versionsOf(itemId) {
  const { data } = await supabase.from('item_versions').select('*').eq('item_id', itemId).order('version', { ascending: false })
  return data || []
}
