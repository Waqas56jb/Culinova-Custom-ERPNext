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
import { adjustmentsRouter, transfersRouter, deliveryNotesRouter, receiptsRouter } from '../modules/stock/stock.routes.js'
// ── Phase 2 modules ──
import { pricingRouter } from '../modules/pricing/pricing.routes.js'         // M2 Pricing Engine
import { costingRouter } from '../modules/costing/costing.routes.js'         // M3 Cost Engine
import { rfqRouter } from '../modules/procurement/rfq.routes.js'             // M4 RFQ Management
import { quotationRouter } from '../modules/sales/quotation.routes.js'       // M5 Quotation System
import { boqRouter } from '../modules/boq/boq.routes.js'                     // M6 BOQ Management
import { prRouter, procurementReportsRouter } from '../modules/procurement/pr.routes.js' // M7 Procurement
import { equipmentRouter } from '../modules/pm/equipment.routes.js'          // M8 Project Equipment
import { aiRouter } from '../modules/ai/ai.routes.js'                        // M9 AI Business Intelligence
import { lookupsRouter } from '../modules/lookups/lookups.routes.js'         // shared cross-panel pickers
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

// ── Phase 2 modules (mounted BEFORE the generic CRUD so their specific verbs win; unmatched
//    verbs like plain list/patch/delete fall through to the generic resource where one exists) ──
api.use('/pricing', pricingRouter())            // M2 Pricing Engine (landed cost chain · FX · templates)
api.use('/cost-sheets', costingRouter())        // M3 Cost Engine (cost sheets + profitability)
api.use('/rfqs', rfqRouter())                   // M4 RFQ create/detail/send/quote/compare/award (list falls through)
api.use('/quotations', quotationRouter())       // M5 Quotation builder (lines · EOS spec snapshot · terms · revisions)
api.use('/boqs', boqRouter())                   // M6 BOQ Management (grouping · cost summary · export)
api.use('/purchase-requisitions', prRouter())   // M7 Purchase Requisitions + supplier allocation
api.use('/procurement', procurementReportsRouter()) // M7 delivery-tracking + supplier-performance reports
api.use('/project-equipment', equipmentRouter())// M8 Project Equipment (assign · status workflow · summary)
api.use('/ai', aiRouter())                      // M9 AI Business Intelligence (real analytics + optional narrative)
api.use('/lookups', lookupsRouter())            // shared read-only pickers (projects/customers/suppliers/items/warehouses)

// STOCK MOVEMENT — these intercept POST at the same paths as the generic CRUD so creating a
// document ALSO moves real stock (stock_balances + stock_ledger). Other verbs fall through.
api.use('/stock-adjustments', adjustmentsRouter())
api.use('/stock-transfers', transfersRouter())
api.use('/delivery-notes', deliveryNotesRouter())
api.use('/goods-receipt', receiptsRouter())   // POST /goods-receipt/receive-po/:id

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
