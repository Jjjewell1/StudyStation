import { useEffect, useState } from 'react'
import { Icon } from './Icon'

export default function Header({ search = '', onSearch }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  const greeting = (() => {
    const h = now.getHours()
    if (h < 5) return 'Burning the midnight oil'
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
  })()

  const dateStr = now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  const timeStr = now.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <header className="animate-rise flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-gradient text-2xl font-bold tracking-tight sm:text-3xl">
          {greeting}, JJ
        </h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-white/50">
          <Icon name="clock" className="h-3.5 w-3.5 text-cyan-300/70" />
          {dateStr} · {timeStr}
        </p>
      </div>

      <div className="glass-subtle flex items-center gap-3 rounded-2xl px-4 py-2.5 transition-all duration-200 focus-within:border-cyan-300/40 focus-within:shadow-[0_0_0_3px_rgba(34,211,238,0.12)] sm:w-72">
        <Icon name="search" className="h-5 w-5 shrink-0 text-white/40" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch?.(e.target.value)}
          placeholder="Search assignments…"
          className="w-full bg-transparent text-sm text-white placeholder-white/40 outline-none"
        />
        {search && (
          <button
            onClick={() => onSearch?.('')}
            aria-label="Clear search"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/10 text-white/60 transition-colors hover:bg-white/20 hover:text-white"
          >
            <Icon name="x" className="h-3 w-3" />
          </button>
        )}
      </div>
    </header>
  )
}