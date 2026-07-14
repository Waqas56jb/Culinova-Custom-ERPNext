/** READ-ONLY — check if ceks_* tables exist in ERP Supabase connection */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

console.log('\nCross-check via ERP SUPABASE_URL:\n')
for (const t of ['items', 'quotations', 'ceks_knowledge_entries', 'ceks_rules', 'ceks_projects', 'projects']) {
  const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true })
  console.log(`  ${error ? 'MISSING' : String(count).padStart(6)}  ${t}${error ? '  (' + error.message + ')' : ''}`)
}
