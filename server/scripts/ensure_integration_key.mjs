// Ensure ERP ↔ EOS share the same integration key in both .env files (dev only).
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const erpEnv = path.resolve(__dirname, '../.env')
const eosEnv = path.resolve(__dirname, '../../../Culinova-RAG-knowledgebase/server/.env')

const KEY_NAMES = ['ERP_EOS_INTEGRATION_KEY', 'ERP_INTEGRATION_KEY']

function readEnv(file) {
  if (!fs.existsSync(file)) return { text: '', map: new Map() }
  const text = fs.readFileSync(file, 'utf8')
  const map = new Map()
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m) map.set(m[1], m[2])
  }
  return { text, map }
}

function existingKey(map) {
  for (const k of KEY_NAMES) {
    const v = (map.get(k) || '').trim()
    if (v) return v
  }
  return ''
}

function upsertKey(text, keyName, value) {
  const re = new RegExp(`^${keyName}=.*$`, 'm')
  if (re.test(text)) return text.replace(re, `${keyName}=${value}`)
  return text.trimEnd() + `\n${keyName}=${value}\n`
}

const erp = readEnv(erpEnv)
const eos = readEnv(eosEnv)
const isProd = process.env.VERCEL || process.env.NODE_ENV === 'production'
let key = existingKey(erp.map) || existingKey(eos.map)
if (!key) {
  key = crypto.randomBytes(24).toString('hex')
  console.log('  generated new integration key')
}

let erpText = erp.text
if (!erpText) {
  console.error('  ERP .env not found — copy .env.example first')
  process.exit(1)
}
erpText = upsertKey(erpText, 'ERP_EOS_INTEGRATION_KEY', key)
if (!isProd) {
  if (!/^EOS_API_URL=/m.test(erpText)) {
    erpText = erpText.trimEnd() + '\nEOS_API_URL=http://localhost:4400\n'
  } else {
    erpText = erpText.replace(/^EOS_API_URL=.*$/m, 'EOS_API_URL=http://localhost:4400')
  }
}
fs.writeFileSync(erpEnv, erpText)

if (!eos.text) {
  console.warn('  EOS .env not found — key written to ERP only')
} else {
  let eosText = eos.text
  eosText = upsertKey(eosText, 'ERP_INTEGRATION_KEY', key)
  if (!isProd && !/^ERP_API_URL=/m.test(eosText)) eosText = eosText.trimEnd() + '\nERP_API_URL=http://localhost:5050\n'
  fs.writeFileSync(eosEnv, eosText)
}

console.log('\n######## INTEGRATION KEY READY ########')
console.log('  ERP .env → ERP_EOS_INTEGRATION_KEY + EOS_API_URL=http://localhost:4400')
console.log('  EOS .env → ERP_INTEGRATION_KEY + ERP_API_URL')
console.log('  Restart BOTH servers for changes to take effect.\n')
process.env.ERP_EOS_INTEGRATION_KEY = key
process.env.ERP_INTEGRATION_KEY = key
