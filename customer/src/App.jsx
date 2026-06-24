import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Projects from './pages/Projects.jsx'
import Quotations from './pages/Quotations.jsx'
import Invoices from './pages/Invoices.jsx'
import ServiceRequests from './pages/ServiceRequests.jsx'
import Chat from './pages/Chat.jsx'
import Auth from './pages/Auth.jsx'
import { useAuth } from './auth/AuthContext.jsx'

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <div className="grid min-h-screen place-items-center bg-slate-100 text-sm text-slate-400">Loading…</div>
  if (!user) return <Auth />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/quotations" element={<Quotations />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/service" element={<ServiceRequests />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}
