import { Icon } from './Icon'

export default function CourseTabs({ courses, activeId = 'all', onChange }) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <button
        onClick={() => onChange('all')}
        className={`group flex items-center gap-2.5 rounded-2xl px-3 py-2 text-left transition-all duration-200 ${
          activeId === 'all'
            ? 'bg-white/15 text-white shadow-inner'
            : 'bg-white/5 text-white/55 hover:bg-white/10 hover:text-white'
        }`}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500/30 to-cyan-400/20">
          <Icon name="overview" className="h-4 w-4" />
        </span>
        <span className="flex flex-col">
          <span className="text-sm font-semibold leading-tight">All</span>
          <span className="text-[11px] text-white/45 leading-tight">
            {courses.length} courses
          </span>
        </span>
      </button>

      {courses.map((c) => {
        const isActive = c.id === activeId
        return (
          <button
            key={c.id}
            onClick={() => onChange(c.id)}
            className={`group flex items-center gap-2.5 rounded-2xl px-3 py-2 text-left transition-all duration-200 ${
              isActive
                ? 'bg-white/15 text-white shadow-inner'
                : 'bg-white/5 text-white/55 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors duration-200 ${
                isActive
                  ? 'bg-gradient-to-br from-indigo-500 to-cyan-400 text-white shadow-md shadow-indigo-500/30'
                  : 'bg-white/10 text-white/60'
              }`}
            >
              <Icon name="book" className="h-4 w-4" />
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-semibold leading-tight">
                {c.short || c.code || c.name}
              </span>
              <span className="max-w-[11rem] truncate text-[11px] text-white/45 leading-tight">
                {c.subtext || c.name}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
