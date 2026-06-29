import pg from 'pg'
const API = 'https://commons.wikimedia.org/w/api.php'

async function findImage(terms) {
  for (const term of terms) {
    const u = `${API}?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(term)}&gsrlimit=10&gsrnamespace=6&prop=imageinfo&iiprop=url|mime&iiurlwidth=640`
    try {
      const r = await fetch(u, { headers: { 'User-Agent': 'CulinovaERP-seed/1.0' } })
      const j = await r.json()
      const pages = Object.values(j.query?.pages || {})
      for (const p of pages) {
        const info = p.imageinfo?.[0]
        if (!info?.thumburl || !/image\/(jpeg|png)/.test(info.mime || '')) continue
        try {
          const h = await fetch(info.thumburl, { headers: { 'User-Agent': 'CulinovaERP-seed/1.0' } })
          if (h.ok && /image\//.test(h.headers.get('content-type') || '')) return info.thumburl
        } catch { /* try next */ }
      }
    } catch { /* try next term */ }
  }
  return null
}

const map = [
  ['C-G941', ['commercial gas range cooker stainless steel', 'gas range stove kitchen', 'cooking range gas']],
  ['G4S98', ['commercial deep fryer stainless', 'deep fryer kitchen', 'electric deep fryer']],
  ['SCC-101', ['combi steam oven', 'commercial convection oven', 'combi oven kitchen']],
  ['G9F4M', ['gas cooker stove commercial kitchen', 'gas hob stove', 'kitchen gas stove']],
  ['HOOD-3M', ['commercial kitchen exhaust hood', 'kitchen range hood stainless', 'extractor hood kitchen']],
  ['WT-180', ['stainless steel kitchen work table', 'stainless steel table kitchen', 'kitchen prep table']],
]

const c = new pg.Client({ host: 'aws-1-ap-southeast-2.pooler.supabase.com', port: 5432, user: 'postgres.bliwbbhfujxsbquinydr', password: '20Pakistan1000!', database: 'postgres', ssl: { rejectUnauthorized: false } })
await c.connect()
for (const [model, terms] of map) {
  const url = await findImage(terms)
  if (!url) { console.log('✗ no image found for', model); continue }
  await c.query('update items set image_url=$1 where model=$2', [url, model])
  console.log('✓', model, '→', url.slice(0, 90))
}
await c.end()
process.exit(0)
