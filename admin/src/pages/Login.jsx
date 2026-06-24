import { useState } from 'react'
import { LogIn, ShieldCheck } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'

export default function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => { e.preventDefault(); setErr(''); setBusy(true); try { await login(email.trim(), password) } catch (e) { setErr(e.message) } finally { setBusy(false) } }

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-[#071a33] via-[#0b2546] to-[#071a33] p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-gold-500 font-display text-2xl font-extrabold text-navy-900 shadow-glow">C</div>
          <div><p className="font-display text-xl font-extrabold text-white">CULINOVA</p><p className="text-xs uppercase tracking-[0.2em] text-gold-400">Admin Console</p></div>
        </div>
        <form onSubmit={submit} className="card card-pad space-y-4">
          <div><label className="mb-1.5 block text-xs font-semibold text-slate-600">Email</label><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@gmail.com" className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm outline-none focus:border-brand-400 focus:bg-white" /></div>
          <div><label className="mb-1.5 block text-xs font-semibold text-slate-600">Password</label><input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm outline-none focus:border-brand-400 focus:bg-white" /></div>
          {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{err}</p>}
          <button disabled={busy} className="btn-primary w-full !py-3 disabled:opacity-60"><LogIn size={16} /> {busy ? 'Signing in…' : 'Sign In'}</button>
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted"><ShieldCheck size={13} className="text-brand-500" /> Administrators only.</p>
        </form>
      </div>
    </div>
  )
}
