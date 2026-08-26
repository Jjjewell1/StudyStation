import { useState } from 'react'
import { isPast } from '@/lib/dates'
import { formatDueDate, relativeLabel } from '@/lib/dates'
import { setAssignmentStatus } from '@/api/client'

const STATUS = {
  not_started: { label: 'Not started', cls: 'bg-white/10 text-white/70 border-white/15' },
  drafted: { label: 'Drafted', cls: 'bg-amber-400/15 text-amber-200 border-amber-300/25' },
  submitted: { label: 'Submitted', cls: 'bg-emerald-400/15 text-emerald-200 border-emerald-300/25' },
}

const ORDER = ['not_started', 'drafted', 'submitted']

export default function AssignmentRow({ assignment, courseName, onStatusChange }) {
  const [busy, setBusy] = useState(false)
  const s = STATUS[assignment.status] ?? STATUS.not_started
  const overdue = assignment.status !== 'submitted' && isPast(assignment.dueAt)

  // Cycle through statuses: not_started -> drafted -> submitted -> not_started.
  async function cycleStatus() {
    if (busy) return
    setBusy(true)
    const idx = ORDER.indexOf(assignment.status)
    const next = ORDER[(idx + 1) % ORDER.length]
    try {
      await setAssignmentStatus(assignment.id, next)
      onStatusChange?.(assignment.id, next)
    } catch {
      /* optimistic refresh on next load */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="group flex items-center gap-3 rounded-xl px-3 py-2 transition-all duration-200 ease-out hover:bg-white/5">
      {/* Status toggle */}
      <button
        onClick={cycleStatus}
        disabled={busy}
        title={`Mark ${s.label} → ${STATUS[ORDER[(ORDER.indexOf(assignment.status) + 1) % ORDER.length]].label}`}
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors ${
          assignment.status === 'submitted'
            ? 'border-emerald-400/50 bg-emerald-400/20 text-emerald-300'
            : assignment.status === 'drafted'
              ? 'border-amber-400/50 bg-amber-400/15 text-amber-300'
              : 'border-white/25 text-transparent hover:border-cyan-300'
        }`}
        aria-label="Cycle status"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </button>

      <div className="min-w-0 flex-1">
        {assignment.url ? (
          <a
            href={assignment.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-sm font-semibold text-white transition-colors duration-200 hover:text-cyan-300 hover:underline"
            title={`Open ${assignment.name} in Canvas`}
          >
            {assignment.name}
          </a>
        ) : (
          <div className="truncate text-sm font-semibold text-white">
            {assignment.name}
          </div>
        )}
        <div
          className={`mt-0.5 truncate text-xs ${
            overdue ? 'font-medium text-red-300' : 'text-white/45'
          }`}
        >
          {courseName && <span className="text-white/35">{courseName} · </span>}
          {formatDueDate(assignment.dueAt)} · {assignment.points} pts
        </div>
      </div>

      <div className="hidden shrink-0 sm:block">
        <span
          className={`text-xs font-semibold ${
            overdue ? 'text-red-300' : relativeLabel(assignment.dueAt) === 'Overdue' ? 'text-red-300' : 'text-white/50'
          }`}
        >
          {overdue ? 'Overdue' : relativeLabel(assignment.dueAt)}
        </span>
      </div>

      <span
        className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${s.cls}`}
      >
        {s.label}
      </span>
    </div>
  )
}
