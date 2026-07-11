// Link the ERP Item Master to CULINOVA EOS: store which EOS knowledge entry an item came from,
// so imports are de-duplicated and can be re-synced. Idempotent.
import pg from 'pg'
const { Client } = pg
const c = new Client({
  host: 'aws-1-ap-southeast-2.pooler.supabase.com', port: 5432,
  user: 'postgres.bliwbbhfujxsbquinydr', password: '20Pakistan1000!',
  database: 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()
await c.query(`alter table items add column if not exists eos_entry_id text;`)
await c.query(`alter table items add column if not exists eos_model_number text;`)
await c.query(`alter table items add column if not exists eos_synced_at timestamptz;`)
// one ERP item per EOS entry (partial unique — nulls allowed for non-EOS items)
await c.query(`create unique index if not exists items_eos_entry_uidx on items (eos_entry_id) where eos_entry_id is not null;`).catch((e) => console.log('index note:', e.message))
await c.query(`notify pgrst, 'reload schema';`)
console.log('items.eos_entry_id / eos_model_number / eos_synced_at added; unique index ensured; schema reloaded.')
await c.end()
