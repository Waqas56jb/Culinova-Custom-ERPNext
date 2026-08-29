import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'

const DataCtx = createContext(null)
export const useData = () => useContext(DataCtx)

const today = () => new Date().toISOString().slice(0, 10)
const d10 = (r) => (r.created_at || '').slice(0, 10) || today()
const me = () => { try { return JSON.parse(localStorage.getItem('culinova_user') || 'null') } catch { return null } }
// readable, reasonably-unique code when the user leaves a Code field blank (avoids a silent NULL in a shown column)
const slugCode = (prefix, name) => `${prefix}-${(String(name || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'NEW')}-${String(Date.now()).slice(-4)}`
// module-level resolver maps, refreshed by the store as reference data loads (projects / team / sales orders).
// Mappers are pure module-level fns, so they read the latest id→label here rather than from React state.
const _maps = { users: {}, projects: {}, salesOrders: {} }
const userName = (id) => (id && _maps.users[id]?.name) || ''
const projNumber = (id) => (id && _maps.projects[id]?.number) || '—'   // project_id (uuid) → readable number, never the raw uuid
const soNumber = (id) => (id && _maps.salesOrders[id]?.number) || '—'
// owner_id (uuid) → readable name via the users map; the logged-in user for their own rows; never the literal 'Other'
const ownerName = (id) => { if (!id) return '—'; const n = userName(id); if (n) return n; const u = me(); return u && id === u.id ? u.name : '—' }

// ── DB row → UI shape mappers (snake_case → the fields the pages read) ──
const mapCustomer = (r) => ({ ...r, group: r.category || '—', business: r.business ?? 0, outstanding: Number(r.outstanding) || 0 })
const mapLead = (r) => ({
  ...r,
  value: Number(r.est_value) || 0,
  owner: ownerName(r.assigned_to_id || r.owner_id),
  assignedTo: ownerName(r.assigned_to_id),
  createdBy: ownerName(r.created_by_id),
  date: d10(r),
  ref: r.number,
  location: [r.project_city, r.project_district].filter(Boolean).join(' → ') || '',
})
const mapOpp = (r) => ({
  ...r,
  value: Number(r.value) || 0,
  prob: r.probability ?? 0,
  close: r.next_action_date || '',
  owner: ownerName(r.owner_id),
  ref: r.number,
  location: r.project_location || [r.project_city, r.project_district].filter(Boolean).join(' → ') || '',
})
const mapQuote = (r) => ({
  ...r, amount: Number(r.total_amount) || 0, gp: Number(r.gp_percent) || 0, discount: Number(r.discount_pct) || 0,
  validity: r.validity_days, approval: r.approval_status, email: r.customer_email,
  owner: ownerName(r.owner_id), date: d10(r), ref: r.number,
  // keep the WHOLE snapshotted line (brand/model/uom/specs/image/datasheet/discount_pct/amount) —
  // dropping it made the PDF reprice discounted lines itself and disagree with the server's net_amount
  items: (r.quotation_items || []).map((it) => ({ ...it, name: it.item_name })),
})
const mapSO = (r) => ({ ...r, amount: Number(r.amount) || 0, delivery: r.delivery_status, billing: r.billing_status, project: r.project_number || projNumber(r.project_id), projectNo: r.project_number || projNumber(r.project_id), boqDone: r.boq_done ?? 0, boqTotal: r.boq_total ?? 0, progress: r.progress ?? 0, date: d10(r), ref: r.number })
const mapProject = (r) => ({ ...r, contractValue: Number(r.contract_value) || 0, actualCost: Number(r.actual_cost) || 0, committedCost: Number(r.committed_cost) || 0, billed: Number(r.billed) || 0, collected: Number(r.collected) || 0, progress: r.progress ?? 0, start: r.start_date || '', end: r.end_date || '', manager: userName(r.manager_id) || 'Unassigned', salesOrder: soNumber(r.sales_order_id), ref: r.number, boq: [], tasks: [], variations: [] })
const mapSupplier = (r) => ({ ...r, onTime: r.on_time ?? 0, totalPOs: r.totalPOs ?? 0, rating: Number(r.rating) || 0 })
const mapRFQ = (r) => ({ ...r, item: r.item_name, project: projNumber(r.project_id), suppliers: r.suppliers || [], awarded: r.awarded_supplier, date: d10(r), ref: r.number })
const mapPO = (r) => ({ ...r, item: r.item_name, project: r.project_number || projNumber(r.project_id), amount: Number(r.amount) || 0, qty: Number(r.qty) || 1, date: d10(r), ref: r.number })
const mapItem = (r) => ({ ...r, group: r.item_group, rate: Number(r.selling_rate) || 0, qty: r.qty ?? 0, reorder: Number(r.reorder_level) || 0 })
// enriched stock (physical/reserved/available/incoming/aging) from /inventory/stock
const mapStock = (r) => ({ code: r.code, name: r.item, group: r.group, warehouse: r.warehouse, uom: r.uom || 'Nos', qty: r.physical ?? 0, physical: r.physical ?? 0, reserved: r.reserved ?? 0, available: r.available ?? 0, incoming: r.incoming ?? 0, aging: r.aging_days ?? 0, reorder: r.reorder_level ?? 0, rate: Number(r.rate) || 0 })
const mapDN = (r) => ({ ...r, item: r.item_name, project: r.project_id, value: Number(r.value) || 0, date: d10(r), ref: r.number })
const mapInvoice = (r) => ({ ...r, total: Number(r.total) || 0, paid: Number(r.paid) || 0, project: r.project_id || '—', due: r.due_date || d10(r), date: d10(r), ref: r.number })
const mapPayment = (r) => ({ ...r, number: r.number, ref: r.number, reference: r.reference, amount: Number(r.amount) || 0, date: d10(r) })
const mapPayable = (r) => ({ ...r, amount: Number(r.amount) || 0, paid: Number(r.paid) || 0, date: d10(r), ref: r.number })
const mapSnag = (r) => ({ ...r, item: r.item_name, project: r.project_id, date: d10(r) })
const mapTest = (r) => ({ ...r, project: r.project_id })
const mapTicket = (r) => ({ ...r, date: d10(r), ref: r.number })
const mapVisit = (r) => ({ ...r, date: r.visit_date || d10(r), ref: r.number })
const mapContract = (r) => ({ ...r, date: d10(r), ref: r.number })
const mapEmployee = (r) => ({ ...r, salary: Number(r.salary) || 0, today: r.today_status })
const mapLeave = (r) => ({ ...r, from: r.from_date, to: r.to_date })

