import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import { env } from './config/env.js'
import api from './routes/index.js'
import { notFound, errorHandler } from './middleware/error.js'

export function createApp() {
  const app = express()
  // CORS '*' (or unset) → reflect any origin. Auth is via Bearer token, not cookies.
  app.use(cors({ origin: env.corsOrigins.includes('*') ? true : env.corsOrigins, credentials: true }))
  app.use(express.json({ limit: '2mb' }))
  app.use(morgan('dev'))

  app.get('/', (req, res) => res.json({ service: 'CULINOVA ERP API', version: '0.1.0', docs: '/api/health' }))
  app.use('/api', api)

  app.use(notFound)
  app.use(errorHandler)
  return app
}
