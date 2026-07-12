import { Router } from 'express'
import authRoutes from '../modules/auth/auth.routes.js'
import usersRoutes from '../modules/users/users.routes.js'
import portalRoutes from '../modules/portal/portal.routes.js'
import salesRoutes from '../modules/sales/sales.routes.js'
import notificationsRoutes from '../modules/notifications/notifications.routes.js'
import pmRoutes from '../modules/pm/pm.routes.js'
import inventoryRoutes from '../modules/inventory/inventory.routes.js'
import itemRoutes from '../modules/item/item.routes.js'
import mastersRoutes from '../modules/item/masters.routes.js'
import eosRoutes from '../modules/eos/eos.routes.js'
import settingsRoutes from '../modules/settings/settings.routes.js'
import searchRoutes from '../modules/search/search.routes.js'
import { partyRouter, partyCategoriesRouter } from '../modules/parties/party.routes.js'
import adminRoutes from '../modules/admin/admin.routes.js'
import filesRoutes from '../modules/files/files.routes.js'
import prefsRoutes from '../modules/prefs/prefs.routes.js'
import procurementRoutes from '../modules/procurement/procurement.routes.js'
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
api.use('/inventory', inventoryRoutes)
api.use('/items', itemRoutes)        // full ERPNext-style Item Master (replaces generic)
api.use('/masters', mastersRoutes)   // item-groups / brands / item-attributes
api.use('/eos', eosRoutes)           // CULINOVA EOS knowledge base → Item Master import/sync
api.use('/settings', settingsRoutes) // Company Settings: company/branches/departments/currencies/VAT/numbering
api.use('/search', searchRoutes)     // Global cross-entity search
api.use('/admin', adminRoutes)       // Admin: audit trail · RBAC matrix · approval workflow
api.use('/documents', filesRoutes)   // File/Document management with version history
api.use('/preferences', prefsRoutes) // Per-user preferences (dashboard layout etc.)
api.use('/procurement', procurementRoutes) // RFQs enriched with supplier quotes

// Customer / Supplier enrichment (detail + contacts/addresses/documents) — layered BEFORE the
// generic CRUD so /:id and child routes take precedence; base list/create/update stays generic.
api.use('/customers', partyRouter('customer', 'sales'))
api.use('/suppliers', partyRouter('supplier', 'procurement'))
api.use('/party-categories', partyCategoriesRouter())

// Generic config-driven REST for every resource/panel
for (const [name, cfg] of Object.entries(resources)) {
  api.use(`/${name}`, crudRouter(name, cfg))
}

export default api
