import { Router } from 'express'
import authRoutes from '../modules/auth/auth.routes.js'
import usersRoutes from '../modules/users/users.routes.js'
import portalRoutes from '../modules/portal/portal.routes.js'
import salesRoutes from '../modules/sales/sales.routes.js'
import notificationsRoutes from '../modules/notifications/notifications.routes.js'
import pmRoutes from '../modules/pm/pm.routes.js'
import { resources } from '../core/resources.js'
import { crudRouter } from '../core/crud.js'
import { rolePanels } from '../rbac/permissions.js'
import { authRequired } from '../middleware/auth.js'

const api = Router()

api.get('/health', (req, res) => res.json({ ok: true, service: 'culinova-erp-server' }))
api.use('/auth', authRoutes)

// what panels can the logged-in user see (drives frontend UI hiding)
api.get('/my-access', authRequired, (req, res) => {
  res.json({ role: req.user.role, access_level: req.user.access_level, panels: rolePanels[req.user.role] || [] })
})

// Dedicated secure modules (mounted before generic CRUD)
api.use('/users', usersRoutes)
api.use('/portal', portalRoutes)
api.use('/sales', salesRoutes)
api.use('/notifications', notificationsRoutes)
api.use('/pm', pmRoutes)

// Generic config-driven REST for every resource/panel
for (const [name, cfg] of Object.entries(resources)) {
  api.use(`/${name}`, crudRouter(name, cfg))
}

export default api
