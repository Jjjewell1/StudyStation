import { useState } from 'react'
import CourseTabs from './CourseTabs'
import AssignmentRow from './AssignmentRow'
import { Icon } from './Icon'

const STATUS_ORDER = { not_started: 0, drafted: 1, submitted: 2 }

export default function AssignmentsPanel({ courses, grouped, loading, error, filter, onClearFilter }) {
  const [selected, setSelected] = useState('all')

  // When a stat-card filter is active, show only that bucket (grouped by
  // course). Otherwise use the course-tab selection.
  const visible = filter ? grouped : selected === 'all' ? grouped : grouped.filter((c) => c.id === selected)
  const visibleCount = visible.reduce((n, c) => n + c.assignments.length, 0)
  const totalCount = grouped.reduce((n, c) => n + c.assignments.length, 0)

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

      {!loading && !error && visibleCount === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
          <Icon name="sparkle" className="h-8 w-8 text-white/25" />
          <p className="text-sm text-white/45">Nothing here — nice work.</p>
        </div>
      )}

      {!loading &&
        visible.map((course) => {
          const rows = [...course.assignments].sort(
            (a, b) =>
              (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0) ||
              new Date(a.dueAt) - new Date(b.dueAt),
          )
          return (
            <div key={course.id} className="mb-6 last:mb-0">
              {!filter && selected === 'all' && (
                <div className="mb-2 flex items-baseline gap-2 px-1">
                  <h3 className="text-sm font-semibold text-white/80">{course.name}</h3>
                  <span className="text-xs text-white/40">
                    {rows.length} assignment{rows.length === 1 ? '' : 's'}
                  </span>
                </div>
              )}
              <div className="flex flex-col gap-2">
                {rows.map((a) => (
                  <AssignmentRow key={a.id} assignment={a} />
                ))}
              </div>
            </div>
          )
        })}
    </div>
  )
}
