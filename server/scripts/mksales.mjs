import 'dotenv/config'
import fs from 'fs'
import bcrypt from 'bcryptjs'
import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

const email = 'hamza@culinova.sa'
const password = 'hamza123'
await sb.from('users').delete().eq('email', email) // remove if a stale one exists
const hash = await bcrypt.hash(password, 10)
const { data, error } = await sb.from('users').insert({
  name: 'Hamza', email, password_hash: hash,
  designation: 'Sales Manager', department: 'Sales', role: 'Sales Manager', access_level: 'Approval', status: 'Active',
}).select().single()
console.log(error ? '❌ ' + error.message : `✅ Salesperson created → ${data.email} / ${password} (role: ${data.role})`)
try { fs.unlinkSync(new URL('mksales.mjs', import.meta.url)) } catch {}
process.exit(0)
