import { useState } from 'react'
import { Icon } from './Icon'

export default function ChatPanel() {
  const [msg, setMsg] = useState('')
  const [sent, setSent] = useState(false)

  function submit(e) {
    e.preventDefault()
    if (!msg.trim()) return
    setSent(true)
    setMsg('')
  }

  return (
    <div className="glass rounded-3xl p-4">
      <div className="flex items-center gap-2 px-1">
        <Icon name="chat" className="h-5 w-5 text-cyan-300" />
        <span className="text-sm font-semibold">Ask StudyStation about your coursework</span>
      </div>

      {sent && (
        <p className="mt-3 rounded-2xl bg-white/5 px-3 py-2 text-xs text-white/55">
          The assistant backend isn&apos;t wired up yet — coming soon.
        </p>
      )}

      <form onSubmit={submit} className="mt-3 flex items-center gap-2">
        <input
          type="text"
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="e.g. What's due before Friday?"
          className="glass-subtle flex-1 rounded-2xl px-4 py-2.5 text-sm text-white placeholder-white/40 outline-none transition-colors duration-200 focus:border-white/20"
        />
        <button
          type="submit"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-white shadow-lg shadow-indigo-500/25 transition-transform duration-200 hover:scale-105 active:scale-95"
          aria-label="Send"
        >
          <Icon name="send" className="h-5 w-5" />
        </button>
      </form>
    </div>
  )
}
