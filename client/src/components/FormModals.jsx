import { useState, useEffect } from 'react'
import { X, Plus } from 'lucide-react'
import { useData } from '../store/DataContext.jsx'
import { Modal, Field, Select, Row } from './Modal.jsx'
import { emailTemplates } from '../data/mailData.js'
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
    </>
  )
}

function useFormState(init) {
  const [v, setV] = useState(init)
  const on = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }))
  return [v, on, () => setV(init)]
}

const Btn = ({ children, ...p }) => <button {...p}>{children}</button>

function LeadModal({ open, d }) {
  const [v, on, reset] = useFormState({ name: '', company: '', source: 'Website', value: '' })
  const save = async () => { try { await d.addLead(v) } catch (e) { alert(e.message); return } reset(); d.closeForm() }
  return (
    <Modal open={open} onClose={d.closeForm} title="New Lead" subtitle="Capture a new customer enquiry"
      footer={<><button className="btn-ghost" onClick={d.closeForm}>Cancel</button><button className="btn-primary" onClick={save}>Create Lead</button></>}>
      <Field label="Contact Name" value={v.name} onChange={on('name')} placeholder="e.g. Mohammed Khalid" />
      <Field label="Company" value={v.company} onChange={on('company')} placeholder="e.g. Riyadh Grand Hotel" />
      <Row>
        <Select label="Source" value={v.source} onChange={on('source')} options={['Website', 'Referral', 'Exhibition', 'Cold Call']} />
        <Field label="Estimated Value (SAR)" type="number" value={v.value} onChange={on('value')} placeholder="850000" />
      </Row>
      <OwnerField />
    </Modal>
  )
}

function OpportunityModal({ open, d }) {
  const [v, on, reset] = useFormState({ customer: '', stage: 'Prospecting', value: '', prob: 30, close: '' })
  const save = async () => { try { await d.addOpportunity(v) } catch (e) { alert(e.message); return } reset(); d.closeForm() }
  return (
    <Modal open={open} onClose={d.closeForm} title="New Opportunity" subtitle="Create a qualified deal"
      footer={<><button className="btn-ghost" onClick={d.closeForm}>Cancel</button><button className="btn-primary" onClick={save}>Create Opportunity</button></>}>
      <Field label="Customer" value={v.customer} onChange={on('customer')} placeholder="Customer name" />
      <Row>
        <Select label="Stage" value={v.stage} onChange={on('stage')} options={['Prospecting', 'Quotation', 'Negotiation', 'Won']} />
        <Field label="Deal Value (SAR)" type="number" value={v.value} onChange={on('value')} placeholder="850000" />
      </Row>
      <Row>
        <Field label="Probability (%)" type="number" value={v.prob} onChange={on('prob')} />
        <Field label="Expected Close" type="date" value={v.close} onChange={on('close')} />
      </Row>
      <OwnerField />
    </Modal>
  )
}

const blankQuote = () => ({ customer: '', email: '', contact: '', projectName: '', location: '', paymentTerms: '50% advance, 50% on delivery', gp: '', valid: '', validity: '30', items: [{ name: '', qty: 1, rate: '' }] })
const cell = 'w-full rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white'

