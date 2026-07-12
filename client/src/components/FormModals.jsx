import { useState, useEffect, useMemo } from 'react'
import { X, Plus, Loader2 } from 'lucide-react'
import { useData } from '../store/DataContext.jsx'
import { Modal, Field, Select, Row, TextArea } from './Modal.jsx'
import { sar } from '../data/mockData.js'
import { useAuth } from '../auth/AuthContext.jsx'

// Owner is ALWAYS the logged-in salesperson — the backend auto-assigns the creator.
function OwnerField() {
  const { user } = useAuth()
  const initials = (user?.name || 'U').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-600">Owner</label>
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-navy-700 to-brand-600 text-[10px] font-bold text-white">{initials}</span>
        <span className="font-medium text-ink">{user?.name}</span>
        <span className="text-xs text-muted">(you)</span>
      </div>
    </div>
  )
}

// INV-008/009 — live stock availability while building a quotation / BOQ
function AvailabilityHint({ name, qty, check }) {
  const [a, setA] = useState(null)
  useEffect(() => {
    const nm = (name || '').trim()
    if (nm.length < 2 || !check) { setA(null); return }
    let alive = true
    const t = setTimeout(async () => { const r = await check(nm); if (alive) setA(r) }, 400)
    return () => { alive = false; clearTimeout(t) }
  }, [name, check])
  if (!a || !a.matched) return null
  const need = Number(qty) || 0
  const short = need > a.available
  return (
    <p className={`pl-1 pt-0.5 text-[10px] font-semibold ${short ? 'text-amber-600' : 'text-emerald-600'}`}>
      Stock: {a.available} available{a.incoming ? ` · ${a.incoming} incoming${a.eta_days ? ` (ETA ${a.eta_days}d)` : ''}` : ''}{short ? ` · short by ${need - a.available}` : ''}
    </p>
  )
}

// ── Shared master-driven dropdown sources ──────────────────────────────────
// Load options from a shared read-only lookup endpoint. These endpoints are
// readable by EVERY internal role, so a dropdown works even when the current
// role's own store (e.g. customers) is empty because it lacks that panel.
function useLookup(d, resource, open) {
  const [rows, setRows] = useState([])
  useEffect(() => {
    if (!open) return
    let alive = true
    d.resList(resource).then((r) => { if (alive) setRows(Array.isArray(r) ? r : []) }).catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [d, resource, open])
  return rows
}

// Customer typeahead — suggestions come from the Customer Master (lookups/customers),
// but these forms store the customer as free text, so a brand-new name can still be
// typed and is never blocked. Drives the OPTIONS from the master; keeps submit logic.
function CustomerField({ d, open, value, onChange, label = 'Customer', placeholder = 'Pick a customer or type a new name', ...rest }) {
  const rows = useLookup(d, 'lookups/customers', open)
  return (
    <div>
      <Field label={label} value={value} onChange={onChange} list="lookup-customers" placeholder={placeholder} autoComplete="off" {...rest} />
      <datalist id="lookup-customers">{rows.map((c) => <option key={c.id} value={c.name} />)}</datalist>
    </div>
  )
}

// Territory options — data-driven: distinct territories already on customers + company
// branch cities, merged with KSA-region defaults so the list is never empty and new
// territories flow in. Used as a typeahead so a new territory can be typed (mirrors the
// free-text Territory box on the Customer Master — one column, one behaviour).
const TERRITORY_DEFAULTS = ['Riyadh', 'Jeddah', 'Eastern', 'Makkah', 'Madinah', 'Dammam', 'Al Khobar', 'Other']
function useTerritoryOptions(d) {
  return useMemo(() => {
    const set = new Set()
    for (const c of d.customers || []) { const t = String(c.territory || '').trim(); if (t && t !== '—') set.add(t) }
    for (const b of d.settings?.branches || []) { const t = String(b.city || '').trim(); if (t) set.add(t) }
    for (const t of TERRITORY_DEFAULTS) set.add(t)
    return [...set]
  }, [d.customers, d.settings])
}

// Lead-source options — distinct sources already in the DB merged with defaults, so the
// business can introduce a new source just by typing it (no code change required).
const LEAD_SOURCE_DEFAULTS = ['Website', 'Referral', 'Exhibition', 'Cold Call', 'WhatsApp', 'Social Media']
function useLeadSourceOptions(d) {
  return useMemo(() => {
    const set = new Set(LEAD_SOURCE_DEFAULTS)
    for (const l of d.leads || []) { const s = String(l.source || '').trim(); if (s) set.add(s) }
    return [...set]
  }, [d.leads])
}

export default function FormModals() {
  const d = useData()
  const t = d.form.type
  return (
    <>
      <LeadModal open={t === 'lead'} d={d} />
      <OpportunityModal open={t === 'opportunity'} d={d} />
      <QuotationModal open={t === 'quotation'} d={d} />
      <OrderModal open={t === 'order'} d={d} />
      <CustomerModal open={t === 'customer'} d={d} />
      <InteractionModal open={t === 'interaction'} d={d} />
    </>
  )
}

function InteractionModal({ open, d }) {
  const prefill = d.form.editing
  const [v, setV] = useState({ customer: '', type: 'Call', notes: '', nextAction: '' })
  useEffect(() => { if (open) setV({ customer: prefill?.customer || '', type: 'Call', notes: '', nextAction: '' }) }, [open, prefill])
  const on = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }))
  const save = async () => {
    if (!v.customer || !v.notes) { alert('Customer and notes are required'); return }
    try { await d.addInteraction(v) } catch (e) { alert(e.message); return }
    d.closeForm()
  }
  return (
    <Modal open={open} onClose={d.closeForm} title="Log Activity" subtitle="Record a call, meeting or visit (interaction log)"
      footer={<><button className="btn-ghost" onClick={d.closeForm}>Cancel</button><SaveButton onClick={save}>Save Activity</SaveButton></>}>
      <Row>
        <CustomerField d={d} open={open} value={v.customer} onChange={on('customer')} />
        <Select label="Type" value={v.type} onChange={on('type')} options={['Call', 'Meeting', 'Email', 'WhatsApp', 'Site Visit']} />
      </Row>
      <Field label="Notes" value={v.notes} onChange={on('notes')} placeholder="What was discussed?" />
      <Field label="Next Action" value={v.nextAction} onChange={on('nextAction')} placeholder="e.g. Send revised quote by Sunday" />
    </Modal>
  )
}

