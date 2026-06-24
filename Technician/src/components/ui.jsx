const tones = { green: 'bg-emerald-50 text-emerald-700', blue: 'bg-blue-50 text-blue-700', amber: 'bg-amber-50 text-amber-700', red: 'bg-rose-50 text-rose-700', gray: 'bg-slate-100 text-slate-600', violet: 'bg-violet-50 text-violet-700' }
export function Badge({ tone = 'gray', children }) { return <span className={`chip ${tones[tone]}`}>{children}</span> }

export function statusTone(s) {
  const map = {
    Open: 'gray', 'In Progress': 'blue', Installed: 'green', Done: 'green', Completed: 'green',
    Scheduled: 'blue', Resolved: 'green', High: 'red', Medium: 'amber', Low: 'gray',
  }
  return map[s] || 'gray'
}
