import { createClient } from '@supabase/supabase-js'
import { env } from './env.js'

// Server-side client uses the SERVICE ROLE key (bypasses RLS).
// Access control is enforced in our own RBAC middleware.
export const supabase = createClient(env.supabaseUrl || 'http://localhost', env.supabaseServiceKey || 'placeholder', {
  auth: { persistSession: false, autoRefreshToken: false },
})