function useFormState(init) {
  const [v, setV] = useState(init)
  const on = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }))
  return [v, on, () => setV(init)]
}

const Btn = ({ children, ...p }) => <button {...p}>{children}</button>

// Button that shows a spinner while its async action runs (so the user sees progress)
function SaveButton({ onClick, children, className = 'btn-primary' }) {
  const [loading, setLoading] = useState(false)
  const handle = async () => { setLoading(true); try { await onClick() } finally { setLoading(false) } }
  return (
    <button className={`${className} disabled:opacity-70`} onClick={handle} disabled={loading}>
      {loading && <Loader2 size={15} className="animate-spin" />}
      {loading ? 'Saving…' : children}
    </button>
  )
}

function LeadModal({ open, d }) {
  const prefill = d.form.editing
  const [v, setV] = useState({ name: '', company: '', source: 'Website', value: '' })
  useEffect(() => { if (open) setV({ name: prefill?.name || '', company: prefill?.company || '', source: 'Website', value: '' }) }, [open, prefill])
  const on = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }))
  const reset = () => setV({ name: '', company: '', source: 'Website', value: '' })
  const sources = useLeadSourceOptions(d)
  const save = async () => { try { await d.addLead(v) } catch (e) { alert(e.message); return } reset(); d.closeForm() }
  return (
    <Modal open={open} onClose={d.closeForm} title="New Lead" subtitle="Capture a new customer enquiry"
      footer={<><button className="btn-ghost" onClick={d.closeForm}>Cancel</button><SaveButton onClick={save}>Create Lead</SaveButton></>}>
      <Field label="Contact Name" value={v.name} onChange={on('name')} placeholder="e.g. Mohammed Khalid" />
      <Field label="Company" value={v.company} onChange={on('company')} placeholder="e.g. Riyadh Grand Hotel" />
      <Row>
        <div>
          <Field label="Source" value={v.source} onChange={on('source')} list="lead-sources" placeholder="e.g. Website (pick or type new)" autoComplete="off" />
          <datalist id="lead-sources">{sources.map((s) => <option key={s} value={s} />)}</datalist>
        </div>
        <Field label="Estimated Value (SAR)" type="number" value={v.value} onChange={on('value')} placeholder="850000" />
      </Row>
      <OwnerField />
    </Modal>
  )
}

