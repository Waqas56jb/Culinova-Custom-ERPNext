import { Routes, Route, Navigate } from 'react-router-dom'
import Shell from './components/Shell.jsx'
import Home from './pages/Home.jsx'
import Tasks from './pages/Tasks.jsx'
import Snags from './pages/Snags.jsx'
import Visits from './pages/Visits.jsx'
import Auth from './pages/Auth.jsx'
import { useAuth } from './auth/AuthContext.jsx'

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <div className="grid min-h-screen place-items-center bg-slate-200/60 text-sm text-slate-400">Loading…</div>
  if (!user) return <Auth />
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<Home />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/snags" element={<Snags />} />
        <Route path="/visits" element={<Visits />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Route>
    </Routes>
  )
}
