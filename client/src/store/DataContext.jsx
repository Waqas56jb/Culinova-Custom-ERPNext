import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'

const DataCtx = createContext(null)
export const useData = () => useContext(DataCtx)

const today = () => new Date().toISOString().slice(0, 10)
const d10 = (r) => (r.created_at || '').slice(0, 10) || today()
const me = () => { try { return JSON.parse(localStorage.getItem('culinova_user') || 'null') } catch { return null } }
// owner_id (uuid) → readable name: show the logged-in user's name for records they own
const ownerName = (id) => { const u = me(); return u && id === u.id ? u.name : (id ? 'Other' : '—') }

// ── DB row → UI shape mappers (snake_case → the fields the pages read) ──
const mapCustomer = (r) => ({ ...r, group: r.category || '—', business: r.business ?? 0, outstanding: Number(r.outstanding) || 0 })
const mapLead = (r) => ({ ...r, value: Number(r.est_value) || 0, owner: ownerName(r.owner_id), date: d10(r) })
const mapOpp = (r) => ({ ...r, value: Number(r.value) || 0, prob: r.probability ?? 0, close: r.next_action_date || '', owner: ownerName(r.owner_id) })
const mapQuote = (r) => ({
  ...r, amount: Number(r.total_amount) || 0, gp: Number(r.gp_percent) || 0, discount: Number(r.discount_pct) || 0,
  validity: r.validity_days, approval: r.approval_status, email: r.customer_email,
  owner: ownerName(r.owner_id), date: d10(r), ref: r.number,
  items: (r.quotation_items || []).map((it) => ({ name: it.item_name, qty: it.qty, rate: it.rate })),
})
const mapSO = (r) => ({ ...r, amount: Number(r.amount) || 0, delivery: r.delivery_status, billing: r.billing_status, project: r.project_number || r.project_id, projectNo: r.project_number, boqDone: r.boq_done ?? 0, boqTotal: r.boq_total ?? 0, progress: r.progress ?? 0, date: d10(r), ref: r.number })
const mapProject = (r) => ({ ...r, contractValue: Number(r.contract_value) || 0, actualCost: Number(r.actual_cost) || 0, committedCost: Number(r.committed_cost) || 0, billed: Number(r.billed) || 0, collected: Number(r.collected) || 0, progress: r.progress ?? 0, manager: r.manager || 'Unassigned', salesOrder: r.sales_order_id || '—', ref: r.number, boq: [], tasks: [], variations: [] })
const mapSupplier = (r) => ({ ...r, onTime: r.on_time ?? 0, totalPOs: r.totalPOs ?? 0, rating: Number(r.rating) || 0 })
const mapRFQ = (r) => ({ ...r, item: r.item_name, project: r.project_id, suppliers: r.suppliers || [], awarded: r.awarded_supplier, date: d10(r), ref: r.number })
const mapPO = (r) => ({ ...r, item: r.item_name, project: r.project_id, amount: Number(r.amount) || 0, qty: Number(r.qty) || 1, date: d10(r), ref: r.number })
const mapItem = (r) => ({ ...r, group: r.item_group, rate: Number(r.selling_rate) || 0, qty: r.qty ?? 0, reorder: Number(r.reorder_level) || 0 })
// enriched stock (physical/reserved/available/incoming/aging) from /inventory/stock
const mapStock = (r) => ({ code: r.code, name: r.item, group: r.group, warehouse: r.warehouse, uom: r.uom || 'Nos', qty: r.physical ?? 0, physical: r.physical ?? 0, reserved: r.reserved ?? 0, available: r.available ?? 0, incoming: r.incoming ?? 0, aging: r.aging_days ?? 0, reorder: r.reorder_level ?? 0, rate: Number(r.rate) || 0 })
const mapDN = (r) => ({ ...r, item: r.item_name, project: r.project_id, value: Number(r.value) || 0, date: d10(r), ref: r.number })
const mapInvoice = (r) => ({ ...r, total: Number(r.total) || 0, paid: Number(r.paid) || 0, project: r.project_id || '—', due: r.due_date || d10(r), date: d10(r), ref: r.number })
const mapPayment = (r) => ({ ...r, ref: r.reference, amount: Number(r.amount) || 0, date: d10(r) })
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

  // resource registry: key → { ep, set, map, panel }
  const SOURCES = {
    customers: { ep: 'customers', set: setCustomers, map: mapCustomer, panel: 'sales' },
    leads: { ep: 'leads', set: setLeads, map: mapLead, panel: 'sales' },
    opportunities: { ep: 'opportunities', set: setOpportunities, map: mapOpp, panel: 'sales' },
    salesOrders: { ep: 'sales/orders', set: setSalesOrders, map: mapSO, panel: 'sales' },
    suppliers: { ep: 'suppliers', set: setSuppliers, map: mapSupplier, panel: 'procurement' },
    rfqs: { ep: 'rfqs', set: setRfqs, map: mapRFQ, panel: 'procurement' },
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

  const reload = useCallback(async (key) => {
    const s = SOURCES[key]; if (!s) return
    if (!allowed(s.panel)) { s.set([]); return }
    try { const rows = await api('/' + s.ep); s.set((rows || []).map(s.map)) } catch { /* leave empty */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panels])

  const loadProjects = useCallback(async () => {
    if (!allowed('projects')) { setProjects([]); setTeam([]); return }
    try {
      const [ps, boq, tasks, vars, tm] = await Promise.all([
        api('/projects'), api('/project-boq').catch(() => []), api('/project-tasks').catch(() => []), api('/variations').catch(() => []), api('/pm/team').catch(() => []),
      ])
      setTeam(tm || [])
      const mapped = (ps || []).map((p) => ({
        ...mapProject(p),
        boq: (boq || []).filter((b) => b.project_id === p.id).map((b) => ({ ...b, item: b.item_name })),
        tasks: (tasks || []).filter((t) => t.project_id === p.id),
        variations: (vars || []).filter((v) => v.project_id === p.id).map((v) => ({ ...v, desc: v.description })),
      }))
      setProjects(mapped)
    } catch { setProjects([]) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panels])

  const loadQuotations = useCallback(async () => {
    if (!allowed('sales')) { setQuotations([]); return }
    try { const rows = await api('/sales/quotations'); setQuotations((rows || []).map(mapQuote)) } catch { setQuotations([]) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panels])

  const loadChat = useCallback(async () => {
    if (!allowed('sales')) { setChatMessages([]); setCustomerDir([]); return }
    try { const rows = await api('/sales/messages'); setChatMessages(rows || []) } catch { setChatMessages([]) }
    try { const dir = await api('/sales/customers-directory'); setCustomerDir(dir || []) } catch { setCustomerDir([]) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panels])

  const loadItems = useCallback(async () => {
    try { setItems(await api('/items') || []) } catch { setItems([]) }
    try { setItemGroups(await api('/masters/item-groups') || []) } catch { setItemGroups([]) }
    try { setBrands(await api('/masters/brands') || []) } catch { setBrands([]) }
    try { setItemAttributes(await api('/masters/item-attributes') || []) } catch { setItemAttributes([]) }
    try { setProductFamilies(await api('/masters/product-families') || []) } catch { setProductFamilies([]) }
    try { setPriceLists(await api('/masters/price-lists') || []) } catch { setPriceLists([]) }
  }, [])

  const loadAll = useCallback(async () => {
    await Promise.all([...Object.keys(SOURCES).map((k) => reload(k)), loadProjects(), loadQuotations(), loadChat(), loadItems()])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, loadProjects, loadQuotations, loadChat, loadItems])

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
  const addBrand = async (body) => { const r = await api('/masters/brands', { method: 'POST', body }); await loadItems(); return r }
  const updateBrand = async (id, body) => { const r = await api(`/masters/brands/${id}`, { method: 'PATCH', body }); await loadItems(); return r }
  const addItemAttribute = async (body) => { const r = await api('/masters/item-attributes', { method: 'POST', body }); await loadItems(); return r }
  const addProductFamily = async (body) => { const r = await api('/masters/product-families', { method: 'POST', body }); await loadItems(); return r }
  const addPriceList = async (body) => { const r = await api('/masters/price-lists', { method: 'POST', body }); await loadItems(); return r }
  const getAlternatives = (id) => api(`/items/${id}/alternatives`)

  // ── SALES CHAT (replies to customers) ──
  const sendChatReply = async (customer_email, customer_name, body, attachment) => { await post('sales/messages', { customer_email, customer_name, body, attachment }); await loadChat() }
  const markChatRead = async (customer_email) => { await post('sales/messages/read', { customer_email }).catch(() => {}); await loadChat() }

  useEffect(() => { if (user) loadAll() }, [user, loadAll])

  // ── REAL-TIME SYNC ── refresh EVERYTHING on an interval so every panel + its KPIs,
  // charts and values stay in sync via the shared store (Item Master, stock, leads,
  // quotations, orders, projects, procurement, finance, chat — all of it).
  useEffect(() => {
    if (!user) return
    const id = setInterval(() => { loadAll() }, 12000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loadAll])

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
  const addLead = async (d) => { await post('leads', { name: d.name || d.company, company: d.company, source: d.source, est_value: Number(d.value) || 0, owner_id: me()?.id }); await reload('leads') }
  const addOpportunity = async (d) => { await post('sales/opportunities', { customer: d.customer, stage: d.stage, value: Number(d.value) || 0, probability: Number(d.prob) || 30, next_action_date: d.close }); await reload('opportunities') }
  const lostOpportunity = async (id, reason) => { await post(`sales/opportunities/${id}/lost`, { reason }); await reload('opportunities') }
  const wonOpportunity = async (id) => { await post(`sales/opportunities/${id}/won`, {}); await reload('opportunities') }
  // Customer interactions / meeting log (rule #12)
  const addInteraction = async (d) => { await post('interactions', { customer: d.customer, type: d.type, notes: d.notes, next_action: d.nextAction, user_id: me()?.id }); await reload('interactions') }
  const addCustomer = async (d) => { await post('customers', { name: d.name, category: d.category, territory: d.territory, contact: d.contact, email: d.email, phone: d.phone }); await reload('customers') }
  const convertLead = async (lead) => {
    // idempotent: a lead already converted/lost must NOT spawn another opportunity
    if (['Opportunity', 'Converted', 'Lost'].includes(lead.status)) return
    await patch('leads', lead.id, { status: 'Opportunity' })   // mark first to block rapid double-clicks
    await addOpportunity({ customer: lead.company, stage: 'Prospecting', value: lead.value, prob: 30, close: today() })
    await reload('leads')
  }
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
  const sendQuotation = async (id) => { await post(`sales/quotations/${id}/send`, {}); await loadQuotations() }
  const acceptQuotation = async (id) => { const r = await post(`sales/quotations/${id}/accept`, {}); await Promise.all([loadQuotations(), reload('salesOrders'), loadProjects()]); return r }
  const lostQuotation = async (id, reason) => { await post(`sales/quotations/${id}/lost`, { reason }); await loadQuotations() }
  const addOrder = async (d) => {
    const items = d.items || []
    const net = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0)
    const amount = Math.round(net ? net * 1.15 : Number(d.amount) || 0)
    const so = await post('sales-orders', { customer: d.customer, amount, quotation_id: d.quotationId })
    await post('projects', { name: `${d.customer || 'Customer'} — ${d.projectName || 'Project'}`, customer: d.customer, contract_value: amount, sales_order_id: so.id, manager_id: me()?.id }).catch(() => {})
    await Promise.all([reload('salesOrders'), loadProjects()])
    return so
  }

  // ── PROJECTS ──
  const addProject = async (d) => { const p = await post('projects', { name: d.name, customer: d.customer, contract_value: Number(d.contractValue) || 0, manager_id: me()?.id }); await loadProjects(); return p }
  const addTask = async (pid, t) => { await post('project-tasks', { project_id: pid, name: t.name, status: t.status || 'Open', due_date: t.due || null }); await loadProjects() }
  const updateTask = async (pid, tid, p) => { await patch('project-tasks', tid, p); await loadProjects() }
  const deleteTask = async (pid, tid) => { await del('project-tasks', tid); await loadProjects() }
  const updateBoqItem = async (pid, idx, p) => { const proj = projects.find((x) => x.id === pid); const b = proj?.boq?.[idx]; if (b?.id) { await patch('pm/boq', b.id, p); await loadProjects() } }
  const updateProject = async (pid, p) => { const body = {}; if (p.progress != null) body.progress = p.progress; if (p.status) body.status = p.status; await patch('projects', pid, body); await loadProjects() }
  const addVariation = async (pid, vo) => { await post('variations', { project_id: pid, description: vo.desc || vo.description, amount: Number(vo.amount) || 0 }); await loadProjects() }

  // ── PROCUREMENT ──
  const addSupplier = async (d) => { await post('suppliers', { name: d.name, category: d.category }); await reload('suppliers') }
  const addRFQ = async (d) => { await post('rfqs', { item_name: d.item, project_id: d.project, qty: Number(d.qty) || 1 }); await reload('rfqs') }
  const awardPO = async (rfq, chosen) => {
    await post('purchase-orders', { supplier: chosen.name, item_name: rfq.item, project_id: rfq.project, qty: rfq.qty || 1, amount: chosen.quote })
    await patch('rfqs', rfq.id, { status: 'Ordered', awarded_supplier: chosen.name })
    await Promise.all([reload('purchaseOrders'), reload('rfqs')])
  }
  const updatePOStatus = async (id, status) => { await patch('purchase-orders', id, { status }); await reload('purchaseOrders') }
  const requestQuotes = async () => {}

  // ── SUPPLIER PORTAL (staff side) ──
  const submitSupplierQuote = async () => {}
  const acceptPO = async (id) => { await patch('purchase-orders', id, { accepted: true }); await reload('purchaseOrders') }
  const setShipment = async (id, shipment) => { await patch('purchase-orders', id, { shipment }); await reload('purchaseOrders') }

  // ── WAREHOUSE ──
  const addWarehouse = async (d) => { await post('warehouses', { name: d.name, location: d.location, type: d.type || 'Storage' }); await reload('warehouses') }
  const receivePO = async (poId) => { await patch('purchase-orders', poId, { status: 'Received' }); await reload('purchaseOrders') }
  const createDeliveryNote = async (d) => { await post('delivery-notes', { project_id: d.project, customer: d.customer, item_name: d.item, qty: Number(d.qty) || 1, value: Number(d.value) || 0, area: d.area || null, position: d.position || null, status: 'Delivered' }); await reload('deliveryNotes') }
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
  const addSnag = async (d) => { await post('snags', { project_id: d.project, item_name: d.item, description: d.description, severity: d.severity || 'Low' }); await reload('snags') }
  const resolveSnag = async (id) => { await patch('snags', id, { status: 'Resolved' }); await reload('snags') }
  const updateTest = async (id, status) => { await patch('commissioning', id, { status }); await reload('commissioning') }

  // ── SERVICE ──
  const addTicket = async (d) => { await post('service-tickets', { customer: d.customer, subject: d.subject, priority: d.priority || 'Medium' }); await reload('tickets') }
  const resolveTicket = async (id) => { await patch('service-tickets', id, { status: 'Resolved', sla: 'Met' }); await reload('tickets') }
  const completeVisit = async (id) => { await patch('maintenance-visits', id, { status: 'Completed' }); await reload('visits') }

  // ── HR ──
  const addEmployee = async (d) => { await post('employees', { name: d.name, role: d.role, department: d.department, salary: Number(d.salary) || 0 }); await reload('employees') }
  const setAttendance = async (id, status) => { await patch('employees', id, { today_status: status }); await reload('employees') }
  const approveLeave = async (id) => { await patch('leaves', id, { status: 'Approved' }); await reload('leaves') }
  const runPayroll = () => setPayrollStatus('Paid')

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
    items, itemGroups, brands, itemAttributes, productFamilies, priceLists,
    getItem, createItem, updateItem, deleteItem, generateVariants, importItems, addItemPrice, deleteItemPrice, addItemGroup, addBrand, updateBrand, addItemAttribute, addProductFamily, addPriceList, getAlternatives,
    reload, loadAll,
    addLead, addOpportunity, lostOpportunity, wonOpportunity, addInteraction, addQuotation, updateQuotation, addOrder, addCustomer, convertLead, checkAvailability, getOrderItems,
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