function OpportunityModal({ open, d }) {
  const [v, on, reset] = useFormState({ customer: '', stage: 'Prospecting', value: '', prob: 30, close: '' })
  const save = async () => {
    if (!v.customer) { alert('Customer is required'); return }
    if (!v.close) { alert('Next action / expected close date is required (business rule).'); return }
    try { await d.addOpportunity(v) } catch (e) { alert(e.message); return }
    reset(); d.closeForm()
  }
  return (
    <Modal open={open} onClose={d.closeForm} title="New Opportunity" subtitle="Create a qualified deal"
      footer={<><button className="btn-ghost" onClick={d.closeForm}>Cancel</button><SaveButton onClick={save}>Create Opportunity</SaveButton></>}>
      <CustomerField d={d} open={open} value={v.customer} onChange={on('customer')} />
      <Row>
        <Select label="Stage" value={v.stage} onChange={on('stage')} options={['Prospecting', 'Quotation', 'Negotiation', 'Won']} />
        <Field label="Deal Value (SAR)" type="number" value={v.value} onChange={on('value')} placeholder="850000" />
      </Row>
      <Row>
        <Field label="Probability (%)" type="number" value={v.prob} onChange={on('prob')} />
        <Field label="Next Action / Close Date *" type="date" value={v.close} onChange={on('close')} />
      </Row>
      <OwnerField />
    </Modal>
  )
}

const ROLE_DISCOUNT = { 'Sales User': 10, 'Sales Manager': 20, 'Management': 25, 'System Admin': 25 } // SEC-002 mirror of backend
const blankQuote = () => ({ customer: '', email: '', contact: '', projectName: '', location: '', paymentTerms: '50% advance, 50% on delivery', deliveryDate: '', notes: '', discount: '0', discountFixed: '0', validity: '30', items: [{ name: '', qty: 1, rate: '' }] })
const cell = 'w-full rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white'

