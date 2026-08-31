import { useEffect, useState } from 'react'
import {
  getMailMessages,
  getMailMessage,
  markMailRead,
} from '@/api/client'
import { Icon } from './Icon'

function stripEmail(text) {
  if (!text) return ''
  const m = text.match(/<([^>]+)>/)
  return (m ? m[1] : text).replace(/["]/g, '')
}

export default function MailView() {
  const [list, setList] = useState([])
  const [nextToken, setNextToken] = useState(null)
  const [open, setOpen] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load(pageToken) {
    setLoading(true)
    setError(null)
    try {
      const data = await getMailMessages('in:inbox', pageToken)
      setList((prev) => (pageToken ? [...prev, ...data.messages] : data.messages))
      setNextToken(data.nextPageToken)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function openMessage(id, unread) {
    try {
      const msg = await getMailMessage(id)
      setOpen(msg)
      if (unread) {
        await markMailRead(id, true)
        setList((prev) => prev.map((m) => (m.id === id ? { ...m, unread: false } : m)))
      }
    } catch (e) {
      setError(e.message)
    }
  }

  if (open) {
    return (
      <section className="glass animate-rise rounded-3xl p-5">
        <button
          onClick={() => setOpen(null)}
          className="mb-4 flex items-center gap-2 text-sm text-white/55 transition-colors hover:text-white"
        >
          <Icon name="back" className="h-4 w-4" /> Back to inbox
        </button>
        <h2 className="text-lg font-bold">{open.subject || '(no subject)'}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/45">
          <span className="font-medium text-white/70">{stripEmail(open.from)}</span>
          <span>{open.date}</span>
        </div>
        <div className="mt-4 whitespace-pre-wrap break-words rounded-2xl bg-white/5 p-4 text-sm leading-relaxed text-white/85">
          {open.body || open.snippet || '(empty message)'}
        </div>
      </section>
    )
  }

  return (
    <section className="glass animate-rise rounded-3xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">Mail</h2>
        <span className="text-xs text-white/45">{list.length} in inbox</span>
      </div>

      {error && <p className="mb-3 text-sm text-red-300">{error}</p>}

      {loading && list.length === 0 && (
        <div className="py-16 text-center text-sm text-white/40">Loading…</div>
      )}

      <div className="flex flex-col gap-1.5">
        {list.map((m) => (
          <button
            key={m.id}
            onClick={() => openMessage(m.id, m.unread)}
            className="glass-subtle flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all duration-200 hover:border-white/20"
          >
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${m.unread ? 'bg-cyan-300' : 'bg-white/20'}`}
            />
            <span className="w-40 shrink-0 truncate text-sm font-semibold text-white/80">
              {stripEmail(m.from) || 'Unknown'}
            </span>
            <span className={`min-w-0 flex-1 truncate text-sm ${m.unread ? 'font-semibold text-white' : 'text-white/60'}`}>
              {m.subject || '(no subject)'}
            </span>
            <span className="hidden shrink-0 text-xs text-white/40 md:block">{m.date}</span>
          </button>
        ))}
      </div>

      {nextToken && (
        <button
          onClick={() => load(nextToken)}
          disabled={loading}
          className="mt-4 w-full rounded-2xl bg-white/5 py-2.5 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </section>
  )
}
