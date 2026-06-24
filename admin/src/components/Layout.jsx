import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import Topbar from './Topbar.jsx'

export default function Layout() {
  const [open, setOpen] = useState(false)
  return (
    <div className="min-h-screen">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="lg:pl-[272px]">
        <Topbar onMenu={() => setOpen(true)} />
        <main className="mx-auto max-w-[1500px] px-4 py-6 lg:px-7 lg:py-8"><Outlet /></main>
      </div>
    </div>
  )
}