function QuotationModal({ open, d }) {
  const { user } = useAuth()
  const directLimit = ROLE_DISCOUNT[user?.role] ?? 5
  const isApprover = ['Management', 'System Admin'].includes(user?.role)
  const editing = d.form.editing
  const isEdit = !!(editing && editing.id)   // editing with id = real edit; without id = prefill for a NEW quote
  const [v, setV] = useState(blankQuote())
  useEffect(() => {
    if (!open) return
    if (isEdit) {
      setV({
        customer: editing.customer || '', email: editing.email || '', contact: editing.contact_person || '',
        projectName: editing.project_name || '', location: editing.project_location || '',
        paymentTerms: editing.payment_terms || '', discount: String(editing.discount ?? 0), discountFixed: String(editing.discount_fixed ?? 0),
        deliveryDate: editing.delivery_date || '', notes: editing.notes || '',
        validity: String(editing.validity || 30),
        items: editing.items?.length ? editing.items.map((it) => ({ name: it.name, qty: it.qty, rate: it.rate })) : [{ name: '', qty: 1, rate: '' }],
      })
    } else {
      setV({ ...blankQuote(), customer: editing?.customer || '', email: editing?.email || '' })
    }
  }, [open, editing, isEdit])

  const on = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }))
  const setItem = (i, k, val) => setV((s) => ({ ...s, items: s.items.map((it, idx) => (idx === i ? { ...it, [k]: val } : it)) }))
  const addItem = () => setV((s) => ({ ...s, items: [...s.items, { name: '', qty: 1, rate: '' }] }))
  const removeItem = (i) => setV((s) => ({ ...s, items: s.items.length > 1 ? s.items.filter((_, idx) => idx !== i) : s.items }))
  // Item-picker from the Item Master: pick a known item → auto-fill its selling rate
  const masterByName = useMemo(() => { const m = {}; (d.items || []).forEach((it) => { m[(it.item_name || '').toLowerCase()] = it }); return m }, [d.items])
  const onItemName = (i, name) => setV((s) => ({ ...s, items: s.items.map((it, idx) => {
    if (idx !== i) return it
    const m = masterByName[(name || '').trim().toLowerCase()]
    const rate = m && (!it.rate || Number(it.rate) === 0) ? (m.standard_rate || it.rate) : it.rate
    return { ...it, name, rate }
  }) }))

  const disc = Math.max(0, Number(v.discount) || 0)
  const fixedDisc = Math.max(0, Number(v.discountFixed) || 0)
  const net = v.items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0)
  const discountAmount = Math.min(net, (net * disc) / 100 + fixedDisc)   // SO-003 dual discount
  const netAfter = net - discountAmount
  const vat = netAfter * 0.15
  const total = netAfter + vat
  const effectivePct = net > 0 ? (discountAmount / net) * 100 : 0
  const needsApproval = !isApprover && effectivePct > directLimit  // SEC-002 per-role limit on combined discount
  const blocked = effectivePct > 25                                 // >25% → not allowed at all

  const save = async (send) => {
    const payload = { ...v, amount: Math.round(total) }
    let created
    try {
      if (isEdit) { await d.updateQuotation(editing.id, payload); created = editing }
      else { created = await d.addQuotation(payload) }
    } catch (e) { alert(e.message); return }
    d.closeForm()
    if (send) {
      if (needsApproval) { alert('This quotation needs manager approval before it can be sent to the customer.'); return }
      if (!v.email) { alert('Saved. Add the customer’s email so they can see it in their portal/chat.'); return }
      const ref = created?.number || editing?.ref || 'your quotation'
      // No email module — notify the customer via their chat; they Accept/Reject/Concession in their portal.
      await d.sendChatReply(v.email, v.customer, `📄 Quotation ${ref} (Total ${sar(Math.round(total))}) has been sent for your review. Please Accept, Reject, or request a concession in your portal.`).catch(() => {})
    }
  }

  return (
    <Modal open={open} onClose={d.closeForm} size="lg" title={isEdit ? `Edit Quotation · ${editing.ref || ''}` : 'New Quotation / Estimation'} subtitle={isEdit ? 'Editing creates a new revision (history is kept)' : 'Build the BOQ — VAT & total are calculated automatically'}
      footer={isEdit ? (
        <>
          <button className="btn-ghost" onClick={d.closeForm}>Close</button>
          <SaveButton onClick={() => save(false)} className="btn-ghost">Save</SaveButton>
          <SaveButton onClick={() => save(true)}>Update &amp; Send</SaveButton>
        </>
      ) : (
        <>
          <button className="btn-ghost" onClick={d.closeForm}>Cancel</button>
          <SaveButton onClick={() => save(false)} className="btn-ghost">Save</SaveButton>
          <SaveButton onClick={() => save(true)}>Send to Customer</SaveButton>
        </>
      )}>
      <Row>
        <CustomerField d={d} open={open} value={v.customer} onChange={on('customer')} />
        <Field label="Customer Email" type="email" value={v.email} onChange={on('email')} placeholder="customer@email.com" />
      </Row>
      <Row>
        <Field label="Contact Person" value={v.contact} onChange={on('contact')} placeholder="e.g. Mr. Khalid" />
        <Field label="Project Name" value={v.projectName} onChange={on('projectName')} placeholder="e.g. Main Kitchen Fitout" />
      </Row>
      <Row>
        <Field label="Project Location" value={v.location} onChange={on('location')} placeholder="e.g. Riyadh" />
        <Select label="Validity (days)" value={v.validity} onChange={on('validity')} options={['15', '30', '60']} />
      </Row>
      <Row>
        <Field label="Payment Terms" value={v.paymentTerms} onChange={on('paymentTerms')} placeholder="e.g. 50% advance, 50% on delivery" />
        <Field label="Required Delivery Date" type="date" value={v.deliveryDate} onChange={on('deliveryDate')} hint="Committed completion deadline — passed to the Project Manager" />
      </Row>
      <TextArea label="Special Requirements / Notes" rows={3} value={v.notes} onChange={on('notes')} placeholder="Site conditions, special equipment specs, access instructions… (handed to the project team)" />

      {/* BOQ items editor */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-600">Items (BOQ)</span>
          <button onClick={addItem} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"><Plus size={13} /> Add Item</button>
        </div>
        <datalist id="qmaster-items">{(d.items || []).map((it) => <option key={it.id} value={it.item_name} />)}</datalist>
        <div className="grid grid-cols-[1fr_50px_84px_92px_22px] gap-2 px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          <span>Description</span><span className="text-center">Qty</span><span className="text-right">Unit Rate</span><span className="text-right">Amount</span><span />
        </div>
        <div className="space-y-2">
          {v.items.map((it, i) => (
            <div key={i}>
              <div className="grid grid-cols-[1fr_50px_84px_92px_22px] items-center gap-2">
                <input className={cell} placeholder="Item description" list="qmaster-items" value={it.name} onChange={(e) => onItemName(i, e.target.value)} />
                <input className={`${cell} text-center`} type="number" value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} />
                <input className={`${cell} text-right`} type="number" placeholder="0" value={it.rate} onChange={(e) => setItem(i, 'rate', e.target.value)} />
                <span className="text-right text-sm font-semibold text-ink">{sar(Math.round((Number(it.qty) || 0) * (Number(it.rate) || 0)))}</span>
                <button onClick={() => removeItem(i)} className="text-slate-300 hover:text-rose-500"><X size={15} /></button>
              </div>
              <AvailabilityHint name={it.name} qty={it.qty} check={d.checkAvailability} />
            </div>
          ))}
        </div>
        {/* totals */}
        <div className="mt-3 flex justify-end">
          <div className="w-60 space-y-1 text-sm">
            <div className="flex justify-between text-slate-600"><span>Subtotal (Net)</span><span>{sar(Math.round(net))}</span></div>
            {discountAmount > 0 && <div className="flex justify-between text-rose-600"><span>Discount ({Math.round(effectivePct)}%{fixedDisc > 0 ? ` incl. ${sar(fixedDisc)}` : ''})</span><span>− {sar(Math.round(discountAmount))}</span></div>}
            <div className="flex justify-between text-slate-600"><span>VAT (15%)</span><span>{sar(Math.round(vat))}</span></div>
            <div className="flex justify-between rounded-lg bg-brand-50 px-2.5 py-1.5 font-bold text-brand-700"><span>Total</span><span>{sar(Math.round(total))}</span></div>
          </div>
        </div>
      </div>

      <Row>
        <Field label="Discount (%)" type="number" value={v.discount} onChange={on('discount')} placeholder="0" />
        <Field label="Fixed Discount (SAR)" type="number" value={v.discountFixed} onChange={on('discountFixed')} placeholder="0" hint={discountAmount > 0 ? `Combined ≈ ${Math.round(effectivePct)}% (${sar(Math.round(discountAmount))})` : ''} />
      </Row>
      {blocked && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
          ⛔ Discount above 25% is not allowed — reduce the discount.
        </div>
      )}
      {!blocked && needsApproval && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
          ⚠ Discount above your {directLimit}% limit — this quotation needs manager/CEO approval before it can be sent.
        </div>
      )}
      <OwnerField />
    </Modal>
  )
}

