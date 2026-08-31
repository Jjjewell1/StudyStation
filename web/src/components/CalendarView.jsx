import { useEffect, useMemo, useState } from 'react'
import { getCalendarEvents, getGoogleStatus } from '@/api/client'
import EmptyState from './EmptyState'
import { Icon } from './Icon'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

// Parse ISO into a *local* date, guarding against date-only strings being
// treated as UTC midnight (which shifts a day in negative offsets).
function parseDay(iso) {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso))
  if (m) return new Date(+m[1], +m[2] - 1, +m[3])
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

function fmtTime(d) {
  return new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function isSameDay(a, b) {
  return (
    !!a && !!b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function relativeDayLabel(d, today) {
  if (isSameDay(d, today)) return 'Today'
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (isSameDay(d, tomorrow)) return 'Tomorrow'
  if (isSameDay(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

const MAX_CHIPS = 3

export default function CalendarView({ assignments }) {
  const [cursor, setCursor] = useState(() => {
    const t = startOfDay(new Date())
    return new Date(t.getFullYear(), t.getMonth(), 1)
  })
  const [selected, setSelected] = useState(() => startOfDay(new Date()))
  const [gEvents, setGEvents] = useState([])
  const [gConnected, setGConnected] = useState(false)
  const [loadingEvents, setLoadingEvents] = useState(false)

  // Pull Google Calendar events for the visible month once connected.
  useEffect(() => {
    let cancelled = false
    setLoadingEvents(true)
    getGoogleStatus()
      .then((s) => {
        if (cancelled) return
        setGConnected(s.connected)
        if (!s.connected) return []
        const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1).toISOString()
        const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1).toISOString()
        return getCalendarEvents(start, end)
      })
      .then((events) => {
        if (!cancelled && events) setGEvents(events)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingEvents(false)
      })
    return () => {
      cancelled = true
    }
  }, [cursor])

  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const today = startOfDay(new Date())

  // Assignments grouped by local calendar day, merged with Google events.
  const byDay = useMemo(() => {
    const map = new Map()
    for (const a of assignments || []) {
      const d = a.dueAt ? parseDay(a.dueAt) : null
      if (!d) continue
      const key = d.toDateString()
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(a)
    }
    for (const e of gEvents ?? []) {
      const d = parseDay(e.start)
      if (!d) continue
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

  const selectedItems = useMemo(() => {
    const items = selected ? (byDay.get(selected.toDateString()) ?? []) : []
    const weight = (it) => (it._google ? (it.allDay ? 1 : 0) : 2)
    return items.sort(
      (a, b) =>
        weight(a) - weight(b) ||
        String(a.start || a.dueAt || '').localeCompare(String(b.start || b.dueAt || '')),
    )
  }, [selected, byDay])

  const monthCounts = useMemo(() => {
    let events = 0
    let work = 0
    for (const items of byDay.values()) {
      for (const it of items) {
        if (it._google) events += 1
        else work += 1
      }
    }
    return { events, work }
  }, [byDay])

  function shift(months) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + months, 1))
  }

  function shiftDay(dir) {
    setSelected((d) => {
      const n = new Date(d)
      n.setDate(n.getDate() + dir)
      if (n.getMonth() !== cursor.getMonth()) setCursor(new Date(n.getFullYear(), n.getMonth(), 1))
      return n
    })
  }

  function goToday() {
    const t = startOfDay(new Date())
    setSelected(t)
    setCursor(new Date(t.getFullYear(), t.getMonth(), 1))
  }

  return (
    <section className="animate-rise flex flex-col gap-6 xl:flex-row xl:items-start">
      {/* Month grid */}
      <div className="glass min-w-0 flex-1 rounded-3xl p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">Calendar</h2>
            {!isSameDay(selected, today) && (
              <button
                onClick={goToday}
                className="flex items-center gap-1 rounded-full bg-cyan-400/15 px-2.5 py-1 text-xs font-semibold text-cyan-200 transition-colors hover:bg-cyan-400/25"
              >
                <Icon name="target" className="h-3 w-3" /> Today
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => shift(-1)}
              className="grid h-8 w-8 place-items-center rounded-xl bg-white/5 text-white/60 transition-all hover:bg-white/15 hover:text-white"
              aria-label="Previous month"
            >
              <Icon name="chevronLeft" className="h-4 w-4" />
            </button>
            <span className="w-36 text-center text-sm font-semibold">{monthLabel}</span>
            <button
              onClick={() => shift(1)}
              className="grid h-8 w-8 place-items-center rounded-xl bg-white/5 text-white/60 transition-all hover:bg-white/15 hover:text-white"
              aria-label="Next month"
            >
              <Icon name="chevronRight" className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div key={`${cursor.getFullYear()}-${cursor.getMonth()}`} className="animate-rise">
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {WEEKDAYS.map((w, i) => (
              <div
                key={w}
                className={`px-1 pb-1.5 text-center text-[11px] font-semibold uppercase tracking-wider ${
                  i === 0 || i === 6 ? 'text-white/30' : 'text-white/40'
                }`}
              >
                <span className="hidden sm:inline">{w}</span>
                <span className="sm:hidden">{w[0]}</span>
              </div>
            ))}

            {cells.map((date, i) => {
              if (!date) return <div key={`pad-${i}`} />
              const key = date.toDateString()
              const dayItems = byDay.get(key) ?? []
              const isToday = isSameDay(date, today)
              const isSelected = isSameDay(date, selected)
              const chipCount = dayItems.slice(0, MAX_CHIPS)
              const more = dayItems.length - chipCount.length
              const overdue = dayItems.some(
                (a) => !a._google && a.status !== 'submitted' && new Date(a.dueAt).getTime() < Date.now(),
              )

              return (
                <button
                  key={key}
                  onClick={() => setSelected(date)}
                  aria-label={date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                  className={`group relative flex min-h-[3rem] flex-col items-stretch gap-1 rounded-xl border p-1 text-left transition-all duration-150 sm:min-h-[6.75rem] sm:p-1.5 ${
                    isSelected
                      ? 'border-cyan-300/40 bg-cyan-400/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]'
                      : isToday
                        ? 'border-cyan-300/30 bg-white/[0.04]'
                        : 'border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold transition-colors ${
                        isToday
                          ? 'bg-cyan-400 text-[#05060f] shadow-[0_2px_10px_rgba(34,211,238,0.5)]'
                          : isSelected
                            ? 'text-cyan-100'
                            : date > today
                              ? 'text-white/70'
                              : 'text-white/40'
                      }`}
                    >
                      {date.getDate()}
                    </span>
                    {isToday && !isSelected && (
                      <span className="hidden text-[10px] font-semibold text-cyan-300/80 sm:inline">
                        Today
                      </span>
                    )}
                  </div>

                  {dayItems.length > 0 && (
                    <div className="hidden flex-col gap-1 sm:flex">
                      {chipCount.map((it) =>
                        it._google ? (
                          <span
                            key={it.id}
                            className="truncate rounded-md bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-medium leading-4 text-amber-200"
                          >
                            {it.title}
                          </span>
                        ) : (
                          <span
                            key={it.id}
                            className={`truncate rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-4 ${
                              it.status === 'submitted'
                                ? 'bg-emerald-400/15 text-emerald-200'
                                : it.status !== 'submitted' && new Date(it.dueAt).getTime() < Date.now()
                                  ? 'bg-red-400/20 text-red-200'
                                  : 'bg-cyan-400/15 text-cyan-200'
                            }`}
                          >
                            {it.name}
                          </span>
                        ),
                      )}
                      {more > 0 && (
                        <span className="pl-1 text-[10px] font-semibold text-white/40">
                          +{more} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Compact dot indicator for small screens */}
                  {dayItems.length > 0 && (
                    <div className="mt-auto flex flex-wrap gap-1 sm:hidden">
                      {dayItems.slice(0, 4).map((it) => (
                        <Dot key={it.id} google={it._google} overdue={overdue} />
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 px-1 pt-3 text-xs text-white/45">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-cyan-300" /> Assignments
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-400" /> Overdue
          </span>
          {gConnected && (
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-300" /> Google Calendar
            </span>
          )}
          <span className="ml-auto hidden text-xs text-white/35 sm:block">
            {monthCounts.work} assignments · {gConnected ? `${monthCounts.events} events` : 'no Google link'} this month
          </span>
        </div>
      </div>

      {/* Day agenda */}
      <aside className="glass w-full shrink-0 rounded-3xl p-5 xl:w-[24rem]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold tracking-tight">
              {selected.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
            </h3>
            <span
              className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                isSameDay(selected, today)
                  ? 'bg-cyan-400/15 text-cyan-200'
                  : selected > today
                    ? 'bg-white/10 text-white/60'
                    : 'bg-red-400/15 text-red-200'
              }`}
            >
              {relativeDayLabel(selected, today)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => shiftDay(-1)}
              className="grid h-8 w-8 place-items-center rounded-xl bg-white/5 text-white/60 transition-all hover:bg-white/15 hover:text-white"
              aria-label="Previous day"
            >
              <Icon name="chevronLeft" className="h-4 w-4" />
            </button>
            <button
              onClick={() => shiftDay(1)}
              className="grid h-8 w-8 place-items-center rounded-xl bg-white/5 text-white/60 transition-all hover:bg-white/15 hover:text-white"
              aria-label="Next day"
            >
              <Icon name="chevronRight" className="h-4 w-4" />
            </button>
          </div>
        </div>

        {loadingEvents ? (
          <>
            <div className="skeleton mb-3 h-4 w-3/4" />
            <div className="skeleton h-14" />
            <div className="skeleton mt-2 h-14" />
          </>
        ) : selectedItems.length === 0 ? (
          <EmptyState
            icon="calendarCheck"
            title={isSameDay(selected, today) ? 'Nothing planned today' : 'Clear day'}
            hint={isSameDay(selected, today) ? 'Enjoy the breathing room.' : 'No assignments or events on this day.'}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {selectedItems.map((it) =>
              it._google ? (
                <div
                  key={it.id}
                  className="glass-subtle flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm transition-colors duration-200 hover:border-amber-300/30"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-400/15 text-amber-300">
                    <Icon name={it.allDay ? 'calendarCheck' : 'clock'} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-white">{it.title}</span>
                      {it.link && (
                        <a
                          href={it.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Open event in Google Calendar"
                          className="shrink-0 text-white/35 transition-colors hover:text-amber-300"
                        >
                          <Icon name="arrowUpRight" className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-white/45">
                      {it.allDay ? (
                        <span>All day</span>
                      ) : (
                        <>
                          <span>{fmtTime(it.start)}</span>
                          {it.end && <span> – {fmtTime(it.end)}</span>}
                        </>
                      )}
                      {it.location && (
                        <>
                          <span className="text-white/25">·</span>
                          <span className="truncate">{it.location}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <a
                  key={it.id}
                  href={it.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glass-subtle flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm transition-all duration-200 hover:border-cyan-300/30"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-400/15 text-cyan-300">
                    <Icon name="assignments" className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-white">{it.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-white/45">{it.courseName ?? ''}</span>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      it.status === 'submitted'
                        ? 'bg-emerald-400/15 text-emerald-300'
                        : new Date(it.dueAt).getTime() < Date.now()
                          ? 'bg-red-400/20 text-red-200'
                          : 'bg-white/10 text-white/60'
                    }`}
                  >
                    {it.status === 'submitted' ? 'Done' : new Date(it.dueAt).getTime() < Date.now() ? 'Overdue' : fmtTime(it.dueAt)}
                  </span>
                </a>
              ),
            )}
          </div>
        )}
      </aside>
    </section>
  )
}

function Dot({ google, overdue }) {
  return (
    <span
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
        google ? 'bg-amber-300' : overdue ? 'bg-red-400' : 'bg-cyan-300'
      }`}
    />
  )
}