import { useMemo, useState } from 'react'
import CourseTabs from './CourseTabs'
import AssignmentRow from './AssignmentRow'
import { Icon } from './Icon'
import {
  hasDue,
  isoWeekNumber,
  weekKey,
  weekRangeLabel,
} from '@/lib/dates'

const STATUS_ORDER = { not_started: 0, drafted: 1, submitted: 2 }

export default function AssignmentsPanel({ courses, grouped, loading, error, filter, onClearFilter }) {
  const [selected, setSelected] = useState('all')
  const [openWeek, setOpenWeek] = useState(null)

  // Filter by course tab (or stat-card filter bucket, which pre-groups `grouped`).
  const visible = filter ? grouped : selected === 'all' ? grouped : grouped.filter((c) => c.id === selected)

  // Flatten to rows, then bucket by week.
  const weeks = useMemo(() => {
    const map = new Map()
    const noDate = {
      key: '__nodate__',
      label: 'No due date',
      range: 'Anytime',
      items: [],
      total: 0,
      done: 0,
      noDate: true,
    }
    for (const course of visible) {
      for (const a of course.assignments) {
        if (!hasDue(a.dueAt)) {
          noDate.items.push({ ...a, courseName: course.name })
          noDate.total += 1
          if (a.status === 'submitted') noDate.done += 1
          continue
        }
        const key = weekKey(a.dueAt)
        if (!map.has(key)) {
          map.set(key, {
            key,
            label: `Week ${isoWeekNumber(a.dueAt)}`,
            range: weekRangeLabel(a.dueAt),
            items: [],
            total: 0,
            done: 0,
          })
        }
        const bucket = map.get(key)
        bucket.items.push({ ...a, courseName: course.name })
        bucket.total += 1
        if (a.status === 'submitted') bucket.done += 1
      }
    }
    const out = [...map.values()].map((w) => ({
      ...w,
      finished: w.total > 0 && w.done === w.total,
    }))
    // Sort: incomplete weeks first (by start date), completed weeks moved to end.
    out.sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? 1 : -1
      return a.key.localeCompare(b.key)
    })
    if (noDate.total > 0) out.push({ ...noDate, finished: noDate.done === noDate.total })
    return out
  }, [visible])

  const visibleCount = visible.reduce((n, c) => n + c.assignments.length, 0)
  const totalCount = grouped.reduce((n, c) => n + c.assignments.length, 0)

  function toggleWeek(key) {
    setOpenWeek((cur) => (cur === key ? null : key))
  }

  return (
    <div className="glass flex flex-col rounded-3xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold">Assignments</h2>
          {filter && (
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white">
              {filter.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/45">
            {loading ? '…' : `${visibleCount}${!filter && selected === 'all' ? '' : ` / ${totalCount}`}`}
          </span>
          {filter && (
            <button
              onClick={onClearFilter}
              className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-xs text-white/55 transition-colors hover:bg-white/15 hover:text-white"
            >
              <Icon name="collapse" className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </div>
      </div>

      {!loading && !filter && <CourseTabs courses={courses} activeId={selected} onChange={setSelected} />}

      {loading && (
        <div className="flex flex-1 items-center justify-center py-16 text-sm text-white/40">
          Loading…
        </div>
      )}

      {!loading && !error && grouped.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
          <Icon name="assignments" className="h-8 w-8 text-white/25" />
          <p className="text-sm text-white/45">
            No assignments yet — the Canvas sync will populate this.
          </p>
        </div>
      )}

      {!loading && !error && weeks.length === 0 && visibleCount === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
          <Icon name="sparkle" className="h-8 w-8 text-white/25" />
          <p className="text-sm text-white/45">Nothing here — nice work.</p>
        </div>
      )}

      {!loading && (
        <div className="flex flex-col gap-3">
          {weeks.map((w) => {
            const isOpen = openWeek === w.key
            const rows = [...w.items].sort(
              (a, b) =>
                (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0) ||
                new Date(a.dueAt) - new Date(b.dueAt),
            )
            return (
              <div key={w.key} className="glass-subtle overflow-hidden rounded-2xl">
                <button
                  onClick={() => toggleWeek(w.key)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-200 hover:bg-white/5"
                >
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl transition-colors ${
                      w.finished ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10 text-white/70'
                    }`}
                  >
                    <Icon
                      name="chevron"
                      className={`h-4 w-4 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{w.label}</span>
                      {w.finished && (
                        <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                          Done
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-white/45">{w.range}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/70">
                    {w.done}/{w.total}
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-white/10 px-3 py-2">
                    <div className="flex flex-col gap-1.5">
                      {rows.map((a) => (
                        <AssignmentRow key={a.id} assignment={a} courseName={a.courseName} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
