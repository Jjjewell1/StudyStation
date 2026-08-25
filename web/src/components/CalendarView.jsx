import { useEffect, useMemo, useState } from 'react'
import { getCalendarEvents, getGoogleStatus } from '@/api/client'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export default function CalendarView({ assignments }) {
  const [cursor, setCursor] = useState(() => startOfDay(new Date()))
  const [selected, setSelected] = useState(null)
  const [gEvents, setGEvents] = useState([])
  const [gConnected, setGConnected] = useState(false)

  // Pull Google Calendar events for the visible month once connected.
  useEffect(() => {
    let cancelled = false
    getGoogleStatus()
      .then((s) => {
        if (!cancelled) setGConnected(s.connected)
        if (!s.connected) return
        const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1).toISOString()
        const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1).toISOString()
        return getCalendarEvents(start, end)
      })
      .then((events) => {
        if (!cancelled && events) setGEvents(events)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [cursor])

  const monthLabel = cursor.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })

  // Assignments grouped by local calendar day.
  const byDay = useMemo(() => {
    const map = new Map()
    for (const a of assignments) {
      if (!a.dueAt) continue
      const d = startOfDay(new Date(a.dueAt))
      const key = d.toDateString()
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(a)
    }
    // Merge Google events into the same per-day map (distinct key namespace).
    for (const e of gEvents) {
      const iso = e.allDay ? e.start : e.start
      const d = startOfDay(new Date(iso))
      const key = d.toDateString()
      if (!map.has(key)) map.set(key, [])
      map.get(key).push({ _google: true, ...e, id: `g-${e.id}` })
    }
    return map
  }, [assignments, gEvents])

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const startPad = first.getDay()
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
    const list = []
    for (let i = 0; i < startPad; i++) list.push(null)
    for (let d = 1; d <= daysInMonth; d++) {
      list.push(new Date(cursor.getFullYear(), cursor.getMonth(), d))
    }
    return list
  }, [cursor])

  const today = startOfDay(new Date()).toDateString()

  const selectedAssignments = useMemo(() => {
    if (!selected) return []
    return byDay.get(selected.toDateString()) ?? []
  }, [selected, byDay])

  function shift(months) {
    setSelected(null)
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + months, 1))
  }

  return (
    <section className="glass rounded-3xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">Calendar</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => shift(-1)}
            className="grid h-8 w-8 place-items-center rounded-xl bg-white/5 text-white/60 transition-colors hover:bg-white/15 hover:text-white"
            aria-label="Previous month"
          >
            ‹
          </button>
          <span className="w-36 text-center text-sm font-semibold">{monthLabel}</span>
          <button
            onClick={() => shift(1)}
            className="grid h-8 w-8 place-items-center rounded-xl bg-white/5 text-white/60 transition-colors hover:bg-white/15 hover:text-white"
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1 text-xs font-semibold text-white/40">
            {w}
          </div>
        ))}

        {cells.map((date, i) => {
          if (!date) return <div key={`pad-${i}`} />
          const key = date.toDateString()
          const dayItems = byDay.get(key) ?? []
          const isToday = key === today
          const isSelected = selected && selected.toDateString() === key

          return (
            <button
              key={key}
              onClick={() => setSelected(isSelected ? null : date)}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-xl transition-all duration-150 ${
                isSelected
                  ? 'bg-white/20 text-white shadow-inner'
                  : isToday
                    ? 'bg-cyan-400/20 text-white ring-1 ring-cyan-300/40'
                    : 'text-white/70 hover:bg-white/10'
              }`}
            >
              <span className="text-sm">{date.getDate()}</span>
              {dayItems.length > 0 && (
                <span
                  className={`mt-0.5 h-1.5 w-1.5 rounded-full ${
                    dayItems.some((a) => a._google)
                      ? 'bg-amber-300'
                      : dayItems.some((a) => a.status !== 'submitted' && new Date(a.dueAt) < new Date())
                        ? 'bg-red-400'
                        : 'bg-cyan-300'
                  }`}
                />
              )}
            </button>
          )
        })}
      </div>

      {selected && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <h3 className="mb-2 px-1 text-sm font-semibold text-white/70">
            {selected.toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </h3>
          {selectedAssignments.length === 0 ? (
            <p className="px-1 text-sm text-white/45">Nothing due.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {selectedAssignments.map((a) =>
                a._google ? (
                  <div
                    key={a.id}
                    className="glass-subtle flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-amber-300" />
                    <span className="min-w-0 flex-1 truncate font-medium text-white">
                      {a.title}
                    </span>
                    {!a.allDay && (
                      <span className="shrink-0 text-xs text-white/45">
                        {new Date(a.start).toLocaleTimeString(undefined, {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>
                ) : (
                  <a
                    key={a.id}
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="glass-subtle flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm transition-all duration-200 hover:border-white/20"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-cyan-300" />
                    <span className="truncate font-medium text-white">{a.name}</span>
                    <span className="ml-auto shrink-0 text-xs text-white/45">
                      {new Date(a.dueAt).toLocaleTimeString(undefined, {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  </a>
                ),
              )}
            </div>
          )}
        </div>
      )}
      <div className="mt-4 flex items-center gap-4 border-t border-white/10 px-1 pt-3 text-xs text-white/45">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-cyan-300" /> Assignments
        </span>
        {gConnected && (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-300" /> Google Calendar
          </span>
        )}
      </div>
    </section>
  )
}
