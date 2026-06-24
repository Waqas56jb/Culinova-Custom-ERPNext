import { useState } from 'react'
import { Building2, ShieldCheck, Save } from 'lucide-react'
import { PageHeader, Badge, accessTone } from '../components/ui.jsx'
import { Field, Row, Select } from '../components/Modal.jsx'
import { accessLevels } from '../data/adminData.js'

export default function Settings() {
  const [c, setC] = useState({ name: 'CULINOVA', vat: '3001234567800003', city: 'Riyadh', currency: 'SAR', timezone: 'Asia/Riyadh' })
  const on = (k) => (e) => setC((s) => ({ ...s, [k]: e.target.value }))

  return (
    <>
      <PageHeader title="Settings" subtitle="Company profile & system configuration">
        <button className="btn-primary"><Save size={16} /> Save Changes</button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card card-pad lg:col-span-2">
          <div className="mb-4 flex items-center gap-2"><Building2 size={18} className="text-brand-600" /><h3 className="font-bold text-ink">Company Profile</h3></div>
          <div className="space-y-4">
            <Row>
              <Field label="Company Name" value={c.name} onChange={on('name')} />
              <Field label="VAT / ZATCA No." value={c.vat} onChange={on('vat')} />
            </Row>
            <Row>
              <Field label="City" value={c.city} onChange={on('city')} />
              <Select label="Currency" value={c.currency} onChange={on('currency')} options={['SAR', 'USD', 'AED']} />
            </Row>
            <Field label="Time Zone" value={c.timezone} onChange={on('timezone')} />
          </div>
        </div>

        <div className="card card-pad">
          <div className="mb-4 flex items-center gap-2"><ShieldCheck size={18} className="text-brand-600" /><h3 className="font-bold text-ink">Access Levels</h3></div>
          <div className="space-y-2">
            {accessLevels.map((a) => (
              <div key={a} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2">
                <span className="text-sm text-slate-600">{a}</span>
                <Badge tone={accessTone[a]}>{a}</Badge>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">ZATCA, VAT &amp; accounting remain in ERPNext (KSA Compliance) — never rebuilt.</p>
        </div>
      </div>
    </>
  )
}
