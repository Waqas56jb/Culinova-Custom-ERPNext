import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { WifiOff, RefreshCw } from 'lucide-react'
import Sidebar from './Sidebar.jsx'
import Topbar from './Topbar.jsx'
import { useData } from '../store/DataContext.jsx'

// When the backend cannot be reached the store keeps the last-known data rather than zeroing it out.
// This banner is the other half of that promise: the user is told the figures are stale instead of
// being shown a screen of confident zeros that look like real (empty) business data.
function OfflineBanner() {
  const { offline, retry } = useData()
  if (!offline) return null
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 lg:px-7">
      <WifiOff size={16} className="shrink-0 text-amber-600" />
      <span className="flex-1">
        <b>Can’t reach the server.</b> The figures below are the last data received and may be out of date — they are not zero.
      </span>
      <button onClick={retry} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 transition hover:bg-amber-100">
        <RefreshCw size={13} /> Retry
      </button>
    </div>
  )
}

export default function Layout() {
  const [open, setOpen] = useState(false)
  return (
    <div className="min-h-screen">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="lg:pl-[268px]">
        <Topbar onMenu={() => setOpen(true)} />
        <OfflineBanner />
        <main className="mx-auto max-w-[1500px] px-4 py-6 lg:px-7 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
