import { supabase } from '../config/supabase.js'

/** Fill item_code, description, specifications, pos from Item Master when line snapshot is incomplete. */
export async function enrichQuotationLines(lines = []) {
  if (!lines?.length) return []
  const ids = [...new Set(lines.map((l) => l.item_id).filter(Boolean))]
  let byId = {}
  if (ids.length) {
    const { data } = await supabase
      .from('items')
      .select('id, item_code, code, model, brand, description, specifications')
      .in('id', ids)
    byId = Object.fromEntries((data || []).map((i) => [i.id, i]))
  }
  return lines.map((line) => {
    const item = line.item_id ? byId[line.item_id] : null
    return {
      ...line,
      item_code: line.item_code || item?.item_code || item?.code || line.model || null,
      description: line.description || item?.description || null,
      specifications: line.specifications || item?.specifications || null,
      brand: line.brand || item?.brand || null,
      model: line.model || item?.model || null,
      pos: line.pos || line.area || null,
    }
  })
}

export async function enrichQuotationRecord(q) {
  if (!q) return q
  const items = await enrichQuotationLines(q.quotation_items || [])
  return { ...q, quotation_items: items }
}

export async function enrichQuotationList(rows = []) {
  return Promise.all((rows || []).map(enrichQuotationRecord))
}
