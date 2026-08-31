import { useEffect, useState } from 'react'
import GoogleConnect, { useGoogleStatus } from './GoogleConnect'
import { Icon } from './Icon'
import {
  getSyncStatus,
  triggerSync,
  dropCourse,
  restoreCourse,
  getDroppedCourses,
  getCanvasSession,
  saveCanvasSession,
  clearCanvasSession,
} from '@/api/client'

const TABS = [
  { id: 'sync', label: 'Sync', icon: 'calendarCheck' },
  { id: 'classes', label: 'Classes', icon: 'courses' },
  { id: 'google', label: 'Google', icon: 'contacts' },
  { id: 'account', label: 'Account', icon: 'tasks' },
]

function GoogleGuide() {
  return (
    <div className="space-y-4 text-sm text-white/70">
      <p className="text-white/50">
        Connect your Google account to bring Calendar, Contacts, Tasks, and Gmail into
        StudyStation. Just sign in with your Google account — no setup needed on your end.
      </p>

      <ol className="list-decimal space-y-2 pl-5">
        <li>
          Click <span className="font-semibold">Connect</span> above.
        </li>
        <li>
          Sign in with your Google account (the email you want to connect).
        </li>
        <li>
          Approve the permissions (calendar, contacts, tasks, and Gmail).
        </li>
      </ol>

      <p className="text-xs text-white/45">
        This is managed by the app owner. The OAuth client and these scopes are configured
        once in Google Cloud:
      </p>
      <ul className="ml-5 list-disc space-y-0.5 text-xs text-white/45">
        <li>https://www.googleapis.com/auth/calendar</li>
        <li>https://www.googleapis.com/auth/contacts</li>
        <li>https://www.googleapis.com/auth/tasks</li>
        <li>https://www.googleapis.com/auth/gmail.modify</li>
      </ul>
    </div>
  )
}

