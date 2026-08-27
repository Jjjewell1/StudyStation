import { useEffect, useRef, useState } from 'react'
import { sendChat, getChatConfig } from '@/api/client'
import { Icon } from './Icon'

export default function ChatPanel() {
  const [msg, setMsg] = useState('')
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState(false)
  const [configured, setConfigured] = useState(true)
  const [error, setError] = useState(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    getChatConfig()
      .then((c) => setConfigured(c.configured))
      .catch(() => setConfigured(false))
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [history, busy])

  async function submit(e) {
    e.preventDefault()
    if (!msg.trim() || busy) return
    const text = msg.trim()
    setMsg('')
    setError(null)
    const next = [...history, { role: 'user', text }]
    setHistory(next)
    setBusy(true)
    try {
      const { reply } = await sendChat(text, history)
      setHistory([...next, { role: 'assistant', text: reply }])
    } catch (err) {
      setHistory([...next, { role: 'assistant', text: 'Sorry — ' + err.message }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="glass flex flex-col rounded-3xl p-4">
      <div className="flex items-center gap-2 px-1">
        <Icon name="chat" className="h-5 w-5 text-cyan-300" />
        <span className="text-sm font-semibold">Ask StudyStation about your coursework</span>
        {!configured && (
          <span className="ml-auto rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
            Not configured
          </span>
        )}
      </div>

      {history.length > 0 && (
        <div
          ref={scrollRef}
          className="mt-3 flex max-h-72 flex-col gap-2 overflow-y-auto pr-1"
        >
          {history.map((h, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                h.role === 'user'
                  ? 'self-end bg-gradient-to-br from-indigo-500/40 to-cyan-400/20 text-white'
                  : 'self-start bg-white/5 text-white/85'
              }`}
            >
              {h.text}
            </div>
          ))}
          {busy && (
            <div className="self-start rounded-2xl bg-white/5 px-3 py-2 text-sm text-white/45">
              Thinking…
            </div>
          )}
        </div>
      )}

      {!configured && (
        <p className="mt-3 rounded-2xl bg-white/5 px-3 py-2 text-xs text-white/55">
          Set <code>GEMINI_API_KEY</code> in the API environment to enable the assistant.
        </p>
      )}

      <form onSubmit={submit} className="mt-3 flex items-center gap-2">
        <input
          type="text"
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder={configured ? "e.g. What's due before Friday?" : 'Assistant not configured yet'}
          disabled={!configured}
          className="glass-subtle flex-1 rounded-2xl px-4 py-2.5 text-sm text-white placeholder-white/40 outline-none transition-colors duration-200 focus:border-white/20 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!configured || busy}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-white shadow-lg shadow-indigo-500/25 transition-transform duration-200 hover:scale-105 active:scale-95 disabled:opacity-50"
          aria-label="Send"
        >
          <Icon name="send" className="h-5 w-5" />
        </button>
      </form>
    </div>
  )
}
