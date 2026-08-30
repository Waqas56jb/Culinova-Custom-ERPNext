/**
 * S4B2 — reusable Item Master picker filters (Family + Category).
 * Combinable with parent text search.
 */
import { useMemo } from 'react'

export default function ItemPickerFilters({
  items = [],
  family = '',
  category = '',
  onFamily,
  onCategory,
  className = '',
}) {
  const families = useMemo(() => (
    Array.from(new Set((items || []).map((i) => i.product_family).filter(Boolean))).sort()
  ), [items])
  const categories = useMemo(() => (
    Array.from(new Set((items || []).map((i) => i.item_group || i.category).filter(Boolean))).sort()
  ), [items])

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <label className="min-w-[9rem] flex-1">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Family</span>
        <select
          value={family}
          onChange={(e) => onFamily?.(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-brand-400"
        >
          <option value="">All families</option>
          {families.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </label>
      <label className="min-w-[9rem] flex-1">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Category</span>
        <select
          value={category}
          onChange={(e) => onCategory?.(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-brand-400"
        >
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
    </div>
  )
}

/** Filter Item Master rows by family + category + text (case-insensitive). */
export function filterItems(items, { q = '', family = '', category = '', limit = 40 } = {}) {
  const t = q.trim().toLowerCase()
  let list = (items || []).filter((i) => !i.disabled)
  if (family) list = list.filter((i) => i.product_family === family)
  if (category) list = list.filter((i) => (i.item_group || i.category) === category)
  if (t) {
    list = list.filter((i) => {
      const hay = `${i.item_name || i.name || ''} ${i.item_code || i.code || ''} ${i.brand || ''} ${i.model || ''}`.toLowerCase()
      return hay.includes(t)
    })
  }
  return list.slice(0, limit)
}