export default function SettingsView({ onLogout, courses, onDataChanged }) {
  const [tab, setTab] = useState('sync')
  const google = useGoogleStatus()
  const [syncInfo, setSyncInfo] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [dropped, setDropped] = useState(null) // { dropped: [], log: [] }
  const [canvasSession, setCanvasSession] = useState(null) // { set, cookies }
  const [sessionOpen, setSessionOpen] = useState(false)
  const [sessionText, setSessionText] = useState('')
  const [sessionBusy, setSessionBusy] = useState(false)
  const [sessionMsg, setSessionMsg] = useState(null)

  function refreshCanvasSession() {
    getCanvasSession()
      .then(setCanvasSession)
      .catch(() => setCanvasSession({ set: false, cookies: 0 }))
  }

  function refreshSyncStatus() {
    getSyncStatus()
      .then((s) => setSyncInfo(s.last))
      .catch(() => {})
  }

  function refreshDropped() {
    getDroppedCourses()
      .then(setDropped)
      .catch(() => {})
  }

  useEffect(() => {
    refreshSyncStatus()
    refreshDropped()
    refreshCanvasSession()
  }, [])

  async function saveSession() {
    setSessionBusy(true)
    setSessionMsg(null)
    try {
      const res = await saveCanvasSession(sessionText.trim())
      setSessionMsg({ ok: true, text: `Saved on server (${res.cookies} cookies). Click "Sync now" to verify.` })
      setSessionText('')
      setSessionOpen(false)
      refreshCanvasSession()
    } catch (e) {
      setSessionMsg({ ok: false, text: e.message })
    } finally {
      setSessionBusy(false)
    }
  }

  async function clearSession() {
    setSessionBusy(true)
    setSessionMsg(null)
    try {
      await clearCanvasSession()
      setSessionMsg({ ok: true, text: 'Cleared - the sync reverts to the server-configured session.' })
      refreshCanvasSession()
    } catch (e) {
      setSessionMsg({ ok: false, text: e.message })
    } finally {
      setSessionBusy(false)
    }
  }

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

  async function doDrop(id) {
    await dropCourse(id)
    refreshDropped()
    onDataChanged?.()
  }

  async function doRestore(id) {
    await restoreCourse(id)
    refreshDropped()
    onDataChanged?.()
  }

  const droppedCourses = dropped?.dropped ?? []
  const dropLog = dropped?.log ?? []

  return (
    <section className="glass rounded-3xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">Settings</h2>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
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
                    ? 'Canvas session expired — re-capture it with the "Re-capture session" button below.'
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

          <div className="glass-subtle rounded-2xl p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
              Canvas session
            </div>
            <p className="text-sm text-white/70">
              {canvasSession?.set
                ? `A session you saved is active (${canvasSession.cookies} cookies). It is used ahead of the server-configured one.`
                : 'Using the server-configured Canvas session.'}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => { setSessionOpen(!sessionOpen); setSessionMsg(null) }}
                className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-white/15"
              >
                <Icon name="refresh" className="h-4 w-4" />
                {canvasSession?.set ? 'Replace session' : 'Re-capture session'}
              </button>
              {canvasSession?.set && (
                <button
                  onClick={clearSession}
                  disabled={sessionBusy}
                  className="flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-2 text-sm font-semibold text-white/55 transition-all hover:bg-white/10 disabled:opacity-50"
                >
                  <Icon name="trash" className="h-4 w-4" />
                  Clear
                </button>
              )}
            </div>

            {sessionOpen && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-white/45">
                  1. On your PC, run{' '}
                  <code className="rounded bg-black/30 px-1 py-0.5 text-[11px]">python capture_session.py</code>{' '}
                  from the StudyStation repo and sign in to Canvas in the browser that opens.
                </p>
                <p className="text-xs text-white/45">
                  2. Paste the contents of the generated{' '}
                  <code className="rounded bg-black/30 px-1 py-0.5 text-[11px]">canvas_session.json</code>{' '}
                  below and save. No redeploy needed.
                </p>
                <textarea
                  value={sessionText}
                  onChange={(e) => setSessionText(e.target.value)}
                  rows={4}
                  placeholder='{"cookies": [...], "origins": []}'
                  className="w-full rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-xs text-white/80 outline-none focus:border-cyan-400/50"
                />
                <div className="flex gap-2">
                  <button
                    onClick={saveSession}
                    disabled={sessionBusy || !sessionText.trim()}
                    className="flex items-center gap-2 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                  >
                    {sessionBusy ? 'Saving…' : 'Save session on server'}
                  </button>
                </div>
              </div>
            )}

            {sessionMsg && (
              <p className={`mt-3 text-xs ${sessionMsg.ok ? 'text-emerald-300' : 'text-red-300'}`}>
                {sessionMsg.text}
              </p>
            )}

            <p className="mt-3 text-xs text-white/40">
              The sync normally runs nightly (and on every redeploy). If your Canvas session has
              expired, a manual sync fails with exit code 2 — re-capture it above.
            </p>
          </div>
        </div>
      )}

      {tab === 'classes' && (
        <div className="space-y-5">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
              Active classes
            </div>
            <div className="flex flex-col gap-2">
              {courses.map((c) => (
                <div
                  key={c.id}
                  className="glass-subtle flex items-center gap-3 rounded-2xl p-3"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500/30 to-cyan-400/20 text-cyan-300">
                    <Icon name="book" className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white">{c.short}</div>
                    <div className="truncate text-xs text-white/45">{c.name}</div>
                  </div>
                  <button
                    onClick={() => doDrop(c.id)}
                    className="shrink-0 rounded-xl bg-white/5 px-3 py-1.5 text-xs text-white/60 transition-colors hover:bg-red-500/15 hover:text-red-300"
                  >
                    Drop
                  </button>
                </div>
              ))}
              {courses.length === 0 && (
                <div className="py-4 text-center text-sm text-white/45">No active classes.</div>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
              Dropped classes
            </div>
            <div className="flex flex-col gap-2">
              {droppedCourses.map((c) => (
                <div
                  key={c.id}
                  className="glass-subtle flex items-center gap-3 rounded-2xl p-3 opacity-80"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10 text-white/50">
                    <Icon name="book" className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white/70">{c.short}</div>
                    <div className="truncate text-xs text-white/40">{c.name}</div>
                  </div>
                  <button
                    onClick={() => doRestore(c.id)}
                    className="shrink-0 rounded-xl bg-white/5 px-3 py-1.5 text-xs text-white/60 transition-colors hover:bg-emerald-500/15 hover:text-emerald-300"
                  >
                    Restore
                  </button>
                </div>
              ))}
              {droppedCourses.length === 0 && (
                <div className="py-4 text-center text-sm text-white/45">No dropped classes.</div>
              )}
            </div>
          </div>

          {dropLog.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
                Drop history
              </div>
              <div className="flex flex-col gap-1.5">
                {dropLog.map((l, i) => (
                  <div
                    key={`${l.courseId}-${l.droppedAt}-${i}`}
                    className="glass-subtle flex items-center gap-3 rounded-xl px-3 py-2 text-xs"
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${l.dropped ? 'bg-red-400' : 'bg-emerald-400'}`}
                    />
                    <span className="min-w-0 flex-1 truncate text-white/70">{l.name}</span>
                    <span className="shrink-0 text-white/40">
                      {l.dropped
                        ? `dropped ${new Date(l.droppedAt).toLocaleDateString()}`
                        : `restored ${new Date(l.restoredAt).toLocaleDateString()}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'google' && (
        <div className="space-y-6">
          <GoogleConnect status={google} onChanged={google.refresh} />
          <div className="border-t border-white/10 pt-5">
            <h3 className="mb-3 text-sm font-semibold text-white/80">
              How to connect
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
