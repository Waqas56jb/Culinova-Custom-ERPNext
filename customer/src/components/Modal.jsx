import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }) {
  if (!open) return null
  const w = size === 'lg' ? 'max-w-2xl' : size === 'sm' ? 'max-w-md' : 'max-w-lg'
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto p-3 sm:p-6">
      <div className="fixed inset-0 bg-navy-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative z-10 my-auto flex max-h-[92vh] w-full ${w} flex-col card animate-fade-up`}>
        <div className="flex shrink-0 items-start justify-between border-b border-slate-100 p-5">
          <div><h3 className="font-display text-lg font-bold text-ink">{title}</h3>{subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}</div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-ink"><X size={20} /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/50 p-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

const inputCls = 'w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-500/15'
export function Field({ label, ...props }) { return <label className="block">{label && <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>}<input {...props} className={inputCls} /></label> }
export function TextArea({ label, rows = 4, ...props }) { return <label className="block">{label && <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>}<textarea rows={rows} {...props} className={inputCls} /></label> }
export function Select({ label, options = [], ...props }) { return <label className="block">{label && <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>}<select {...props} className={inputCls}>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select></label> }
