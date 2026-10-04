/**
 * Private survey photo storage. Separate from chat-uploads (do not import chatfiles.js).
 */
import { supabase } from '../../config/supabase.js'

export const SURVEY_PHOTO_BUCKET = 'survey-photos'
const MAX_BYTES = 10 * 1024 * 1024
const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heic',
}

let bucketReady = false

function fail(status, message) {
  const err = new Error(message)
  err.status = status
  throw err
}

function readU32BE(buf, i) {
  return buf.readUInt32BE(i)
}

/** JPEG / PNG / WebP pixel size. HEIC is not parsed — upload is rejected without dimensions. */
function readImageSize(buf, mime) {
  const m = String(mime || '').toLowerCase()
  if (m === 'image/jpeg' || m === 'image/jpg' || (buf[0] === 0xff && buf[1] === 0xd8)) {
    for (let i = 0; i < buf.length - 9; i++) {
      if (buf[i] === 0xff && (buf[i + 1] === 0xc0 || buf[i + 1] === 0xc2)) {
        return { h: (buf[i + 5] << 8) | buf[i + 6], w: (buf[i + 7] << 8) | buf[i + 8] }
      }
    }
    return null
  }
  if (m === 'image/png' || (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)) {
    if (buf.length < 24) return null
    return { w: readU32BE(buf, 16), h: readU32BE(buf, 20) }
  }
  if (m === 'image/webp' || (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')) {
    const kind = buf.toString('ascii', 12, 16)
    if (kind === 'VP8X' && buf.length >= 30) {
      const w = 1 + buf[24] + (buf[25] << 8) + (buf[26] << 16)
      const h = 1 + buf[27] + (buf[28] << 8) + (buf[29] << 16)
      return { w, h }
    }
    if (kind === 'VP8 ' && buf.length >= 30) {
      return { w: buf[26] + ((buf[27] & 0x3f) << 8), h: buf[28] + ((buf[29] & 0x3f) << 8) }
    }
    if (kind === 'VP8L' && buf.length >= 25) {
      const bits = buf[21] | (buf[22] << 8) | (buf[23] << 16) | (buf[24] << 24)
      return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 }
    }
  }
  return null
}

export async function ensureSurveyPhotoBucket() {
  if (bucketReady) return
  const { data } = await supabase.storage.getBucket(SURVEY_PHOTO_BUCKET)
  if (!data) {
    const { error } = await supabase.storage.createBucket(SURVEY_PHOTO_BUCKET, {
      public: false,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: Object.keys(MIME_EXT),
    })
    if (error && !/already exists/i.test(error.message || '')) throw error
  }
  bucketReady = true
}

export async function uploadSurveyPhoto({ dataUrl, name, customer_id, site_id, visit_id, line_id }) {
  if (!dataUrl) fail(400, 'Photo upload failed — send a data URL (data:<mime>;base64,...)')
  const m = String(dataUrl).match(/^data:(.+?);base64,(.*)$/)
  if (!m) fail(400, 'Photo upload failed — send a data URL (data:<mime>;base64,...)')
  const mime = (m[1] || '').split(';')[0].trim().toLowerCase()
  const ext = MIME_EXT[mime]
  if (!ext) fail(400, 'Images only (jpeg, png, webp, heic)')
  const buffer = Buffer.from(m[2], 'base64')
  if (!buffer.length) fail(400, 'Empty image')
  if (buffer.length > MAX_BYTES) fail(400, 'Image must be 10 MB or smaller')
  const dims = readImageSize(buffer, mime)
  if (!dims) fail(400, 'Could not read image dimensions; send a JPEG, PNG or WebP with long side 1600 px or smaller')
  if (Math.max(dims.w, dims.h) > 1600) {
    fail(400, `Image long side must be 1600 px or smaller (got ${dims.w}×${dims.h})`)
  }
  if (!customer_id || !site_id || !visit_id || !line_id) fail(400, 'Photo path requires customer, site, visit and line')

  await ensureSurveyPhotoBucket()
  const rand = Math.random().toString(36).slice(2, 8)
  const path = `${customer_id}/${site_id}/${visit_id}/${line_id}/${Date.now()}-${rand}.${ext}`
  const { error } = await supabase.storage.from(SURVEY_PHOTO_BUCKET).upload(path, buffer, {
    contentType: mime === 'image/jpg' ? 'image/jpeg' : mime,
    upsert: false,
  })
  if (error) fail(422, `Photo upload failed: ${error.message}`)
  const fromName = (name || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
  return { path, name: fromName || `photo.${ext}` }
}

export async function signSurveyPhoto(path, expiresSec = 3600) {
  if (!path) return null
  const { data } = await supabase.storage.from(SURVEY_PHOTO_BUCKET).createSignedUrl(path, expiresSec)
  return data?.signedUrl || null
}

/** Remove objects from survey-photos. Throws if storage removal fails so callers can keep DB rows. */
export async function removeSurveyPhotos(paths) {
  const list = [...new Set((paths || []).filter(Boolean))]
  if (!list.length) return
  const { error } = await supabase.storage.from(SURVEY_PHOTO_BUCKET).remove(list)
  if (error) fail(422, `Photo storage delete failed: ${error.message}`)
}
