// AUTOMATIC EOS SYNC — CEO rule R2:
//   "Only approved items should be synchronized automatically to the ERP Item Master.
//    EOS will be the single source of truth for all item data."
//
// Two things run on every pass:
//   1. PULL — any APPROVED EOS entry that is not yet in the ERP is imported (de-duplicated by
//      eos_entry_id and by brand+model, so a re-run never creates a second copy).
//   2. REFRESH — every ERP item already linked to EOS is re-pulled; if EOS changed the engineering
//      data the item is updated and a version snapshot is written. Unchanged items are skipped
//      (content hash), so a quiet sync costs almost nothing.
//
// Interval + on/off live in system_settings (DB), so the owner changes them from Company Settings —
// nothing here is hardcoded.
import { supabase } from '../config/supabase.js'
import { setting } from './policy.js'
import { eosPending, importEosEntries, syncLinkedItems } from './eos.js'

let timer = null
let running = false
let last = null
/** Last timer-driven pass finished_at (fallback sync — primary is approval webhook). */
let lastTimerRunAt = null
/** Last successful webhook import stamp (Sprint 2 Block 3). */
let lastWebhookAt = null

export function lastEosSync() { return last }
export function lastEosTimerRunAt() { return lastTimerRunAt }
export function lastWebhookImportAt() { return lastWebhookAt }
export function markWebhookImport() {
  lastWebhookAt = new Date().toISOString()
  return lastWebhookAt
}

export async function runEosSync({ trigger = 'auto' } = {}) {
  if (running) return { skipped: true, reason: 'a sync is already running' }
  running = true
  const started = new Date().toISOString()
  const report = { trigger, started, imported: 0, updated: 0, unchanged: 0, failed: 0, errors: [] }
  try {
    // 1) PULL newly-approved entries that the ERP does not have yet
    const pending = await eosPending({ limit: 200 })
    const newIds = (pending.entries || []).filter((e) => !e.imported).map((e) => e.id)
    if (newIds.length) {
      const r = await importEosEntries(newIds, null)
      report.imported = r.created || 0
      report.failed += r.failed || 0
      if (r.errors?.length) report.errors.push(...r.errors.slice(0, 5))
    }

    // 2) REFRESH the items already linked to EOS
    const s = await syncLinkedItems(null)
    report.updated = s.updated || 0
    report.unchanged = s.unchanged || 0
    report.failed += s.failed || 0
    if (s.errors?.length) report.errors.push(...s.errors.slice(0, 5))

    report.ok = true
  } catch (e) {
    report.ok = false
    report.errors.push({ error: e.message })
  } finally {
    report.finished = new Date().toISOString()
    running = false
    last = report
    if (trigger === 'auto' || String(trigger).startsWith('auto')) {
      lastTimerRunAt = report.finished
    }
  }
  // a quiet sync is not worth a log line every fallback interval
  if (report.imported || report.updated || report.failed) {
    console.log(`[eos-sync:${trigger}] imported ${report.imported} · updated ${report.updated} · unchanged ${report.unchanged} · failed ${report.failed}`)
  }
  return report
}

// Start the background loop. Reads its own settings each tick, so switching it off (or changing the
// interval) in the DB takes effect without a restart.
// Cadence default 60 min — FALLBACK only; primary path is EOS approval webhook (Block 3).
export function startEosAutoSync() {
  if (timer) return
  const tick = async () => {
    try {
      const on = (await setting('eos_auto_sync', 'on')).toLowerCase() === 'on'
      if (!on) return
      await runEosSync({ trigger: 'auto' })
    } catch (e) {
      console.warn('[eos-sync] tick failed:', e.message)
    }
  }
  // check every minute whether it is time; the DB setting decides the real cadence
  let elapsed = 0
  timer = setInterval(async () => {
    elapsed += 1
    const mins = Number(await setting('eos_auto_sync_minutes', '60')) || 60
    if (elapsed >= mins) { elapsed = 0; await tick() }
  }, 60_000)
  timer.unref?.()
  console.log('[eos-sync] EOS → Item Master FALLBACK timer armed (primary = approval webhook; interval from system_settings, default 60m)')
}

export function stopEosAutoSync() { if (timer) { clearInterval(timer); timer = null } }
