import { createApp } from './app.js'
import { env } from './config/env.js'
import { startEosAutoSync } from './core/eosautosync.js'

createApp().listen(env.port, () => {
  console.log(`\n🚀 CULINOVA ERP API running on http://localhost:${env.port}`)
  console.log(`   Health: http://localhost:${env.port}/api/health\n`)
  // EOS is the single source of truth for items — approved EOS entries flow into the Item Master
  // automatically (interval + on/off live in system_settings, so no restart is needed to change them).
  startEosAutoSync()
})
