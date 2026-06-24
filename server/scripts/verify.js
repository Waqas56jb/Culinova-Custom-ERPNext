import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

console.log('SUPABASE_URL =', process.env.SUPABASE_URL)
console.log('SERVICE_KEY  =', (process.env.SUPABASE_SERVICE_KEY || '(missing)').slice(0, 14) + '…')

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
})

try {
  const { count, error } = await sb.from('users').select('*', { count: 'exact', head: true })
  if (error) console.log('QUERY ERROR:', error.message || error)
  else console.log('✅ CONNECTED — users table count =', count)

  // list a few tables to confirm schema
  for (const t of ['customers', 'quotations', 'projects', 'items', 'invoices']) {
    const { error: e } = await sb.from(t).select('id', { head: true, count: 'exact' })
    console.log(`   table ${t}: ${e ? '❌ ' + e.message : '✅ ok'}`)
  }
} catch (e) {
  console.log('THROWN:', e.message)
}
process.exit(0)