export function DataProvider({ children }) {
  const { user, panels } = useAuth()
  const allowed = (panel) => panels.includes('*') || panels.includes(panel)
  const [leads, setLeads] = useState([])
  const [opportunities, setOpportunities] = useState([])
  const [quotations, setQuotations] = useState([])
  const [salesOrders, setSalesOrders] = useState([])
  const [customers, setCustomers] = useState([])
  const [emails, setEmails] = useState([])
  const [projects, setProjects] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [rfqs, setRfqs] = useState([])
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [stockItems, setStockItems] = useState([])
  const [deliveryNotes, setDeliveryNotes] = useState([])
  const [invoices, setInvoices] = useState([])
  const [payables, setPayables] = useState([])
  const [payments, setPayments] = useState([])
  const [snags, setSnags] = useState([])
  const [commissioning, setCommissioning] = useState([])
  const [tickets, setTickets] = useState([])
  const [visits, setVisits] = useState([])
  const [contracts, setContracts] = useState([])
  const [employees, setEmployees] = useState([])
  const [leaves, setLeaves] = useState([])
  const [interactions, setInteractions] = useState([])
  const [chatMessages, setChatMessages] = useState([])
  const [customerDir, setCustomerDir] = useState([])
  const [team, setTeam] = useState([])
  const [items, setItems] = useState([])              // Item Master (full ERPNext-style)
  const [itemGroups, setItemGroups] = useState([])
  const [brands, setBrands] = useState([])
  const [itemAttributes, setItemAttributes] = useState([])
  const [productFamilies, setProductFamilies] = useState([])
  const [priceLists, setPriceLists] = useState([])
  const [payrollStatus, setPayrollStatus] = useState('Pending')
  // true when the last refresh could not reach the backend — the UI shows a banner instead of
  // pretending every KPI is genuinely zero
  const [offline, setOffline] = useState(false)
  const [settings, setSettings] = useState({ companies: [], branches: [], departments: [], currencies: [], vatSettings: [], numberingSeries: [] })

  // resource registry: key → { ep, set, map, panel }
  const SOURCES = {
    customers: { ep: 'customers', set: setCustomers, map: mapCustomer, panel: 'sales' },
    leads: { ep: 'leads', set: setLeads, map: mapLead, panel: 'sales' },
    opportunities: { ep: 'opportunities', set: setOpportunities, map: mapOpp, panel: 'sales' },
    salesOrders: { ep: 'sales/orders', set: setSalesOrders, map: mapSO, panel: 'sales' },
    suppliers: { ep: 'suppliers', set: setSuppliers, map: mapSupplier, panel: 'procurement' },
    rfqs: { ep: 'procurement/rfqs', set: setRfqs, map: mapRFQ, panel: 'procurement' },
    purchaseOrders: { ep: 'purchase-orders', set: setPurchaseOrders, map: mapPO, panel: 'procurement' },
    warehouses: { ep: 'warehouses', set: setWarehouses, map: (r) => r, panel: 'warehouse' },
    stockItems: { ep: 'inventory/stock', set: setStockItems, map: mapStock, panel: 'warehouse' },
    deliveryNotes: { ep: 'delivery-notes', set: setDeliveryNotes, map: mapDN, panel: 'warehouse' },
    invoices: { ep: 'invoices', set: setInvoices, map: mapInvoice, panel: 'finance' },
    payments: { ep: 'payments', set: setPayments, map: mapPayment, panel: 'finance' },
    payables: { ep: 'payables', set: setPayables, map: mapPayable, panel: 'finance' },
    snags: { ep: 'snags', set: setSnags, map: mapSnag, panel: 'site' },
    commissioning: { ep: 'commissioning', set: setCommissioning, map: mapTest, panel: 'site' },
    tickets: { ep: 'service-tickets', set: setTickets, map: mapTicket, panel: 'service' },
    visits: { ep: 'maintenance-visits', set: setVisits, map: mapVisit, panel: 'service' },
    contracts: { ep: 'service-contracts', set: setContracts, map: mapContract, panel: 'service' },
    employees: { ep: 'employees', set: setEmployees, map: mapEmployee, panel: 'hr' },
    leaves: { ep: 'leaves', set: setLeaves, map: mapLeave, panel: 'hr' },
    interactions: { ep: 'interactions', set: setInteractions, map: (r) => ({ ...r, date: d10(r) }), panel: 'sales' },
  }

  // A failed fetch must NEVER wipe good data to zero — that turns a dropped connection into a screen
  // full of confident "0"s (an outright lie). keep() applies the result only on success, and records
  // the failure so the UI can say "can't reach the server" instead of silently showing an empty ERP.
  // A 403 is NOT a connection problem: the role legitimately has no access, so we let it fall through
  // as a normal empty result (the panel gate above already handles that case).
  const keep = useCallback(async (fetcher, apply) => {
    try {
      const rows = await fetcher()
      apply(rows)
      setOffline(false)
      return true
    } catch (e) {
      if (/403|No access|access level/i.test(e?.message || '')) { apply([]); return false }  // genuinely not permitted
      setOffline(true)          // network / server error → KEEP the last-known data, flag the outage
      return false
    }
  }, [])

  const reload = useCallback(async (key) => {
    const s = SOURCES[key]; if (!s) return
    if (!allowed(s.panel)) { s.set([]); return }
    await keep(() => api('/' + s.ep), (rows) => s.set((rows || []).map(s.map)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panels, keep])

  const loadProjects = useCallback(async () => {
    if (!allowed('projects')) { setProjects([]); setTeam([]); return }
    await keep(async () => {
      const [ps, boq, tasks, vars, tm] = await Promise.all([
        api('/projects'), api('/project-boq').catch(() => []), api('/project-tasks').catch(() => []), api('/variations').catch(() => []), api('/pm/team').catch(() => []),
      ])
      setTeam(tm || [])
      return (ps || []).map((p) => ({
        ...mapProject(p),
        boq: (boq || []).filter((b) => b.project_id === p.id).map((b) => ({ ...b, item: b.item_name })),
        tasks: (tasks || []).filter((t) => t.project_id === p.id),
        variations: (vars || []).filter((v) => v.project_id === p.id).map((v) => ({ ...v, desc: v.description })),
      }))
    }, setProjects)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panels, keep])

  const loadQuotations = useCallback(async () => {
    if (!allowed('sales')) { setQuotations([]); return }   // role genuinely has no access → empty is the truth
    await keep(() => api('/sales/quotations'), (rows) => setQuotations((rows || []).map(mapQuote)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panels, keep])

  const loadChat = useCallback(async () => {
    if (!allowed('sales')) { setChatMessages([]); setCustomerDir([]); return }
    await keep(() => api('/sales/messages'), (rows) => setChatMessages(rows || []))
    await keep(() => api('/sales/customers-directory'), (dir) => setCustomerDir(dir || []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panels, keep])

  const loadBrands = useCallback(async () => {
    await keep(() => api('/masters/brands'), (r) => setBrands(r || []))
  }, [keep])

  const loadItems = useCallback(async () => {
    await keep(() => api('/items?active=1'), (r) => setItems(Array.isArray(r) ? r : (r?.items || [])))
    await keep(() => api('/masters/item-groups'), (r) => setItemGroups(r || []))
    await keep(() => api('/masters/brands'), (r) => setBrands(r || []))
    await keep(() => api('/masters/item-attributes'), (r) => setItemAttributes(r || []))
    await keep(() => api('/masters/product-families'), (r) => setProductFamilies(r || []))
    await keep(() => api('/masters/price-lists'), (r) => setPriceLists(r || []))
  }, [keep])

  // ── RESOLVER MAPS ── fill the module-level id→label maps so every mapper resolves project/owner/manager
  // to a readable value regardless of which panel owns the source. lookups/* is readable by any internal role,
  // so even a Stock/Procurement user (no projects panel) still gets project numbers instead of raw uuids.
  const loadRefMaps = useCallback(async () => {
    try {
      const ps = await api('/lookups/projects')
      _maps.projects = Object.fromEntries((ps || []).map((p) => [p.id, { number: p.ref, name: p.name }]))
    } catch { /* keep last-known map */ }
    try {
      // /lookups/team is readable by EVERY internal role; /pm/team is projects-panel only, so without
      // this fallback a non-PM role could never resolve an owner/manager/assignee name
      const tm = await api('/lookups/team')
      const m = {}; (tm || []).forEach((u) => { if (u?.id) m[u.id] = u })
      const cur = me(); if (cur?.id) m[cur.id] = m[cur.id] || { id: cur.id, name: cur.name }
      _maps.users = m
      // Expose the internal roster as `team` state too. The projects panel loads a richer /pm/team,
      // but Sales (no projects panel) never runs loadProjects — so without this the Owner / assign-to
      // dropdown on the Lead/Opportunity modal would be empty for every non-PM role. Fill only when the
      // PM path hasn't already populated a list, so its richer team wins when present.
      setTeam((prev) => (prev && prev.length ? prev : (tm || [])))
    } catch { const cur = me(); if (cur?.id && !_maps.users[cur.id]) _maps.users = { ..._maps.users, [cur.id]: { id: cur.id, name: cur.name } } }
    try {
      // a Project Manager cannot read the sales panel, so the project's originating Sales Order could
      // only ever render as '—'. The lookup exposes the number, never any money.
      const sos = await api('/lookups/sales-orders')
      _maps.salesOrders = Object.fromEntries((sos || []).map((s) => [s.id, { number: s.number, customer: s.customer }]))
    } catch { /* keep last-known map */ }
  }, [])

  // ── PAYROLL ── the run status is persisted (payroll_runs), so a completed run survives a page refresh.
  const loadPayroll = useCallback(async () => {
    if (!allowed('hr')) return
    try {
      const rows = await api('/payroll')
      const period = today().slice(0, 7)
      setPayrollStatus((rows || []).some((r) => r.period === period && r.status === 'Paid') ? 'Paid' : 'Pending')
    } catch { /* keep current status */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panels])

  // ── COMPANY SETTINGS loader (defined before loadAll which depends on it) ──
  const loadSettings = useCallback(async () => {
    const [companies, branches, departments, currencies, vatSettings, numberingSeries] = await Promise.all([
      api('/settings/companies').catch(() => []), api('/settings/branches').catch(() => []),
      api('/settings/departments').catch(() => []), api('/settings/currencies').catch(() => []),
      api('/settings/vat-settings').catch(() => []), api('/settings/numbering-series').catch(() => []),
    ])
    setSettings({ companies, branches, departments, currencies, vatSettings, numberingSeries })
  }, [])

  const loadAll = useCallback(async () => {
    await loadRefMaps()   // populate id→label maps BEFORE the mappers run, so records resolve on first paint
    await Promise.all([...Object.keys(SOURCES).map((k) => reload(k)), loadProjects(), loadQuotations(), loadChat(), loadItems(), loadSettings(), loadPayroll()])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, loadProjects, loadQuotations, loadChat, loadItems, loadSettings, loadRefMaps, loadPayroll])

  // ── ITEM MASTER (ERPNext-style) ──
  const getItem = (id) => api(`/items/${id}`)
  const createItem = async (body) => { const r = await post('items', body); await loadItems(); return r }
  const updateItem = async (id, body) => { const r = await patch('items', id, body); await loadItems(); return r }
  const deleteItem = async (id) => { await del('items', id); await loadItems() }
  const generateVariants = async (id, combinations) => { const r = await api(`/items/${id}/variants`, { method: 'POST', body: { combinations } }); await loadItems(); return r }
  const importItems = async (rows) => { const r = await api('/items/import', { method: 'POST', body: { rows } }); await loadItems(); return r }
  const addItemPrice = async (id, body) => { const r = await api(`/items/${id}/prices`, { method: 'POST', body }); return r }
  const deleteItemPrice = async (priceId) => api(`/items/prices/${priceId}`, { method: 'DELETE' })
  const addItemGroup = async (body) => { const r = await api('/masters/item-groups', { method: 'POST', body }); await loadItems(); return r }
  const addBrand = async (body) => {
    const r = await api('/masters/brands', { method: 'POST', body })
    setBrands((prev) => [...(prev || []).filter((b) => b.id !== r.id), r])
    loadBrands().catch(() => {})
    return r
  }
  const updateBrand = async (id, body) => {
    const r = await api(`/masters/brands/${id}`, { method: 'PATCH', body })
    setBrands((prev) => (prev || []).map((b) => (b.id === id ? { ...b, ...r } : b)))
    loadBrands().catch(() => {})
    return r
  }
  const deleteBrand = async (id) => {
    await api(`/masters/brands/${id}`, { method: 'DELETE' })
    setBrands((prev) => (prev || []).filter((b) => b.id !== id))
    loadBrands().catch(() => {})
  }
  const addItemAttribute = async (body) => { const r = await api('/masters/item-attributes', { method: 'POST', body }); await loadItems(); return r }
  const addProductFamily = async (body) => { const r = await api('/masters/product-families', { method: 'POST', body }); await loadItems(); return r }
  const addPriceList = async (body) => { const r = await api('/masters/price-lists', { method: 'POST', body }); await loadItems(); return r }
  const getAlternatives = (id) => api(`/items/${id}/alternatives`)

  // ── CULINOVA EOS (engineering knowledge base) → Item Master import/sync ──
  // ── COMPANY SETTINGS mutations (loadSettings is defined above, before loadAll) ──
  const settingsAdd = async (entity, body) => { const r = await api(`/settings/${entity}`, { method: 'POST', body }); await loadSettings(); return r }
  const settingsUpdate = async (entity, id, body) => { const r = await api(`/settings/${entity}/${id}`, { method: 'PATCH', body }); await loadSettings(); return r }
  const settingsDelete = async (entity, id) => { await api(`/settings/${entity}/${id}`, { method: 'DELETE' }); await loadSettings() }

  // ── GENERIC RESOURCE HELPERS (config-driven CRUD; pages manage their own local state) ──
  const resList = (resource, params = '') => api(`/${resource}${params ? `?${params}` : ''}`)
  const resGet = (resource, id) => api(`/${resource}/${id}`)
  const resAdd = (resource, body) => api(`/${resource}`, { method: 'POST', body })
  const resUpdate = (resource, id, body) => api(`/${resource}/${id}`, { method: 'PATCH', body })
  const resDelete = (resource, id) => api(`/${resource}/${id}`, { method: 'DELETE' })

  // ── SHARED LOOKUPS ── cross-panel read-only pickers (any internal role); pages call these instead of
  // hand-rolling URLs or reaching into a store they don't own. See server/src/modules/lookups.
  const lookupProjects = () => resList('lookups/projects')
  const lookupCustomers = () => resList('lookups/customers')
  const lookupSuppliers = () => resList('lookups/suppliers')
  const lookupItems = (sales = false) => resList('lookups/items', sales ? 'sales=1' : '')
  const lookupWarehouses = () => resList('lookups/warehouses')
  const lookupSalesOrders = () => resList('lookups/sales-orders')
  const lookupQuotations = () => resList('lookups/quotations')   // id/number/customer only — NO money
  const lookupTeam = () => resList('lookups/team')

  // documents (with version history)
  const docList = (entityType, entityId) => api(`/documents${entityType ? `?entity_type=${entityType}${entityId ? `&entity_id=${entityId}` : ''}` : ''}`)
  const docGet = (id) => api(`/documents/${id}`)
  const docAdd = (body) => api('/documents', { method: 'POST', body })
  const docNewVersion = (id, body) => api(`/documents/${id}/version`, { method: 'POST', body })
  const docDelete = (id) => api(`/documents/${id}`, { method: 'DELETE' })

  // ── USER PREFERENCES (dashboard widgets etc.) ──
  const getPrefs = () => api('/preferences')
  const savePref = (key, value) => api(`/preferences/${key}`, { method: 'PUT', body: { value } })

  // ── GLOBAL SEARCH ──
  const globalSearch = (q) => api(`/search?q=${encodeURIComponent(q)}`)

  // ── ADMIN (users · RBAC · audit · approvals) — page-driven (admin only) ──
  const adminUsers = () => api('/users')
  const adminAddUser = (b) => api('/users', { method: 'POST', body: b })
  const adminUpdateUser = (id, b) => api(`/users/${id}`, { method: 'PATCH', body: b })
  const adminDeleteUser = (id) => api(`/users/${id}`, { method: 'DELETE' })
  const adminResetPassword = (id, newPassword) => api(`/users/${id}/reset-password`, { method: 'POST', body: { newPassword } })
  const adminRbac = () => api('/admin/rbac')
  const adminAudit = (params = '') => api('/admin/audit' + (params ? `?${params}` : ''))
  const adminApprovals = (params = '') => api('/admin/approvals' + (params ? `?${params}` : ''))
  const adminRequestApproval = (b) => api('/admin/approvals', { method: 'POST', body: b })
  const adminDecideApproval = (id, decision, note) => api(`/admin/approvals/${id}/decide`, { method: 'POST', body: { decision, note } })
  // party (customer/supplier) detail + children
  const getParty = (party, id) => api(`/${party}s/${id}`)
  const addPartyChild = (party, id, child, body) => api(`/${party}s/${id}/${child}`, { method: 'POST', body })
  const deletePartyChild = (party, child, cid) => api(`/${party}s/${child}/${cid}`, { method: 'DELETE' })
  const partyCategories = (party) => api(`/party-categories?party=${party}`)

  const eosCatalog = (query = '', page = 1) => api(`/eos/catalog?query=${encodeURIComponent(query)}&page=${page}`)
  const eosDetail = (id) => api(`/eos/catalog/${id}`)
  const eosImport = async (ids) => { const r = await api('/eos/import', { method: 'POST', body: { ids } }); await loadItems(); return r }
  const eosSync = async (itemId) => { const r = await api(`/eos/sync/${itemId}`, { method: 'POST' }); await loadItems(); return r }

  // ── SALES CHAT (replies to customers) ──
  const sendChatReply = async (customer_email, customer_name, body, attachment) => { await post('sales/messages', { customer_email, customer_name, body, attachment }); await loadChat() }
  const markChatRead = async (customer_email) => { await post('sales/messages/read', { customer_email }).catch(() => {}); await loadChat() }

  useEffect(() => { if (user) loadAll() }, [user, loadAll])

  // Pause background sync while a heavy editor (e.g. quotation builder) is open —
  // otherwise the 12s full reload floods Supabase and a PATCH can take 50s+.
  const [syncPaused, setSyncPaused] = useState(false)
  const pauseSync = useCallback(() => setSyncPaused(true), [])
  const resumeSync = useCallback(() => setSyncPaused(false), [])

  // ── REAL-TIME SYNC ── refresh EVERYTHING on an interval so every panel + its KPIs,
  // charts and values stay in sync via the shared store (Item Master, stock, leads,
  // quotations, orders, projects, procurement, finance, chat — all of it).
  useEffect(() => {
    if (!user) return
    const id = setInterval(() => { if (!syncPaused) loadAll() }, 12000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loadAll, syncPaused])

  // keep the module-level resolver maps in sync with loaded state (sales-order numbers have no lookup endpoint,
  // and projects/team refresh here too so the next reload cycle re-maps records with the latest labels)
  // only MERGE the sales-panel store into the map — never replace it. For a Project Manager the
  // salesOrders store is [] (403), and replacing would wipe the map loadRefMaps built from /lookups.
  useEffect(() => {
    if (!salesOrders?.length) return
    _maps.salesOrders = { ..._maps.salesOrders, ...Object.fromEntries(salesOrders.map((o) => [o.id, { number: o.number }])) }
  }, [salesOrders])
  useEffect(() => { if (projects?.length) _maps.projects = { ..._maps.projects, ...Object.fromEntries(projects.map((p) => [p.id, { number: p.ref || p.number, name: p.name }])) } }, [projects])
  useEffect(() => { if (team?.length) { const m = { ..._maps.users }; team.forEach((u) => { if (u?.id) m[u.id] = u }); _maps.users = m } }, [team])

  // helpers
  const post = (ep, body) => api('/' + ep, { method: 'POST', body })
  const patch = (ep, id, body) => api(`/${ep}/${id}`, { method: 'PATCH', body })
  const del = (ep, id) => api(`/${ep}/${id}`, { method: 'DELETE' })

  // UI controllers
  const [form, setForm] = useState({ type: null })
  const [compose, setCompose] = useState({ open: false, prefill: null })
  const openForm = useCallback((type, editing = null) => setForm({ type, editing }), [])
  const closeForm = useCallback(() => setForm({ type: null, editing: null }), [])
  const openCompose = useCallback((prefill = null) => setCompose({ open: true, prefill }), [])
  const closeCompose = useCallback(() => setCompose({ open: false, prefill: null }), [])

  // ── SALES ──
  const addLead = async (d) => {
    await post('leads', {
      name: d.name || d.company, company: d.company, source: d.source, est_value: Number(d.value) || 0,
      mobile: d.mobile || null, email: d.email || null,
      project_name: d.project_name || null, project_type: d.project_type || null,
      project_city: d.project_city || null, project_district: d.project_district || null,
      project_address: d.project_address || null,
      next_follow_up: d.next_follow_up || null, notes: d.notes || null,
      status: d.status || 'New',
      owner_id: d.assigned_to_id || me()?.id,
      created_by_id: me()?.id,
      assigned_to_id: d.assigned_to_id || me()?.id,
    })
    await reload('leads')
  }
  const addOpportunity = async (d) => {
    await post('sales/opportunities', {
      customer: d.customer, stage: d.stage, value: Number(d.value) || 0,
      probability: Number(d.prob) || 30, next_action_date: d.close,
      opportunity_type: d.opportunity_type || 'Retail Sale',
      project_name: d.project_name || null, project_type: d.project_type || null,
      project_city: d.project_city || null, project_district: d.project_district || null,
      project_location: d.project_location || null,
      contact_person: d.contact_person || null, customer_email: d.customer_email || null,
      mobile: d.mobile || null,
    })
    await reload('opportunities')
  }
  const lostOpportunity = async (id, reason, note = null) => {
    await post(`sales/opportunities/${id}/lost`, { reason, note })
    await reload('opportunities')
  }
  // No wonOpportunity handler: an opportunity is Won only when the customer approves a quotation and a
  // Sales Order is created (acceptQuotation → server winOpportunityForCustomer). There is no off-flow
  // manual Won shortcut.
  // Customer interactions / meeting log (rule #12)
  const addInteraction = async (d) => { await post('interactions', { customer: d.customer, type: d.type, notes: d.notes, next_action: d.nextAction, user_id: me()?.id }); await reload('interactions') }
  const addCustomer = async (d) => { await post('customers', { code: d.code || slugCode('CUST', d.name), name: d.name, category: d.category, territory: d.territory, contact: d.contact, email: d.email, phone: d.phone }); await reload('customers') }
  const convertLead = async (lead) => {
    if (['Opportunity', 'Converted', 'Lost', 'Do Not Contact'].includes(lead.status)) return
    await post(`sales/leads/${lead.id}/convert`, {})
    await Promise.all([reload('leads'), reload('opportunities')])
  }
  // "Qualified? → No → Close Lead" — disqualify an unqualified lead (Create-level route so Sales can do it).
  const closeLead = async (lead, reason) => {
    if (['Opportunity', 'Converted'].includes(lead.status)) return
    await post(`sales/leads/${lead.id}/close`, { reason: reason || '' })
    await reload('leads')
  }
  const getOpportunityQuotationPrefill = (id) => api(`/sales/opportunities/${id}/quotation-prefill`)
  const getPaymentTemplates = () => api('/sales/payment-templates')
  const quoteBody = (d) => ({
    customer: d.customer, customer_email: d.email, project_name: d.projectName || d.project_name,
    project_location: d.location, contact_person: d.contact, payment_terms: d.paymentTerms,
    delivery_date: d.deliveryDate || null, notes: d.notes || null,
    validity_days: Number(d.validity) || 30, discount_pct: Number(d.discount) || 0, discount_fixed: Number(d.discountFixed) || 0,
    items: (d.items || []).map((it) => ({ item_name: it.name || it.item_name, qty: Number(it.qty) || 1, rate: Number(it.rate) || 0 })),
  })
  const checkAvailability = async (name) => { if (!name) return null; try { return await api('/inventory/availability?name=' + encodeURIComponent(name)) } catch { return null } }
  const getOrderItems = (id) => api(`/sales/orders/${id}/items`) // SO-007 item-level status
  const addQuotation = async (d) => { const r = await post('sales/quotations', quoteBody(d)); await loadQuotations(); return r }
  const updateQuotation = async (id, d) => { const r = await patch('sales/quotations', id, quoteBody(d)); await loadQuotations(); return r }
  // CEO rule #10: quotations are NEVER deleted — only marked Lost (with a reason)
  const approveQuotation = async (id) => { await post(`sales/quotations/${id}/approve`, {}); await loadQuotations() }
  const rejectQuotation = async (id, reason) => { await post(`sales/quotations/${id}/reject`, { reason }); await loadQuotations() }
  const sendQuotation = async (id, opts = {}) => {
    await post(`sales/quotations/${id}/send`, {
      confirm_overdue: !!opts.confirm_overdue,
    })
    await loadQuotations()
  }
  const acceptQuotation = async (id) => { const r = await post(`sales/quotations/${id}/accept`, {}); await Promise.all([loadQuotations(), reload('salesOrders'), loadProjects()]); return r }
  const lostQuotation = async (id, reason, note = null) => {
    await post(`sales/quotations/${id}/lost`, { reason, note })
    await loadQuotations()
  }
  const addOrder = async (d) => {
    // ONE call creates the sales order + its linked project (+ BOQ from the items) — the server owns
    // project creation now, so no separate projects insert (which would duplicate the project).
    const items = (d.items || []).map((it) => ({ item_name: it.name || it.item_name, qty: Number(it.qty) || 1, rate: Number(it.rate) || 0, cost: Number(it.cost) || 0 }))
    const net = items.reduce((s, it) => s + it.qty * it.rate, 0)
    const amount = Math.round(net ? net * 1.15 : Number(d.amount) || 0)   // VAT-inclusive, matching the form's displayed total
    const r = await post('sales/orders', { customer: d.customer, project_name: d.projectName || d.project, amount, quotation_id: d.quotationId, items })
    await Promise.all([reload('salesOrders'), loadProjects()])
    return r
  }

  // ── PROJECTS ──
  const addProject = async (d) => { const p = await post('projects', { name: d.name, customer: d.customer, contract_value: Number(d.contractValue) || 0, manager_id: me()?.id }); await loadProjects(); return p }
  // project_tasks columns are: project_id, name, assignee_id (uuid), status, due_date, progress.
  // Sending `assignee` (which the old code did) 500s — the column does not exist.
  const addTask = async (pid, t) => {
    await post('project-tasks', {
      project_id: pid, name: t.name, status: t.status || 'Open',
      due_date: t.due || t.due_date || null, assignee_id: t.assignee_id || null,
      progress: Number(t.progress) || 0,
    })
    await loadProjects()
  }
  const updateTask = async (pid, tid, p) => { await patch('project-tasks', tid, p); await loadProjects() }
  const deleteTask = async (pid, tid) => { await del('project-tasks', tid); await loadProjects() }
  const updateBoqItem = async (pid, idx, p) => { const proj = projects.find((x) => x.id === pid); const b = proj?.boq?.[idx]; if (b?.id) { await patch('pm/boq', b.id, p); await loadProjects() } }
  const updateProject = async (pid, p) => {
    const body = {}
    if (p.progress != null) body.progress = p.progress
    if (p.status) body.status = p.status
    if (p.name) body.name = p.name
    // contract_value is a PROTECTED field: the server silently strips it for anyone who is not
    // Management, so the UI must not offer it to a PM as if it would save (it never did).
    if (p.contractValue != null) body.contract_value = Number(p.contractValue) || 0
    if (p.manager_id !== undefined) body.manager_id = p.manager_id || null
    if (p.start) body.start_date = p.start
    if (p.end) body.end_date = p.end
    await patch('projects', pid, body); await loadProjects()
  }
  // The PM's hand-off to buying: raises a real Purchase Requisition from the project's Waiting BOQ
  // lines (Project → PR → RFQ → PO). Previously this only flipped statuses and created nothing.
  const sendToProcurement = async (pid, opts = {}) => {
    const r = await api(`/pm/projects/${pid}/to-procurement`, { method: 'POST', body: opts })
    await loadProjects()
    return r
  }
  const addVariation = async (pid, vo) => { await post('variations', { project_id: pid, description: vo.desc || vo.description, amount: Number(vo.amount) || 0, status: vo.status || 'Pending' }); await loadProjects() }

  // ── PROCUREMENT ──
  const addSupplier = async (d) => { await post('suppliers', { code: d.code || slugCode('SUPP', d.name), name: d.name, category: d.category }); await reload('suppliers') }
  const addRFQ = async (d) => { await post('rfqs', { item_name: d.item, project_id: d.project || null, qty: Number(d.qty) || 1 }); await reload('rfqs') }
  const awardPO = async (rfq, chosen) => {
    // rfq.project is now the readable NUMBER (display); the uuid FK lives on rfq.project_id
    await post('purchase-orders', { supplier: chosen.name, item_name: rfq.item, project_id: rfq.project_id || null, qty: rfq.qty || 1, amount: chosen.quote })
    await patch('rfqs', rfq.id, { status: 'Ordered', awarded_supplier: chosen.name })
    await Promise.all([reload('purchaseOrders'), reload('rfqs')])
  }
  const updatePOStatus = async (id, status) => { await patch('purchase-orders', id, { status }); await reload('purchaseOrders') }
  const requestQuotes = async () => {}

  // ── SUPPLIER PORTAL (staff side) ──
  // records a supplier's quotation against an RFQ (server upserts + advances the RFQ to 'Quoted')
  const submitSupplierQuote = async (rfqId, supplier, price) => {
    if (!rfqId || !supplier) return
    await post(`rfqs/${rfqId}/quotes`, { supplier, quote: Number(price) || 0 })
    await reload('rfqs')
  }
  const acceptPO = async (id) => { await patch('purchase-orders', id, { accepted: true }); await reload('purchaseOrders') }
  const setShipment = async (id, shipment) => { await patch('purchase-orders', id, { shipment }); await reload('purchaseOrders') }

  // ── WAREHOUSE ──
  // code is auto-derived from the name when the user leaves it blank (WH-<first word>)
  const addWarehouse = async (d) => {
    const code = (d.code || '').trim() || `WH-${String(d.name || '').trim().split(/\s+/)[0].toUpperCase().slice(0, 6)}`
    await post('warehouses', { code, name: d.name, location: d.location || null, type: d.type || 'Store' })
    await reload('warehouses')
  }
  // receiving a PO now actually brings stock IN (creates a GRN + posts to the stock ledger)
  const receivePO = async (poId) => {
    const r = await api(`/goods-receipt/receive-po/${poId}`, { method: 'POST' })
    await Promise.all([reload('purchaseOrders'), reload('stockItems')])
    return r
  }
  // issuing a delivery note now actually takes stock OUT
  const createDeliveryNote = async (d) => {
    await post('delivery-notes', { project_id: d.project, customer: d.customer, item_name: d.item, qty: Number(d.qty) || 1, value: Number(d.value) || 0, area: d.area || null, position: d.position || null, status: 'Delivered' })
    await Promise.all([reload('deliveryNotes'), reload('stockItems')])
  }
  const authorizeReturn = async (id) => { await patch('delivery-notes', id, { status: 'Returned' }); await reload('deliveryNotes') } // DEL-005

  // ── FINANCE ──
  const createInvoice = async (d) => { const total = Number(d.total) || 0; await post('invoices', { customer: d.customer, project_id: d.project && d.project !== '—' ? d.project : null, total, net_amount: Math.round(total / 1.15), vat_amount: Math.round(total - total / 1.15), due_date: d.due || today() }); await reload('invoices') }
  const recordPayment = async (invId, amount) => {
    const inv = invoices.find((x) => x.id === invId); if (!inv) return
    const amt = Number(amount) || 0; const newPaid = Math.min(inv.total, inv.paid + amt)
    await patch('invoices', invId, { paid: newPaid, status: newPaid >= inv.total ? 'Paid' : 'Partly Paid' })
    await post('payments', { type: 'Received', party: inv.customer, reference: inv.number || invId, amount: amt }).catch(() => {})
    await Promise.all([reload('invoices'), reload('payments')])
  }
  const paySupplier = async (billId) => {
    const bill = payables.find((x) => x.id === billId); if (!bill) return
    await patch('payables', billId, { paid: bill.amount, status: 'Paid' })
    await post('payments', { type: 'Paid', party: bill.supplier, reference: bill.number || billId, amount: bill.amount }).catch(() => {})
    await Promise.all([reload('payables'), reload('payments')])
  }

  // ── SITE ──
  const addSnag = async (d) => { await post('snags', { project_id: d.project || null, item_name: d.item, description: d.description, severity: d.severity || 'Low' }); await reload('snags') }
  const resolveSnag = async (id) => { await patch('snags', id, { status: 'Resolved' }); await reload('snags') }
  const updateTest = async (id, status) => { await patch('commissioning', id, { status }); await reload('commissioning') }

  // ── SERVICE ──
  const addTicket = async (d) => { await post('service-tickets', { customer: d.customer, project_id: d.project || null, subject: d.subject, priority: d.priority || 'Medium' }); await reload('tickets') }
  const resolveTicket = async (id) => { await patch('service-tickets', id, { status: 'Resolved', sla: 'Met' }); await reload('tickets') }
  const completeVisit = async (id) => { await patch('maintenance-visits', id, { status: 'Completed' }); await reload('visits') }

  // ── HR ──
  const addEmployee = async (d) => { await post('employees', { code: d.code || slugCode('EMP', d.name), name: d.name, role: d.role, department: d.department, salary: Number(d.salary) || 0 }); await reload('employees') }
  const setAttendance = async (id, status) => { await patch('employees', id, { today_status: status }); await reload('employees') }
  const approveLeave = async (id) => { await patch('leaves', id, { status: 'Approved' }); await reload('leaves') }
  // persist the run (payroll_runs — period/gross/net/status, NO number column) so it survives a refresh
  const runPayroll = async () => {
    const gross = employees.reduce((s, e) => s + (Number(e.salary) || 0), 0)
    const net = gross - Math.round(gross * 0.1)
    try {
      await post('payroll', { period: today().slice(0, 7), gross, net, status: 'Paid' })
      setPayrollStatus('Paid')
    } catch (e) { alert(e?.message || 'Could not run payroll'); return }
    await loadPayroll()
  }

  // ── EMAIL (no backend table — local session) ──
  const gid = (p) => `${p}-${String(Math.floor(performance.now())).slice(-5)}`
  const sendEmail = (mail) => { const rec = { id: gid('M'), folder: 'sent', read: true, starred: false, hasAttachment: !!mail.attachment, time: 'Just now', date: 'Today', label: 'Customer', from: { name: me()?.name || 'Me', email: me()?.email || '' }, to: { name: mail.toName || mail.to, email: mail.to }, subject: mail.subject, preview: (mail.body || '').slice(0, 90), body: mail.body }; setEmails((p) => [rec, ...p]); return rec }
  const saveDraft = (mail) => { const rec = { id: gid('M'), folder: 'draft', read: true, starred: false, hasAttachment: !!mail.attachment, time: 'Draft', date: '', label: '', from: { name: me()?.name || 'Me', email: me()?.email || '' }, to: { name: mail.toName || mail.to, email: mail.to }, subject: mail.subject || '(no subject)', preview: (mail.body || '').slice(0, 90), body: mail.body }; setEmails((p) => [rec, ...p]); return rec }
  const toggleStar = (id) => setEmails((p) => p.map((e) => (e.id === id ? { ...e, starred: !e.starred } : e)))
  const markRead = (id) => setEmails((p) => p.map((e) => (e.id === id ? { ...e, read: true } : e)))
  const trashEmail = (id) => setEmails((p) => p.map((e) => (e.id === id ? { ...e, folder: 'trash' } : e)))

  const value = {
    leads, opportunities, quotations, salesOrders, customers, emails, projects,
    suppliers, rfqs, purchaseOrders, warehouses, stockItems, deliveryNotes,
    invoices, payables, payments,
    snags, commissioning, tickets, visits, contracts, employees, leaves, interactions, chatMessages, customerDir, team, payrollStatus,
    offline, retry: loadAll,
    items, itemGroups, brands, itemAttributes, productFamilies, priceLists,
    getItem, createItem, updateItem, deleteItem, generateVariants, importItems, addItemPrice, deleteItemPrice, addItemGroup, addBrand, updateBrand, deleteBrand, addItemAttribute, addProductFamily, addPriceList, getAlternatives,
    eosCatalog, eosDetail, eosImport, eosSync,
    settings, loadSettings, settingsAdd, settingsUpdate, settingsDelete,
    globalSearch,
    adminUsers, adminAddUser, adminUpdateUser, adminDeleteUser, adminResetPassword, adminRbac, adminAudit, adminApprovals, adminRequestApproval, adminDecideApproval,
    getParty, addPartyChild, deletePartyChild, partyCategories,
    resList, resGet, resAdd, resUpdate, resDelete, docList, docGet, docAdd, docNewVersion, docDelete,
    lookupProjects, lookupCustomers, lookupSuppliers, lookupItems, lookupWarehouses,
    lookupSalesOrders, lookupQuotations, lookupTeam, sendToProcurement,
    getPrefs, savePref,
    reload, loadAll, loadQuotations, pauseSync, resumeSync,
    addLead, addOpportunity, lostOpportunity, addInteraction, addQuotation, updateQuotation, addOrder, addCustomer, convertLead, closeLead, getOpportunityQuotationPrefill, getPaymentTemplates, checkAvailability, getOrderItems,
    approveQuotation, rejectQuotation, sendQuotation, acceptQuotation, lostQuotation,
    sendChatReply, markChatRead,
    addProject, addTask, updateTask, deleteTask, addVariation, updateBoqItem, updateProject,
    addSupplier, addRFQ, awardPO, updatePOStatus, requestQuotes,
    submitSupplierQuote, acceptPO, setShipment,
    addWarehouse, receivePO, createDeliveryNote, authorizeReturn,
    createInvoice, recordPayment, paySupplier,
    addSnag, resolveSnag, updateTest,
    addTicket, resolveTicket, completeVisit,
    addEmployee, setAttendance, approveLeave, runPayroll,
    sendEmail, saveDraft, toggleStar, markRead, trashEmail,
    form, openForm, closeForm,
    compose, openCompose, closeCompose,
  }
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>
}
