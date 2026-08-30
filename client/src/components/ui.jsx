import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { TrendingUp, TrendingDown, ChevronDown } from 'lucide-react'

// Elegant, accessible dropdown — portal + fixed so it never paints under page cards (z-index / overflow).
export function Menu({ label, icon: Icon, variant = 'ghost', align = 'right', children }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const [pos, setPos] = useState({ top: 0, left: 0, right: 0, minW: 190 })

  const place = () => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const pad = 8
    const minW = Math.max(220, r.width)
    const maxW = Math.min(360, window.innerWidth - pad * 2)
    const width = Math.min(minW, maxW)
    let left = align === 'right' ? r.right - width : r.left
    left = Math.max(pad, Math.min(left, window.innerWidth - width - pad))
    setPos({
      top: Math.min(r.bottom + 6, window.innerHeight - pad),
      left,
      right: window.innerWidth - r.right,
      minW: width,
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    place()
  }, [open, align])

  useEffect(() => {
    if (!open) return
    const onScroll = () => place()
    window.addEventListener('resize', onScroll)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, align])

  return (
    <div className="relative z-30">
      <button
        ref={btnRef}
        type="button"
        className={variant === 'primary' ? 'btn-primary' : 'btn-ghost'}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        {Icon && <Icon size={16} />} <span className="whitespace-nowrap">{label}</span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[200]" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="menu"
            onClick={() => setOpen(false)}
            style={{ top: pos.top, left: pos.left, minWidth: pos.minW, maxWidth: 'min(22.5rem, calc(100vw - 1rem))' }}
            className="fixed z-[201] max-h-[min(70vh,24rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg animate-fade-up"
          >
            {children}
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}

export function MenuItem({ icon: Icon, children, onClick, tone }) {
  return (
    <button type="button" role="menuitem" onClick={onClick}
      className={`flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition hover:bg-slate-100 ${tone === 'brand' ? 'text-brand-600 hover:bg-brand-50' : 'text-slate-600 hover:text-ink'}`}>
      {Icon && <Icon size={15} className={`mt-0.5 shrink-0 ${tone === 'brand' ? 'text-brand-500' : 'text-slate-400'}`} />}
      <span className="min-w-0 whitespace-normal break-words leading-snug">{children}</span>
    </button>
  )
}

const accentMap = {
  brand: 'from-brand-500 to-brand-600',
  violet: 'from-violet-500 to-indigo-600',
  gold: 'from-gold-500 to-gold-600',
  emerald: 'from-emerald-500 to-teal-600',
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="relative z-20 mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between animate-fade-up">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {children && (
        <div className="relative z-20 flex max-w-full flex-wrap items-center gap-2 sm:max-w-[min(100%,36rem)] sm:justify-end">
          {children}
        </div>
      )}
    </div>
  )
}

export function KpiCard({ label, value, delta, sub, icon: Icon, accent = 'brand' }) {
  const hasDelta = delta != null && !Number.isNaN(Number(delta))
  const up = delta >= 0
  return (
    <div className="card relative overflow-hidden animate-fade-up p-3.5 sm:p-5">
      <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${accentMap[accent]} opacity-[0.08]`} />
      <div className="flex items-start justify-between gap-2">
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${accentMap[accent]} text-white shadow-soft sm:h-11 sm:w-11`}>
          {Icon && <Icon size={18} />}
        </div>
        {hasDelta && (
          <span className={`chip ${up ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
            {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {up ? '+' : ''}{delta}%
          </span>
        )}
      </div>
      <p className="mt-3 text-xl font-extrabold tracking-tight text-ink sm:mt-4 sm:text-3xl">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-slate-500 sm:text-sm">{label}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  )
}

export function ChartCard({ title, subtitle, action, children, className = '' }) {
  return (
    <div className={`card card-pad animate-fade-up ${className}`}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-bold text-ink">{title}</h3>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

const tones = {
  green: 'bg-emerald-50 text-emerald-700',
  blue: 'bg-blue-50 text-blue-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-rose-50 text-rose-700',
  gray: 'bg-slate-100 text-slate-600',
  violet: 'bg-violet-50 text-violet-700',
}

export function Badge({ tone = 'gray', children }) {
  return <span className={`chip ${tones[tone]}`}>{children}</span>
}

// map common statuses → tone
export function statusTone(s) {
  const map = {
    Open: 'blue', Sent: 'blue', 'Under Negotiation': 'amber', Rejected: 'red',
    Replied: 'violet', Opportunity: 'amber', Converted: 'green',
    'Do Not Contact': 'gray', Ordered: 'green', Lost: 'red', Expired: 'amber',
    Won: 'green', Prospecting: 'gray', Quotation: 'blue', Negotiation: 'amber',
    Active: 'green', 'To Deliver': 'amber', 'To Bill': 'amber', 'Not Billed': 'gray',
    'Partly Delivered': 'blue', 'Partly Billed': 'blue', 'Fully Delivered': 'green',
    'Fully Billed': 'green',
    // project & task statuses
    'On Track': 'green', 'At Risk': 'amber', Delayed: 'red', Completed: 'green',
    Working: 'blue', Review: 'violet', Done: 'green', Overdue: 'red', Pending: 'amber', Approved: 'green',
    'Pending Approval': 'violet',
    // BOQ / required-item fulfilment + assignment
    'To Procure': 'gray', Procured: 'blue', Delivered: 'amber', Installed: 'green',
    Waiting: 'gray', Assigned: 'violet', 'In Progress': 'blue',
    // procurement
    Quoted: 'amber', Received: 'green', Billed: 'violet',
    Preparing: 'gray', Shipped: 'blue',
    // finance
    Paid: 'green', Unpaid: 'gray', 'Partly Paid': 'amber', Draft: 'gray',
    // site / service / hr
    Resolved: 'green', Passed: 'green', Failed: 'red', Scheduled: 'blue',
    High: 'red', Medium: 'amber', Low: 'gray',
    Present: 'green', Absent: 'red', 'On Leave': 'amber',
    'Resolution Due': 'red', Met: 'green',
  }
  return map[s] || 'gray'
}
