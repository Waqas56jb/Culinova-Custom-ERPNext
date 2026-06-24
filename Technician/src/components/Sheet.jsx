import { createPortal } from 'react-dom'

export function Sheet({ open, onClose, title, children, footer }) {
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
      <div className="fixed inset-0 bg-navy-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 max-h-[88vh] w-full max-w-[440px] overflow-y-auto rounded-t-3xl bg-white p-5 animate-fade-up sm:rounded-3xl">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200" />
        <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
        <div className="mt-3 space-y-3">{children}</div>
        {footer && <div className="mt-5 flex gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

const inputCls = 'w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm outline-none focus:border-brand-400 focus:bg-white'
export function Field({ label, ...props }) { return <label className="block">{label && <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>}<input {...props} className={inputCls} /></label> }
export function TextArea({ label, ...props }) { return <label className="block">{label && <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>}<textarea rows={3} {...props} className={inputCls} /></label> }
export function Select({ label, options = [], ...props }) { return <label className="block">{label && <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>}<select {...props} className={inputCls}>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select></label> }
