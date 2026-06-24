import { supabase } from '../config/supabase.js'

export async function logAudit(user, entity, entityId, action, details) {
  try {
    await supabase.from('audit_log').insert({
      user_id: user?.id || null,
      user_name: user?.name || 'system',
      entity, entity_id: entityId ? String(entityId) : null, action, details: details || null,
    })
  } catch (e) {
    console.error('audit log failed:', e.message)
  }
}
