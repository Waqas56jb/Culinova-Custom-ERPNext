import { useState, useEffect } from 'react'
import { Plus, ShieldCheck, FolderKanban, Coins } from 'lucide-react'
import { PageHeader, Badge, statusTone } from '../components/ui.jsx'
import { Modal, Field, Select, Row } from '../components/Modal.jsx'
import { sar } from '../data/mockData.js'
import { useData } from '../store/DataContext.jsx'

export default function SalesInvoices() {
  const { invoices, createInvoice, recordPayment, resList } = useData()
  // Customer & Project belong to panels the Accounts User does not own → self-fetch from shared lookups.
  const [custs, setCusts] = useState([])
  const [projs, setProjs] = useState([])
  useEffect(() => {
    resList('lookups/customers').then((r) => setCusts(Array.isArray(r) ? r : [])).catch(() => setCusts([]))
    resList('lookups/projects').then((r) => setProjs(Array.isArray(r) ? r : [])).catch(() => setProjs([]))
  }, [])
  const projMap = Object.fromEntries(projs.map((p) => [p.id, p.label || `${p.ref || ''} ${p.name || ''}`.trim()]))
  const customerOpts = [{ value: '', label: '— Select customer —' }, ...custs.map((c) => ({ value: c.name, label: c.label || c.name }))]
  const projectOpts = [{ value: '', label: '— None —' }, ...projs.map((p) => ({ value: p.id, label: p.label || `${p.ref || ''} ${p.name || ''}`.trim() }))]
  const [newModal, setNewModal] = useState(false)
  const [payModal, setPayModal] = useState(null)
  const [nv, setNv] = useState({ customer: '', project: '', total: '' })
  const [amt, setAmt] = useState('')
  const inv = invoices.find((i) => i.id === payModal)

  const saveNew = async () => {
    if (!nv.customer || !nv.total) return
    try { await createInvoice(nv) } catch (e) { alert(e.message || 'Failed to create invoice'); return }
    setNv({ customer: '', project: '', total: '' }); setNewModal(false)
  }
  const savePay = async () => {
    try { await recordPayment(payModal, amt) } catch (e) { alert(e.message || 'Failed to record payment'); return }
    setAmt(''); setPayModal(null)
  }

  return (
    <>
      <PageHeader title="Sales Invoices" subtitle="ZATCA-compliant e-invoices · VAT 15%">
        <button className="btn-primary" onClick={() => setNewModal(true)}><Plus size={16} /> New Invoice</button>
      </PageHeader>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead><tr className="bg-slate-50/60">
              <th className="th">Invoice</th><th className="th">Customer</th><th className="th">Project</th>
              <th className="th">Net</th><th className="th">VAT</th><th className="th">Total</th><th className="th">Balance</th><th className="th">Status</th><th className="th text-right">Action</th>
            </tr></thead>
            <tbody>
              {invoices.map((i) => {
                const net = Math.round(i.total / 1.15)
                const bal = i.total - i.paid
                const projLabel = i.project && i.project !== '—' ? (projMap[i.project] || i.project) : null
                return (
                  <tr key={i.id} className="hover:bg-slate-50/60">
                    <td className="td">
                      <span className="font-semibold text-brand-600">{i.ref}</span>
                      <span className="ml-2 inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600"><ShieldCheck size={11} /> ZATCA</span>
                    </td>
                    <td className="td font-medium text-ink">{i.customer}</td>
                    <td className="td">{projLabel ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600"><FolderKanban size={12} /> {projLabel}</span> : <span className="text-slate-300">—</span>}</td>
                    <td className="td text-slate-600">{sar(net)}</td>
                    <td className="td text-slate-600">{sar(i.total - net)}</td>
                    <td className="td font-semibold">{sar(i.total)}</td>
                    <td className="td">{bal > 0 ? <span className="font-semibold text-rose-600">{sar(bal)}</span> : '—'}</td>
                    <td className="td"><Badge tone={statusTone(i.status)}>{i.status}</Badge></td>
                    <td className="td text-right">
                      {bal > 0 ? (
                        <button onClick={() => { setPayModal(i.id); setAmt(bal) }} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-500 hover:text-white"><Coins size={13} /> Record Payment</button>
                      ) : <span className="chip bg-emerald-50 text-emerald-600">Settled</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* New invoice */}
      <Modal open={newModal} onClose={() => setNewModal(false)} title="New Sales Invoice" subtitle="VAT 15% + ZATCA e-invoice generated automatically"
        footer={<><button className="btn-ghost" onClick={() => setNewModal(false)}>Cancel</button><button className="btn-primary" onClick={saveNew}>Create Invoice</button></>}>
        <Row>
          <Select label="Customer" value={nv.customer} onChange={(e) => setNv((s) => ({ ...s, customer: e.target.value }))} options={customerOpts} />
          <Select label="Project" value={nv.project} onChange={(e) => setNv((s) => ({ ...s, project: e.target.value }))} options={projectOpts} />
        </Row>
        <Field label="Total incl. VAT (SAR)" type="number" value={nv.total} onChange={(e) => setNv((s) => ({ ...s, total: e.target.value }))} placeholder="480000" />
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">🛡 ZATCA e-invoice with QR code will be generated on creation (handled by ERPNext KSA Compliance).</div>
      </Modal>

      {/* Record payment */}
      <Modal open={!!inv} onClose={() => setPayModal(null)} title="Record Payment" subtitle={inv ? `${inv.ref} · ${inv.customer}` : ''}
        footer={<><button className="btn-ghost" onClick={() => setPayModal(null)}>Cancel</button><button className="btn-primary" onClick={savePay}>Record Payment</button></>}>
        {inv && (
          <>
            <div className="mb-2 flex justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"><span className="text-muted">Outstanding</span><span className="font-bold text-ink">{sar(inv.total - inv.paid)}</span></div>
            <Field label="Amount Received (SAR)" type="number" value={amt} onChange={(e) => setAmt(e.target.value)} />
          </>
        )}
      </Modal>
    </>
  )
}
