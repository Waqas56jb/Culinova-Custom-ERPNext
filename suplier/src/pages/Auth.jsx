import { useState } from 'react'
import { LogIn, UserPlus } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'

const inp = 'w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm outline-none focus:border-brand-400 focus:bg-white'

export default function Auth() {
  const { login, signup } = useAuth()
  const [mode, setMode] = useState('login')
  const [f, setF] = useState({ name: '', email: '', password: '' })
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const on = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const submit = async (e) => { e.preventDefault(); setErr(''); setBusy(true); try { if (mode === 'login') await login(f.email.trim(), f.password); else await signup(f.name.trim(), f.email.trim(), f.password) } catch (e) { setErr(e.message) } finally { setBusy(false) } }

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-[#071a33] via-[#0b2546] to-[#071a33] p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-gold-500 font-display text-2xl font-extrabold text-navy-900 shadow-glow">C</div>
          <div><p className="font-display text-xl font-extrabold text-white">CULINOVA</p><p className="text-xs uppercase tracking-[0.2em] text-gold-400">Supplier Portal</p></div>
        </div>
        <form onSubmit={submit} className="card card-pad space-y-3.5">
          <h2 className="font-display text-lg font-bold text-ink">{mode === 'login' ? 'Sign In' : 'Register as Supplier'}</h2>
          {mode === 'signup' && <input required value={f.name} onChange={on('name')} placeholder="Company name" className={inp} />}
          <input type="email" required value={f.email} onChange={on('email')} placeholder="Email" className={inp} />
          <input type="password" required value={f.password} onChange={on('password')} placeholder="Password" className={inp} />
          {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{err}</p>}
          <button disabled={busy} className="btn-primary w-full !py-3 disabled:opacity-60">{mode === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}{busy ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Sign Up'}</button>
          <p className="pt-1 text-center text-xs">
            {mode === 'login' ? <>New supplier? <button type="button" onClick={() => { setMode('signup'); setErr('') }} className="font-semibold text-brand-600">Create account</button></>
              : <button type="button" onClick={() => { setMode('login'); setErr('') }} className="font-semibold text-brand-600">← Back to sign in</button>}
          </p>
        </form>
      </div>
    </div>
  )
}
