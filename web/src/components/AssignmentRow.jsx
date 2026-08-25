import { isPast } from '@/lib/dates'
import { formatDueDate, relativeLabel } from '@/lib/dates'

const STATUS = {
  not_started: { label: 'Not started', cls: 'bg-white/10 text-white/70 border-white/15' },
  drafted: { label: 'Drafted', cls: 'bg-amber-400/15 text-amber-200 border-amber-300/25' },
  submitted: { label: 'Submitted', cls: 'bg-emerald-400/15 text-emerald-200 border-emerald-300/25' },
}

export default function AssignmentRow({ assignment }) {
  const s = STATUS[assignment.status] ?? STATUS.not_started
  const overdue = assignment.status !== 'submitted' && isPast(assignment.dueAt)

  return (
    <div className="glass-subtle group flex items-center gap-4 rounded-2xl px-4 py-3 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-white/20 hover:shadow-md">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-white">
          {assignment.name}
        </div>
        <div
          className={`mt-0.5 text-xs ${
            overdue ? 'font-medium text-red-300' : 'text-white/45'
          }`}
        >
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