function QuotationModal({ open, d }) {
  const editing = d.form.editing
  const [v, setV] = useState(blankQuote())
  useEffect(() => {
    if (open) {
      setV(editing
        ? {
            customer: editing.customer || '', email: editing.email || '', gp: editing.gp || '',
            valid: editing.valid || '', owner: editing.owner || 'Ahmed',
            items: editing.items?.length ? editing.items.map((it) => ({ ...it })) : [{ name: '', qty: 1, rate: '' }],
          }
        : blankQuote())
    }
  }, [open, editing])

  const on = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }))
  const setItem = (i, k, val) => setV((s) => ({ ...s, items: s.items.map((it, idx) => (idx === i ? { ...it, [k]: val } : it)) }))
  const addItem = () => setV((s) => ({ ...s, items: [...s.items, { name: '', qty: 1, rate: '' }] }))
  const removeItem = (i) => setV((s) => ({ ...s, items: s.items.length > 1 ? s.items.filter((_, idx) => idx !== i) : s.items }))

  const net = v.items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0)
  const vat = net * 0.15
  const total = net + vat
  const lowGp = v.gp !== '' && Number(v.gp) < 25

  const save = async (send) => {
    const payload = { ...v, amount: Math.round(total) }
    try {
      if (editing) await d.updateQuotation(editing.id, payload)
      else await d.addQuotation(payload)
    } catch (e) { alert(e.message); return }
    d.closeForm()
    if (send) {
      const rec = { customer: v.customer, id: editing?.number || editing?.id || 'Quotation', amount: Math.round(total), email: v.email }
      const tpl = emailTemplates.quotation(rec.customer, rec.id, sar(rec.amount))
      d.openCompose({ to: rec.email || '', toName: rec.customer, subject: tpl.subject, body: tpl.body, attachment: `${rec.id}.pdf`, quotation: rec })
    }
  }

  return (
    <Modal open={open} onClose={d.closeForm} size="lg" title={editing ? `Edit Quotation · ${editing.id}` : 'New Quotation / Estimation'} subtitle={editing ? 'Changes save automatically as you edit' : 'Build the BOQ — total is calculated from the items'}
      footer={editing ? (
        <>
          <button className="btn-ghost" onClick={d.closeForm}>Close</button>
          <button className="btn-primary" onClick={() => save(true)}>Update &amp; Email</button>
        </>
      ) : (
        <>
          <button className="btn-ghost" onClick={d.closeForm}>Cancel</button>
          <button className="btn-ghost" onClick={() => save(false)}>Save</button>
          <button className="btn-primary" onClick={() => save(true)}>Save &amp; Email</button>
        </>
      )}>
      <Row>
        <Field label="Customer" value={v.customer} onChange={on('customer')} placeholder="Customer name" />
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
      <Field label="Payment Terms" value={v.paymentTerms} onChange={on('paymentTerms')} placeholder="e.g. 50% advance, 50% on delivery" />

      {/* BOQ items editor */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-600">Items (BOQ)</span>
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
        {/* totals */}
        <div className="mt-3 flex justify-end">
          <div className="w-56 space-y-1 text-sm">
            <div className="flex justify-between text-slate-600"><span>Subtotal (Net)</span><span>{sar(Math.round(net))}</span></div>
            <div className="flex justify-between text-slate-600"><span>VAT (15%)</span><span>{sar(Math.round(vat))}</span></div>
            <div className="flex justify-between rounded-lg bg-brand-50 px-2.5 py-1.5 font-bold text-brand-700"><span>Total</span><span>{sar(Math.round(total))}</span></div>
          </div>
        </div>
      </div>

      {lowGp && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
          ⚠ GP below 25% — this quotation will require manager approval before sending.
        </div>
      )}
      <Row>
        <Field label="Gross Profit (%)" type="number" value={v.gp} onChange={on('gp')} placeholder="28" />
        <Field label="Valid Till" type="date" value={v.valid} onChange={on('valid')} />
      </Row>
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
      footer={<><button className="btn-ghost" onClick={d.closeForm}>Cancel</button><button className="btn-primary" onClick={save}>Create Order &amp; Project</button></>}>
      <Row>
        <Field label="Customer" value={v.customer} onChange={on('customer')} placeholder="e.g. Riyadh Grand Hotel" />
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
  const [v, on, reset] = useFormState({ name: '', group: 'Hospitality', territory: 'Riyadh' })
  const save = async () => { try { await d.addCustomer({ name: v.name, category: v.group, territory: v.territory }) } catch (e) { alert(e.message); return } reset(); d.closeForm() }
  return (
    <Modal open={open} onClose={d.closeForm} title="New Customer" subtitle="Add a customer account"
      footer={<><button className="btn-ghost" onClick={d.closeForm}>Cancel</button><button className="btn-primary" onClick={save}>Create Customer</button></>}>
      <Field label="Customer Name" value={v.name} onChange={on('name')} placeholder="e.g. Jeddah Hilton" />
      <Row>
        <Select label="Group" value={v.group} onChange={on('group')} options={['Hospitality', 'Catering', 'Restaurant', 'Retail']} />
        <Select label="Territory" value={v.territory} onChange={on('territory')} options={['Riyadh', 'Jeddah', 'Eastern', 'Makkah']} />
      </Row>
    </Modal>
  )
}
