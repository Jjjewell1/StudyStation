import { useEffect, useState } from 'react'
import GoogleConnect, { useGoogleStatus } from './GoogleConnect'
import { Icon } from './Icon'
import { getSyncStatus, triggerSync } from '@/api/client'

const TABS = [
  { id: 'sync', label: 'Sync', icon: 'calendarCheck' },
  { id: 'google', label: 'Google', icon: 'contacts' },
  { id: 'account', label: 'Account', icon: 'tasks' },
]

function GoogleGuide() {
  return (
    <div className="space-y-4 text-sm text-white/70">
      <p className="text-white/50">
        Connect your Google account to bring Calendar, Contacts, Tasks, and Gmail into
        StudyStation. This takes a few one-time steps in the Google Cloud Console.
      </p>

      <ol className="list-decimal space-y-2 pl-5">
        <li>
          Go to the{' '}
          <a
            href="https://console.cloud.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-300 underline hover:text-cyan-200"
          >
            Google Cloud Console
          </a>{' '}
          and create a project named <span className="font-semibold">StudyStation</span>.
        </li>
        <li>
          Enable these APIs (APIs &amp; Services → Library):{' '}
          <span className="text-white/90">Google Calendar API</span>,{' '}
          <span className="text-white/90">People API</span>,{' '}
          <span className="text-white/90">Tasks API</span>,{' '}
          <span className="text-white/90">Gmail API</span>.
        </li>
        <li>
          Set up the{' '}
          <a
            href="https://console.cloud.google.com/apis/credentials/consent"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-300 underline hover:text-cyan-200"
          >
            OAuth consent screen
          </a>{' '}
          (External type), add your own email as a test user, and add these scopes:
          <ul className="ml-5 mt-1 list-disc space-y-0.5 text-white/50">
            <li>https://www.googleapis.com/auth/calendar</li>
            <li>https://www.googleapis.com/auth/contacts</li>
            <li>https://www.googleapis.com/auth/tasks</li>
            <li>https://www.googleapis.com/auth/gmail.modify</li>
          </ul>
        </li>
        <li>
          Create an{' '}
          <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-300 underline hover:text-cyan-200"
          >
            OAuth client ID
          </a>{' '}
          of type <span className="font-semibold">Web application</span> and add this
          redirect URI:
        </li>
      </ol>

      <div className="glass-subtle flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
        <code className="break-all text-xs text-white/70">
          https://studystation.jewellcore.com/api/google/callback
        </code>
        <button
          onClick={() => navigator.clipboard?.writeText('https://studystation.jewellcore.com/api/google/callback')}
          className="shrink-0 rounded-xl bg-white/10 px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/20"
        >
          Copy
        </button>
      </div>

      <p>
        Finally, paste the <span className="font-semibold">Client ID</span> and{' '}
        <span className="font-semibold">Client Secret</span> into your deployment's{' '}
        <code className="text-white/70">GOOGLE_CLIENT_ID</code> and{' '}
        <code className="text-white/70">GOOGLE_CLIENT_SECRET</code> environment variables,
        then click <span className="font-semibold">Connect</span> below.
      </p>
    </div>
  )
}

export default function SettingsView({ onLogout }) {
  const [tab, setTab] = useState('sync')
  const google = useGoogleStatus()
  const [syncInfo, setSyncInfo] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)

  function refreshSyncStatus() {
    getSyncStatus()
      .then((s) => setSyncInfo(s.last))
      .catch(() => {})
  }

  useEffect(() => {
    refreshSyncStatus()
  }, [])

  async function syncNow() {
    if (syncing) return
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await triggerSync()
      setSyncResult(res)
    } catch (e) {
      setSyncResult({ error: e.message })
    } finally {
      setSyncing(false)
      refreshSyncStatus()
    }
  }

  return (
    <section className="glass rounded-3xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">Settings</h2>
      </div>

      <div className="mb-5 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 ${
              tab === t.id ? 'bg-white/15 text-white' : 'bg-white/5 text-white/55 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Icon name={t.icon} className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sync' && (
        <div className="space-y-5">
          <div className="glass-subtle flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-white">Canvas sync</div>
              <div className="mt-0.5 text-xs text-white/50">
                Pulls the latest courses, assignments, and due dates from Canvas.
              </div>
            </div>
            <button
              onClick={syncNow}
              disabled={syncing}
              className="flex shrink-0 items-center gap-2 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-50"
            >
              <Icon name="calendarCheck" className="h-4 w-4" />
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          </div>

          {syncResult && (
            <div className="glass-subtle rounded-2xl p-4 text-sm">
              {syncResult.error ? (
                <p className="text-red-300">Sync failed: {syncResult.error}</p>
              ) : syncResult.exit_code === 0 ? (
                <p className="text-emerald-300">Sync completed successfully.</p>
              ) : (
                <p className="text-amber-300">
                  Sync exited with code {syncResult.exit_code}.{' '}
                  {syncResult.exit_code === 2
                    ? 'Canvas session expired — re-capture it (see below).'
                    : 'Check the logs for details.'}
                </p>
              )}
              {syncResult.stdout && (
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-white/50">
                  {syncResult.stdout}
                </pre>
              )}
            </div>
          )}

          <div className="glass-subtle rounded-2xl p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
              Last sync
            </div>
            {syncInfo ? (
              <div className="text-sm text-white/70">
                <span className="font-semibold text-white">
                  {syncInfo.status === 'success' ? 'Success' : syncInfo.status}
                </span>
                {syncInfo.finishedAt && (
                  <span className="text-white/45">
                    {' '}
                    · {new Date(syncInfo.finishedAt).toLocaleString()}
                  </span>
                )}
                {syncInfo.counts && (
                  <span className="text-white/45">
                    {' '}
                    · {syncInfo.counts.courses} courses, {syncInfo.counts.assignments} assignments
                  </span>
                )}
              </div>
            ) : (
              <div className="text-sm text-white/45">No sync has run yet.</div>
            )}
          </div>

          <p className="text-xs text-white/40">
            Note: the sync normally runs nightly (and on every redeploy). If your Canvas
            session has expired, a manual sync will fail until you re-capture it by running{' '}
            <code>capture_session.py</code> locally and updating{' '}
            <code>CANVAS_SESSION_JSON</code>.
          </p>
        </div>
      )}

      {tab === 'google' && (
        <div className="space-y-6">
          <GoogleConnect status={google} onChanged={google.refresh} />
          <div className="border-t border-white/10 pt-5">
            <h3 className="mb-3 text-sm font-semibold text-white/80">
              Connection guide
            </h3>
            <GoogleGuide />
          </div>
        </div>
      )}

      {tab === 'account' && (
        <div className="space-y-3 text-sm text-white/70">
          <div className="glass-subtle flex items-center gap-3 rounded-2xl p-4">
            <Icon name="contacts" className="h-5 w-5 text-white/50" />
            <div>
              <div className="font-semibold text-white">StudyStation</div>
              <div className="text-xs text-white/45">Your coursework, one station.</div>
            </div>
          </div>
          <p className="text-xs text-white/45">
            PIN access is controlled by the <code>ACCESS_PIN</code> environment variable
            on the API service. Set it (and redeploy) to gate the dashboard behind a PIN.
          </p>
          {onLogout && (
            <button
              onClick={onLogout}
              className="mt-4 w-full rounded-2xl bg-white/5 py-2.5 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              Log out
            </button>
          )}
        </div>
      )}
    </section>
  )
}
