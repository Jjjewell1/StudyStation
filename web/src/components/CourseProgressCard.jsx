const R = 34
const CIRC = 2 * Math.PI * R

export default function CourseProgressCard({ course }) {
  const pct = Math.max(0, Math.min(100, course.progress ?? 0))
  const offset = CIRC - (pct / 100) * CIRC

  return (
    <div className="glass group flex items-center gap-4 rounded-3xl p-4 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-lg">
      <div className="relative h-20 w-20 shrink-0">
        <svg viewBox="0 0 88 88" className="h-20 w-20 -rotate-90">
          <circle
            cx="44"
            cy="44"
            r={R}
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="8"
          />
          <circle
            cx="44"
            cy="44"
            r={R}
            fill="none"
            stroke="url(#grad)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={offset}
            className="transition-all duration-700 ease-out"
          />
          <defs>
            <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#818cf8" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="text-sm font-bold">{pct}%</span>
        </div>
      </div>

      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-white">{course.name}</div>
        <div className="mt-0.5 text-xs text-white/45">{course.term}</div>
        <div className="mt-1.5 text-[11px] font-medium text-cyan-300/80">
          {pct >= 90 ? 'Almost there' : pct >= 60 ? 'On track' : pct >= 30 ? 'Keep going' : 'Getting started'}
        </div>
      </div>
    </div>
  )
}
