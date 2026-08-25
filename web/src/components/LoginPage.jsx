import { useState } from 'react'
import { login, setAuthToken } from '@/api/client'
import Logo from './Logo'

export default function LoginPage({ onAuthenticated }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!pin.trim()) return
    setBusy(true)
    setError(null)
    try {
      const { token } = await login(pin.trim())
      setAuthToken(token)
      onAuthenticated()
    } catch (err) {
      setError(err.message === 'incorrect pin' ? 'Incorrect PIN — try again.' : err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4">
      <div className="bg-stage">
        <div className="blob left-[-10%] top-[-15%] h-[40rem] w-[40rem] bg-indigo-600/50" />
        <div className="blob right-[-12%] top-[10%] h-[34rem] w-[34rem] bg-fuchsia-600/35" />
        <div className="blob bottom-[-20%] left-[30%] h-[36rem] w-[36rem] bg-teal-500/30" />
      </div>

      <div className="glass w-full max-w-sm rounded-3xl p-8">
        <div className="flex flex-col items-center text-center">
          <Logo className="h-16 w-16 drop-shadow-lg" />
          <h1 className="mt-4 text-2xl font-bold tracking-tight">StudyStation</h1>
          <p className="mt-1 text-sm text-white/50">Enter your PIN to continue</p>
        </div>

        <form onSubmit={submit} className="mt-8">
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="••••"
            className="glass-subtle w-full rounded-2xl px-4 py-3.5 text-center text-2xl tracking-[0.5em] text-white placeholder-white/30 outline-none transition-colors focus:border-white/25"
          />
          {error && <p className="mt-3 text-center text-sm text-red-300">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="mt-4 w-full rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-50"
          >
            {busy ? 'Unlocking…' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  )
}
