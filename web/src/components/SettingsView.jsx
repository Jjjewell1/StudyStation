import { useState } from 'react'
import GoogleConnect, { useGoogleStatus } from './GoogleConnect'
import { Icon } from './Icon'

const TABS = [
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
  const [tab, setTab] = useState('google')
  const google = useGoogleStatus()

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
