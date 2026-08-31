import { useMemo, useState } from 'react'
import CourseTabs from './CourseTabs'
import AssignmentRow from './AssignmentRow'
import EmptyState from './EmptyState'
import { Icon } from './Icon'
import {
  hasDue,
  isoWeekNumber,
  weekKey,
  weekRangeLabel,
} from '@/lib/dates'

const STATUS_ORDER = { not_started: 0, drafted: 1, submitted: 2 }

export default function AssignmentsPanel({ courses, grouped, loading, error, filter, search = '', onClearFilter, onStatusChange }) {
  const q = (search ?? '').trim().toLowerCase()
  const matches = (a, courseName) =>
    !q ||
    (a.name ?? '').toLowerCase().includes(q) ||
    (courseName ?? '').toLowerCase().includes(q)

  const [selected, setSelected] = useState('all')
  const [openWeek, setOpenWeek] = useState(() => weekKey(new Date().toISOString()))

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
        if (!matches(a, course.name)) continue
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
  }, [visible, q])

  const matchedCount = weeks.reduce((n, w) => n + w.total, 0)
  const totalCount = grouped.reduce((n, c) => n + c.assignments.length, 0)

  function toggleWeek(key) {
    setOpenWeek((cur) => (cur === key ? null : key))
  }

  return (
    <div className="glass animate-rise flex flex-col rounded-3xl p-5">
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
            {loading ? '…' : `${matchedCount}${!filter && selected === 'all' && !q ? '' : ` / ${totalCount}`}`}
          </span>
          {(filter || q) && (
            <button
              onClick={onClearFilter}
              className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-xs text-white/55 transition-colors hover:bg-white/15 hover:text-white"
            >
              <Icon name="x" className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {!loading && (!filter || Object.keys(grouped).length > 0) && (
        <CourseTabs courses={courses} activeId={selected} onChange={setSelected} />
      )}

      {loading && (
        <div className="flex flex-col gap-2.5 py-4">
          {[80, 100, 60, 90].map((w, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="skeleton h-8 w-8" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-3.5" style={{ width: `${w}%` }} />
                <div className="skeleton h-2.5" style={{ width: `${Math.max(30, w - 30)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && grouped.length === 0 && (
        <EmptyState
          icon="assignments"
          title="No assignments yet"
          hint="The Canvas sync will populate this."
        />
      )}

      {!loading && !error && matchedCount === 0 && grouped.length > 0 && (
        <EmptyState
          icon={q ? 'x' : 'sparkle'}
          title={q ? `No matches for “${q}”` : 'Nothing to show'}
          hint={q ? 'Try a different course or assignment name.' : 'Nothing due right now — nice work.'}
        />
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
            const pct = w.total ? Math.round((w.done / w.total) * 100) : 0
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
                  <span className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/70">
                      {w.done}/{w.total}
                    </span>
                    <span className="h-1 w-20 overflow-hidden rounded-full bg-white/10">
                      <span
                        className={`block h-full rounded-full transition-all duration-500 ${
                          w.finished ? 'bg-emerald-400' : 'bg-cyan-400/70'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-white/10 px-3 py-2">
                    <div className="flex flex-col gap-1.5">
                      {rows.map((a) => (
                        <AssignmentRow
                          key={a.id}
                          assignment={a}
                          courseName={a.courseName}
                          onStatusChange={onStatusChange}
                        />
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