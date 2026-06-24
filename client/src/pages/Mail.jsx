import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Inbox, Star, Send, FileText, Trash2, AlertOctagon, Pencil, Search,
  Paperclip, ArrowLeft, Reply, Forward, MoreVertical, RefreshCw, Mail as MailIcon,
} from 'lucide-react'
import { useData } from '../store/DataContext.jsx'

const folders = [
  { key: 'inbox', label: 'Inbox', icon: Inbox },
  { key: 'starred', label: 'Starred', icon: Star },
  { key: 'sent', label: 'Sent', icon: Send },
  { key: 'draft', label: 'Drafts', icon: FileText },
  { key: 'spam', label: 'Spam', icon: AlertOctagon },
  { key: 'trash', label: 'Trash', icon: Trash2 },
]

const labelTone = { Customer: 'bg-brand-500/20 text-brand-300', Internal: 'bg-violet-500/20 text-violet-300' }

export default function Mail() {
  const navigate = useNavigate()
  const { emails, openCompose, toggleStar, markRead, trashEmail } = useData()
  const [folder, setFolder] = useState('inbox')
  const [open, setOpen] = useState(null)
  const [q, setQ] = useState('')

  const inFolder = (e) => (folder === 'starred' ? e.starred && e.folder !== 'trash' : e.folder === folder)
  const list = emails.filter(inFolder).filter((e) => (e.subject + e.from.name + e.preview).toLowerCase().includes(q.toLowerCase()))
  const unread = emails.filter((e) => e.folder === 'inbox' && !e.read).length
  const counts = { inbox: emails.filter((e) => e.folder === 'inbox').length, draft: emails.filter((e) => e.folder === 'draft').length, spam: emails.filter((e) => e.folder === 'spam').length }
  const current = emails.find((e) => e.id === open)
  const openMail = (e) => { setOpen(e.id); markRead(e.id) }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#071a33] via-[#0b2546] to-[#071a33] text-slate-200">
      {/* top bar */}
      <div className="flex items-center gap-4 border-b border-white/10 px-5 py-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white">
          <ArrowLeft size={17} /> Back to Panel
        </button>
        <div className="ml-1 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-glow">
            <MailIcon size={20} />
          </div>
          <div>
            <p className="font-display text-[17px] font-extrabold text-white">Mailbox</p>
            <p className="text-[10px] uppercase tracking-[0.22em] text-brand-300/70">CULINOVA · Messaging Center</p>
          </div>
        </div>
      </div>

      {/* body */}
      <div className="grid h-[calc(100vh-73px)] grid-cols-1 gap-4 p-4 lg:grid-cols-[230px_360px_1fr]">
        {/* FOLDERS */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <button onClick={() => openCompose()} className="mb-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-400 to-brand-600 py-3 text-[15px] font-semibold text-white shadow-glow transition hover:from-brand-500 hover:to-brand-700">
            <Pencil size={17} /> Compose
          </button>
          <nav className="space-y-1">
            {folders.map(({ key, label, icon: Icon }) => {
              const active = folder === key
              const badge = key === 'inbox' ? unread : key === 'draft' ? counts.draft : key === 'spam' ? counts.spam : 0
              return (
                <button key={key} onClick={() => { setFolder(key); setOpen(null) }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    active ? 'bg-brand-500/15 text-brand-300 ring-1 ring-brand-400/30' : 'text-slate-300/80 hover:bg-white/5 hover:text-white'
                  }`}>
                  <Icon size={18} className={active ? 'text-brand-300' : 'text-slate-400'} />
                  <span className="flex-1 text-left">{label}</span>
                  {badge > 0 && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${active ? 'bg-brand-500 text-white' : 'bg-white/10 text-slate-300'}`}>{badge}</span>}
                </button>
              )
            })}
          </nav>
          <div className="mt-5 border-t border-white/10 pt-4">
            <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Labels</p>
            <div className="space-y-1.5 px-1 text-sm text-slate-300/80">
              <p className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-brand-400" /> Customers</p>
              <p className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-violet-400" /> Internal</p>
              <p className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-gold-400" /> Quotations</p>
            </div>
          </div>
        </div>

        {/* LIST */}
        <div className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
          <div className="flex items-center gap-2 border-b border-white/10 p-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this mailbox…"
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-brand-400/50 focus:bg-white/10" />
            </div>
            <button className="rounded-lg border border-white/10 bg-white/5 p-2 text-slate-400 hover:text-white"><RefreshCw size={15} /></button>
          </div>
          <div className="flex items-center justify-between px-4 py-2 text-[11px] uppercase tracking-wide text-slate-500">
            <span>{folders.find((f) => f.key === folder)?.label}</span>
            <span>{list.length} messages</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {list.map((e) => {
              const person = folder === 'sent' || folder === 'draft' ? e.to : e.from
              const selected = open === e.id
              return (
                <div key={e.id} onClick={() => openMail(e)}
                  className={`flex cursor-pointer items-start gap-3 border-b border-white/5 px-4 py-3 transition ${selected ? 'bg-brand-500/10' : 'hover:bg-white/5'} ${!e.read ? 'bg-white/[0.03]' : ''}`}>
                  <button onClick={(ev) => { ev.stopPropagation(); toggleStar(e.id) }} className="mt-0.5">
                    <Star size={16} className={e.starred ? 'fill-gold-400 text-gold-400' : 'text-slate-600 hover:text-slate-400'} />
                  </button>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-[11px] font-bold text-white">
                    {person.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`truncate text-sm ${!e.read ? 'font-bold text-white' : 'font-medium text-slate-300'}`}>
                        {folder === 'sent' || folder === 'draft' ? `To: ${e.to.name}` : e.from.name}
                      </p>
                      {e.label && <span className={`hidden rounded px-1.5 py-0.5 text-[10px] font-semibold sm:inline ${labelTone[e.label] || ''}`}>{e.label}</span>}
                      <span className="ml-auto shrink-0 text-[11px] text-slate-500">{e.time}</span>
                    </div>
                    <p className={`truncate text-sm ${!e.read ? 'font-semibold text-slate-100' : 'text-slate-300/90'}`}>{e.subject}</p>
                    <p className="truncate text-xs text-slate-500">{e.preview}</p>
                  </div>
                  {e.hasAttachment && <Paperclip size={13} className="mt-1 shrink-0 text-slate-500" />}
                </div>
              )
            })}
            {list.length === 0 && (
              <div className="grid place-items-center py-24 text-center text-sm text-slate-500">
                <Inbox size={42} className="mb-3 text-slate-600" /> No messages here
              </div>
            )}
          </div>
        </div>

        {/* READER */}
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
          {!current ? (
            <div className="grid h-full place-items-center text-center text-slate-500">
              <div>
                <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-white/5"><MailIcon size={30} className="text-slate-600" /></div>
                <p className="text-sm">Select a message to read</p>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-1 border-b border-white/10 p-3">
                <button onClick={() => setOpen(null)} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"><ArrowLeft size={18} /></button>
                <button onClick={() => { trashEmail(current.id); setOpen(null) }} className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/15 hover:text-rose-300"><Trash2 size={17} /></button>
                <button onClick={() => toggleStar(current.id)} className="rounded-lg p-2 text-slate-400 hover:bg-white/10"><Star size={17} className={current.starred ? 'fill-gold-400 text-gold-400' : ''} /></button>
                <button className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-white/10"><MoreVertical size={17} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 sm:p-8">
                <h2 className="font-display text-xl font-bold text-white">{current.subject}</h2>
                <div className="mt-4 flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white">
                    {current.from.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">{current.from.name} <span className="font-normal text-slate-400">&lt;{current.from.email}&gt;</span></p>
                    <p className="text-xs text-slate-500">to {current.to.name} · {current.time}</p>
                  </div>
                </div>
                <div className="mt-6 whitespace-pre-line text-sm leading-relaxed text-slate-300">{current.body}</div>
                {current.hasAttachment && (
                  <div className="mt-6 inline-flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-rose-500/15 text-rose-300"><FileText size={20} /></span>
                    <div><p className="text-sm font-semibold text-white">Quotation.pdf</p><p className="text-xs text-slate-500">PDF · 248 KB</p></div>
                  </div>
                )}
                <div className="mt-7 flex gap-2">
                  <button onClick={() => openCompose({ to: current.from.email, toName: current.from.name, subject: `Re: ${current.subject}`, body: `\n\n———\n${current.body}` })}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"><Reply size={15} /> Reply</button>
                  <button onClick={() => openCompose({ subject: `Fwd: ${current.subject}`, body: current.body })}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10"><Forward size={15} /> Forward</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
