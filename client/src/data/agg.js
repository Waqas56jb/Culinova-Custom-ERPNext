// Live monthly aggregation helpers — build real trend series from store data (replaces mock series).
export function monthly(rows, { date = 'created_at', value, count = false, months = 6 } = {}) {
  const now = new Date()
  const buckets = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, m: d.toLocaleString('en', { month: 'short' }), v: 0 })
  }
  const idx = {}
  buckets.forEach((b, i) => { idx[b.key] = i })
  for (const r of rows || []) {
    const dt = r[date] || r.created_at
    if (!dt) continue
    const d = new Date(dt)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    if (key in idx) buckets[idx[key]].v += count ? 1 : (Number(r[value]) || 0)
  }
  return buckets
}

// combine two monthly series into a chart dataset with named keys
export function zip(a, b, keyA, keyB, scale = (n) => n) {
  return a.map((row, i) => ({ m: row.m, [keyA]: scale(row.v), [keyB]: scale((b[i] || { v: 0 }).v) }))
}

export const k1000 = (n) => Math.round((Number(n) || 0) / 1000) // SAR → '000
