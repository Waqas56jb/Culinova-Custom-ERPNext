import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import RFQs from './pages/RFQs.jsx'
import Orders from './pages/Orders.jsx'
import Deliveries from './pages/Deliveries.jsx'
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
        <Route path="/rfqs" element={<RFQs />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/deliveries" element={<Deliveries />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}
