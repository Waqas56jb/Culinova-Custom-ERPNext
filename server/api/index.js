// Vercel serverless entry — exports the Express app as the function handler.
// (Local dev still uses `npm run dev` → src/server.js which calls app.listen.)
import { createApp } from '../src/app.js'

export default createApp()