function OrderModal({ open, d }) {
  const [v, setV] = useState({ customer: '', projectName: '', items: [{ name: '', qty: 1, rate: '' }] })
  useEffect(() => { if (open) setV({ customer: '', projectName: '', items: [{ name: '', qty: 1, rate: '' }] }) }, [open])
  const on = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }))
  const setItem = (i, k, val) => setV((s) => ({ ...s, items: s.items.map((it, idx) => (idx === i ? { ...it, [k]: val } : it)) }))
  const addItem = () => setV((s) => ({ ...s, items: [...s.items, { name: '', qty: 1, rate: '' }] }))
  const removeItem = (i) => setV((s) => ({ ...s, items: s.items.length > 1 ? s.items.filter((_, idx) => idx !== i) : s.items }))
  const net = v.items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0)
  const total = net * 1.15
  const save = async () => { try { await d.addOrder(v) } catch (e) { alert(e.message); return } d.closeForm() }
  return (
    <Modal open={open} onClose={d.closeForm} size="lg" title="New Sales Order" subtitle="Capture full data — a linked Project + required items are created automatically"
      footer={<><button className="btn-ghost" onClick={d.closeForm}>Cancel</button><SaveButton onClick={save}>Create Order &amp; Project</SaveButton></>}>
      <Row>
        <CustomerField d={d} open={open} value={v.customer} onChange={on('customer')} placeholder="e.g. Riyadh Grand Hotel (pick or type new)" />
        <Field label="Project Name" value={v.projectName} onChange={on('projectName')} placeholder="e.g. Commercial Kitchen" />
      </Row>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-600">Required Items (what the customer needs)</span>
          <button onClick={addItem} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"><Plus size={13} /> Add Item</button>
        </div>
        <div className="grid grid-cols-[1fr_50px_84px_92px_22px] gap-2 px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          <span>Description</span><span className="text-center">Qty</span><span className="text-right">Unit Rate</span><span className="text-right">Amount</span><span />
        </div>
        <div className="space-y-2">
          {v.items.map((it, i) => (
            <div key={i} className="grid grid-cols-[1fr_50px_84px_92px_22px] items-center gap-2">
              <input className={cell} placeholder="Item description" value={it.name} onChange={(e) => setItem(i, 'name', e.target.value)} />
              <input className={`${cell} text-center`} type="number" value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} />
              <input className={`${cell} text-right`} type="number" placeholder="0" value={it.rate} onChange={(e) => setItem(i, 'rate', e.target.value)} />
              <span className="text-right text-sm font-semibold text-ink">{sar(Math.round((Number(it.qty) || 0) * (Number(it.rate) || 0)))}</span>
              <button onClick={() => removeItem(i)} className="text-slate-300 hover:text-rose-500"><X size={15} /></button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <div className="w-56 space-y-1 text-sm">
            <div className="flex justify-between text-slate-600"><span>Subtotal (Net)</span><span>{sar(Math.round(net))}</span></div>
            <div className="flex justify-between text-slate-600"><span>VAT (15%)</span><span>{sar(Math.round(net * 0.15))}</span></div>
            <div className="flex justify-between rounded-lg bg-brand-50 px-2.5 py-1.5 font-bold text-brand-700"><span>Total</span><span>{sar(Math.round(total))}</span></div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-700">
        ⚙ On creation: a <b>Project</b> is auto-generated, and these items become its <b>Required Items</b> for the Project Manager to assign &amp; track.
      </div>
    </Modal>
  )
}

function CustomerModal({ open, d }) {
  const [v, on, reset] = useFormState({ name: '', group: '', territory: 'Riyadh', contact: '', email: '', phone: '' })
  const [cats, setCats] = useState([])
  const territories = useTerritoryOptions(d)
  useEffect(() => { if (open) d.partyCategories('customer').then((c) => setCats((c || []).map((x) => x.name))).catch(() => setCats([])) }, [open, d])
  const save = async () => { try { await d.addCustomer({ name: v.name, category: v.group, territory: v.territory, contact: v.contact, email: v.email, phone: v.phone }) } catch (e) { alert(e.message); return } reset(); d.closeForm() }
  return (
    <Modal open={open} onClose={d.closeForm} title="New Customer" subtitle="Add a customer account"
      footer={<><button className="btn-ghost" onClick={d.closeForm}>Cancel</button><SaveButton onClick={save}>Create Customer</SaveButton></>}>
      <Field label="Customer Name" value={v.name} onChange={on('name')} placeholder="e.g. Jeddah Hilton" />
      <Row>
        <Select label="Group / Category" value={v.group} onChange={on('group')} options={cats.length ? cats : ['Hotel', 'Restaurant', 'Catering', 'Hospital', 'Contractor']} />
        <div>
          <Field label="Territory" value={v.territory} onChange={on('territory')} list="cust-territories" placeholder="e.g. Riyadh (pick or type new)" autoComplete="off" />
          <datalist id="cust-territories">{territories.map((t) => <option key={t} value={t} />)}</datalist>
        </div>
      </Row>
      <Row>
        <Field label="Contact Person" value={v.contact} onChange={on('contact')} placeholder="e.g. Ahmed Ali" />
        <Field label="Phone" value={v.phone} onChange={on('phone')} placeholder="05xxxxxxxx" />
      </Row>
      <Field label="Email" value={v.email} onChange={on('email')} placeholder="name@company.com" />
    </Modal>
  )
}
