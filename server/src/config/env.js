import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// Load .env by ABSOLUTE path (works regardless of the process working directory)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'JWT_SECRET']
const missing = required.filter((k) => !process.env[k])
if (missing.length) {
  console.warn('\n⚠️  Missing env vars: ' + missing.join(', '))
  console.warn('   Copy .env.example → .env and fill Supabase + JWT values.\n')
}

export const env = {
  port: Number(process.env.PORT) || 5050,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,
  jwtSecret: process.env.JWT_SECRET || 'dev-insecure-secret',
  jwtExpires: process.env.JWT_EXPIRES || '8h',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map((s) => s.trim()),
}
