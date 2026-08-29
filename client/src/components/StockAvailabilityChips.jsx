/** Read-only stock availability chips (INV-008/009). */
export function StockAvailabilityChips({ available, reserved, incoming, from_stock, to_purchase, compact }) {
  const a = Number(available) || 0
  const r = Number(reserved) || 0
  const inc = Number(incoming) || 0
  const fs = from_stock != null ? Number(from_stock) : null
  const tp = to_purchase != null ? Number(to_purchase) : null
  const chips = []
  if (a > 0) chips.push({ label: `Available ${a}`, cls: 'bg-emerald-50 text-emerald-700' })
  if (r > 0) chips.push({ label: `Reserved ${r}`, cls: 'bg-amber-50 text-amber-700' })
  if (inc > 0) chips.push({ label: `Incoming ${inc}`, cls: 'bg-sky-50 text-sky-700' })
  if (fs != null && fs > 0) chips.push({ label: `From stock ${fs}`, cls: 'bg-emerald-50/80 text-emerald-800' })
  if (tp != null && tp > 0) chips.push({ label: `To purchase ${tp}`, cls: 'bg-slate-100 text-slate-700' })
  if (!chips.length) chips.push({ label: 'To purchase', cls: 'bg-slate-100 text-slate-600' })
  return (
    <span className={`flex flex-wrap gap-1 ${compact ? 'mt-0.5' : 'mt-1'}`}>
      {chips.map((c) => (
        <span key={c.label} className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${c.cls}`}>{c.label}</span>
      ))}
    </span>
  )
}
