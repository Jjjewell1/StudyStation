import { useEffect, useState } from 'react'
import { getGoogleStatus, googleAuthUrl, disconnectGoogle } from '@/api/client'
import { Icon } from './Icon'

// Shared Google connection status hook.
export function useGoogleStatus() {
  const [status, setStatus] = useState({ connected: false, configured: true, email: null })
  const [loading, setLoading] = useState(true)

  function refresh() {
    setLoading(true)
    getGoogleStatus()
      .then(setStatus)
      .catch(() => setStatus({ connected: false, configured: false, email: null }))
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [])
  return { status, loading, refresh }
}

export default function GoogleConnect({ status, onChanged, compact = false }) {
  if (status.loading) return null

  if (!status.status.configured) {
    return (
      <div className="glass rounded-3xl border-amber-400/30 p-4 text-sm text-amber-200">
        Google isn&apos;t configured yet — set <code>GOOGLE_CLIENT_ID</code> and{' '}
        <code>GOOGLE_CLIENT_SECRET</code> in the API environment.
      </div>
    )
  }

  if (!status.status.connected) {
    return (
      <div className="glass flex items-center justify-between gap-4 rounded-3xl p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-white/70">
            <Icon name="contacts" className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-semibold">Connect Google</div>
            <div className="text-xs text-white/45">
              Calendar · Contacts · Tasks · Gmail
            </div>
          </div>
        </div>
        <a
          href={googleAuthUrl()}
          className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20"
        >
          Connect
        </a>
      </div>
    )
  }

  return (
    <div className={`glass flex items-center justify-between gap-4 rounded-3xl ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-400/15 text-emerald-300">
          <Icon name="calendarCheck" className="h-5 w-5" />
        </span>
        <div>
          <div className="text-sm font-semibold">Google connected</div>
          {status.status.email && (
            <div className="text-xs text-white/45">{status.status.email}</div>
          )}
        </div>
      </div>
      <button
        onClick={async () => {
          await disconnectGoogle()
          onChanged?.()
        }}
        className="rounded-xl px-3 py-1.5 text-xs text-white/45 transition-colors hover:bg-white/10 hover:text-white"
      >
        Disconnect
      </button>
    </div>
  )
}
