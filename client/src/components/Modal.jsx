import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }) {
  if (!open) return null
  const w = size === 'xl' ? 'max-w-5xl' : size === 'lg' ? 'max-w-2xl' : size === 'sm' ? 'max-w-md' : 'max-w-lg'
  // Portal to body so the modal is always centered to the viewport,
  // independent of any transformed/scrolled ancestor.
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center overflow-y-auto p-0 sm:items-start sm:p-4 md:p-6"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="fixed inset-0 bg-navy-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative z-10 my-0 flex max-h-[min(92vh,100dvh)] w-full flex-col rounded-t-2xl border border-slate-200/60 bg-white shadow-card animate-fade-up sm:my-auto sm:rounded-2xl ${w}`}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:p-5">
          <div className="min-w-0">
            <h3 className="font-display text-base font-bold text-ink sm:text-lg">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-muted">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-ink" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:p-5">{children}</div>
        {footer && (
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/80 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:p-4"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

const inputCls =
  'w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-500/15'

export function Field({ label, hint, ...props }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>}
      <input {...props} className={inputCls} />
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  )
}

export function Select({ label, options = [], ...props }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>}
      <select {...props} className={inputCls}>
        {options.map((o) => {
          const val = typeof o === 'object' ? o.value : o
          const lbl = typeof o === 'object' ? o.label : o
          return <option key={val} value={val}>{lbl}</option>
        })}
      </select>
    </label>
  )
}

export function TextArea({ label, rows = 4, ...props }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>}
      <textarea rows={rows} {...props} className={inputCls} />
    </label>
  )
}

export function Row({ children }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
}
