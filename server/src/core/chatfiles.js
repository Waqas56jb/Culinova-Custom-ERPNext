import { supabase } from '../config/supabase.js'

const BUCKET = 'chat-uploads'
const MAX = 10 * 1024 * 1024 // 10MB

// Decode a base64 data-URL and store it in the PRIVATE bucket. Returns the stored path + name.
export async function uploadAttachment(att) {
  if (!att || !att.dataUrl) return {}
  const m = String(att.dataUrl).match(/^data:(.+?);base64,(.*)$/)
  if (!m) return {}
  const buffer = Buffer.from(m[2], 'base64')
  if (!buffer.length || buffer.length > MAX) return {}
  const safe = (att.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType: m[1] || 'application/octet-stream' })
  if (error) return {}
  return { attachment_path: path, attachment_name: att.name || 'file' }
}

// Attach a short-lived signed URL to every message that carries a file (private — only visible to permitted users).
export async function signAttachments(messages) {
  const out = []
  for (const msg of messages || []) {
    if (msg.attachment_path) {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(msg.attachment_path, 3600)
      out.push({ ...msg, attachment_url: data?.signedUrl || null })
    } else out.push(msg)
  }
  return out
}
