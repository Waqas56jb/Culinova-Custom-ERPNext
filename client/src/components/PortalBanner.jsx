export default function PortalBanner({ who, role }) {
  return (
    <div className="mb-5 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-navy-800 to-brand-700 px-5 py-3.5 text-white shadow-card">
      <div className="grid h-11 w-11 place-items-center rounded-xl bg-white/15 text-sm font-extrabold">{who.slice(0, 2).toUpperCase()}</div>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold">{who}</p>
        <p className="text-[11px] text-brand-200/90">{role} · external portal</p>
      </div>
      <span className="ml-auto hidden rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold sm:inline">🔗 Connected to CULINOVA ERP</span>
    </div>
  )
}
