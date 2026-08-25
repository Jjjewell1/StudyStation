export default function CourseTabs({ courses, activeId = 'all', onChange }) {
  const tabs = [{ id: 'all', label: 'All' }, ...courses]

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {tabs.map((c) => {
        const isActive = c.id === activeId
        return (
          <button
            key={c.id}
            onClick={() => onChange(c.id)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
              isActive
                ? 'bg-white/15 text-white shadow-inner'
                : 'bg-white/5 text-white/55 hover:bg-white/10 hover:text-white'
            }`}
          >
            {c.code || c.name}
          </button>
        )
      })}
    </div>
  )
}
