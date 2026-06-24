import { useState } from 'react'
import { LogIn, UserPlus, KeyRound } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'

const inp = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm outline-none focus:border-brand-400 focus:bg-white'

export default function Auth() {
  const { login, signup, reset } = useAuth()
  const [mode, setMode] = useState('login')
  const [f, setF] = useState({ name: '', email: '', password: '' })
  const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const on = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setMsg(''); setBusy(true)
    try {
      if (mode === 'login') await login(f.email.trim(), f.password)
      else if (mode === 'signup') await signup(f.name.trim(), f.email.trim(), f.password)
      else { await reset(f.email.trim(), f.password); setMsg('Password updated. Please sign in.'); setMode('login') }
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen bg-slate-200/60">
      <div className="mx-auto flex min-h-screen max-w-[440px] flex-col justify-center bg-slate-50 px-6 sm:my-4 sm:min-h-[calc(100vh-2rem)] sm:rounded-[28px] sm:shadow-2xl">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-navy-900 to-brand-700 font-display text-2xl font-extrabold text-white shadow-lg">C</div>
          <div><p className="font-display text-xl font-extrabold text-ink">Culinova Technician</p><p className="text-xs uppercase tracking-[0.2em] text-brand-500">Field App</p></div>
        </div>
        <form onSubmit={submit} className="space-y-3.5">
          <h2 className="font-display text-lg font-bold text-ink">{mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Reset Password'}</h2>
          {mode === 'signup' && <input required value={f.name} onChange={on('name')} placeholder="Full name" className={inp} />}
          <input type="email" required value={f.email} onChange={on('email')} placeholder="Email" className={inp} />
          <input type="password" required value={f.password} onChange={on('password')} placeholder={mode === 'reset' ? 'New password' : 'Password'} className={inp} />
          {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{err}</p>}
          {msg && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-600">{msg}</p>}
          <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-navy-900 to-brand-700 py-3.5 text-sm font-bold text-white disabled:opacity-60">
            {mode === 'login' ? <LogIn size={16} /> : mode === 'signup' ? <UserPlus size={16} /> : <KeyRound size={16} />}
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Sign Up' : 'Reset Password'}
          </button>
          <div className="flex justify-between pt-1 text-xs">
            {mode !== 'login' ? <button type="button" onClick={() => { setMode('login'); setErr('') }} className="font-semibold text-brand-600">← Back to sign in</button>
              : <>
                <button type="button" onClick={() => { setMode('signup'); setErr('') }} className="font-semibold text-brand-600">Create account</button>
                <button type="button" onClick={() => { setMode('reset'); setErr('') }} className="font-semibold text-slate-500">Forgot password?</button>
              </>}
          </div>
        </form>
      </div>
    </div>
  )
}
