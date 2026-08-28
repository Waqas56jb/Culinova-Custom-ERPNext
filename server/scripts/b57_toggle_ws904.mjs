/**
 * B5-7 browser test helper — toggle disabled on CULINOVA WS.904 General.
 * Usage: node scripts/b57_toggle_ws904.mjs disable|enable
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { supabase } from '../src/config/supabase.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const mode = process.argv[2]
if (!['disable', 'enable'].includes(mode)) {
  console.error('Usage: node scripts/b57_toggle_ws904.mjs disable|enable')
  process.exit(1)
}

const { data: rows, error: findErr } = await supabase
  .from('items')
  .select('id, item_code, item_name, model, disabled')
  .or('model.ilike.%WS.904%,item_name.ilike.%WS.904%,item_code.ilike.%WS.904%')

if (findErr) {
  console.error(findErr.message)
  process.exit(1)
}

const item = (rows || []).find((r) => /WS\.904/i.test(`${r.model || ''} ${r.item_name || ''} ${r.item_code || ''}`))
if (!item) {
  console.error('WS.904 item not found')
  process.exit(1)
}

const disabled = mode === 'disable'
const { data, error } = await supabase
  .from('items')
  .update({ disabled })
  .eq('id', item.id)
  .select('id, item_name, disabled')
  .single()

if (error) {
  console.error(error.message)
  process.exit(1)
}

console.log(`${mode.toUpperCase()} OK: ${data.item_name} (disabled=${data.disabled})`)
