import { useEffect, useState } from 'react'
import { Send, Users2, Briefcase, UserRound, User, CheckCircle2, Megaphone } from 'lucide-react'
import { PageHeader } from '../components/ui.jsx'
import { api } from '../api.js'

const inp = 'w-full rounded-lg border border-slate-200 bg-slate-50/70 py-2.5 px-3 text-sm outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-500/15'

const AUDIENCES = [
  { key: 'all_employees', label: 'All Employees', desc: 'Everyone on the team', icon: Users2 },
  { key: 'designation', label: 'By Designation', desc: 'A specific role / job title', icon: Briefcase },
  { key: 'all_customers', label: 'All Customers', desc: 'Every registered customer', icon: UserRound },
  { key: 'email', label: 'Specific Person', desc: 'One employee or customer by email', icon: User },
]

export default function Notifications() {
  const [audience, setAudience] = useState('all_employees')
  const [value, setValue] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [meta, setMeta] = useState({ customers: 0, employees: 0, designations: [] })
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => { api('/notifications/audiences').then(setMeta).catch(() => {}) }, [])

  const count = audience === 'all_employees' ? meta.employees : audience === 'all_customers' ? meta.customers : null

  const send = async () => {
    setError(''); setResult(null)
    if (!body.trim()) return setError('Please write a message.')
    if (audience === 'designation' && !value) return setError('Pick a designation.')
    if (audience === 'email' && !value.trim()) return setError('Enter the recipient email.')
    setSending(true)
    try {
      const r = await api('/notifications/send', { method: 'POST', body: { audience, value, title, body } })
      setResult(r.sent); setTitle(''); setBody(''); setValue('')
    } catch (e) { setError(e.message) } finally { setSending(false) }
  }

  return (
    <>
      <PageHeader title="Notifications & Announcements" subtitle="Send an announcement to your team or customers — recipients get an instant notification badge." />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card card-pad space-y-5 lg:col-span-2">
          <div>
            <label className="mb-2 block text-sm font-semibold text-ink">Who should receive this?</label>
            <div className="grid gap-3 sm:grid-cols-2">
              {AUDIENCES.map((a) => (
                <button key={a.key} type="button" onClick={() => { setAudience(a.key); setValue(''); setResult(null) }} className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${audience === a.key ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/20' : 'border-slate-200 hover:border-slate-300'}`}>
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${audience === a.key ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500'}`}><a.icon size={17} /></span>
                  <span><span className="block text-sm font-semibold text-ink">{a.label}</span><span className="block text-xs text-muted">{a.desc}</span></span>
                </button>
              ))}
            </div>
          </div>

          {audience === 'designation' && (
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink">Designation</label>
              <select value={value} onChange={(e) => setValue(e.target.value)} className={inp}>
                <option value="">Select a designation…</option>
                {meta.designations.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}
          {audience === 'email' && (
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink">Recipient email</label>
              <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="person@email.com" className={inp} />
              <p className="mt-1 text-xs text-muted">Works for any registered employee or customer.</p>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">Title <span className="font-normal text-muted">(optional)</span></label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. System maintenance tonight" className={inp} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">Message</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Write your announcement…" className={`${inp} resize-none`} />
          </div>

          {error && <div className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-600">{error}</div>}
          {result != null && <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700"><CheckCircle2 size={16} /> Sent to {result} recipient{result === 1 ? '' : 's'}.</div>}

          <button onClick={send} disabled={sending} className="btn-primary w-full sm:w-auto"><Send size={16} /> {sending ? 'Sending…' : 'Send Notification'}</button>
        </div>

        <div className="card card-pad h-fit">
          <div className="flex items-center gap-2 text-brand-600"><Megaphone size={18} /><h3 className="text-sm font-bold text-ink">Preview</h3></div>
          <div className="mt-3 rounded-xl border border-slate-200 p-3">
            <p className="text-sm font-semibold text-ink">{title || 'Announcement'}</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-slate-600">{body || 'Your message will appear here…'}</p>
          </div>
          <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-xs text-muted">
            <p>📣 Recipients: <span className="font-semibold text-ink">{count != null ? `${count} ${audience === 'all_customers' ? 'customers' : 'employees'}` : audience === 'designation' ? (value || 'pick a designation') : (value || 'one person by email')}</span></p>
            <p>👥 {meta.employees} employees · {meta.customers} customers registered</p>
          </div>
        </div>
      </div>
    </>
  )
}
