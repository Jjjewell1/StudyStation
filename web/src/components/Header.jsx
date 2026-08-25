import { Icon } from './Icon'

export default function Header() {
  const now = new Date()
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

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{greeting}, JJ</h1>
        <p className="mt-1 text-sm text-white/50">{dateStr}</p>
      </div>

      <div className="glass-subtle flex items-center gap-3 rounded-2xl px-4 py-2.5 transition-colors duration-200 focus-within:border-white/20 sm:w-72">
        <Icon name="search" className="h-5 w-5 text-white/40" />
        <input
          type="text"
          placeholder="Search assignments…"
          className="w-full bg-transparent text-sm text-white placeholder-white/40 outline-none"
        />
      </div>
    </header>
  )
}
