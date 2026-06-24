import { createApp } from './app.js'
import { env } from './config/env.js'

createApp().listen(env.port, () => {
  console.log(`\n🚀 CULINOVA ERP API running on http://localhost:${env.port}`)
  console.log(`   Health: http://localhost:${env.port}/api/health\n`)
})
