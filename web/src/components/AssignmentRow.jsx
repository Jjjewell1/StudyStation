import { isPast } from '@/lib/dates'
import { formatDueDate, relativeLabel } from '@/lib/dates'

const STATUS = {
  not_started: { label: 'Not started', cls: 'bg-white/10 text-white/70 border-white/15' },
  drafted: { label: 'Drafted', cls: 'bg-amber-400/15 text-amber-200 border-amber-300/25' },
  submitted: { label: 'Submitted', cls: 'bg-emerald-400/15 text-emerald-200 border-emerald-300/25' },
}

export default function AssignmentRow({ assignment, courseName }) {
  const s = STATUS[assignment.status] ?? STATUS.not_started
  const overdue = assignment.status !== 'submitted' && isPast(assignment.dueAt)

  return (
    <div className="group flex items-center gap-3 rounded-xl px-3 py-2 transition-all duration-200 ease-out hover:bg-white/5">
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
