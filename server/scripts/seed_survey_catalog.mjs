/**
 * Seed survey_equipment_types + survey_attr_defs from the field-survey master list.
 *
 *   node scripts/seed_survey_catalog.mjs
 */
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { pathToFileURL, fileURLToPath } from 'url'
import { catalogRowsFromMaster } from '../src/modules/survey/catalog.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const { supabase } = await import('../src/config/supabase.js')

const localPath = path.resolve(__dirname, '../src/modules/survey/data/masterData.js')
const siblingPath = path.resolve(__dirname, '../../../culinova-equipment-survey/technician/src/data/masterData.js')
const catalogPath = fs.existsSync(localPath) ? localPath : siblingPath
const { DATA } = await import(pathToFileURL(catalogPath).href)
if (!DATA?.eq?.length) {
  console.error('masterData.js has no equipment types')
  process.exit(1)
}

const { attrRows, typeRows } = catalogRowsFromMaster(DATA)

async function upsert(table, rows, onConflict, chunkSize = 80) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const { error } = await supabase.from(table).upsert(chunk, { onConflict })
    if (error) throw new Error(`${table} upsert failed at ${i}: ${error.message}`)
    console.log(`  ${table} ${Math.min(i + chunk.length, rows.length)}/${rows.length}`)
  }
}

console.log(`Seeding ${attrRows.length} attr defs and ${typeRows.length} equipment types…`)
await upsert('survey_attr_defs', attrRows, 'key')
await upsert('survey_equipment_types', typeRows, 'code')
console.log('OK survey catalog seeded')
