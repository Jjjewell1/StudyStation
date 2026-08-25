import { useState } from 'react'
import { Icon } from './Icon'

const NAV = [
  { id: 'overview', label: 'Overview', icon: 'overview' },
  { id: 'assignments', label: 'Assignments', icon: 'assignments' },
  { id: 'courses', label: 'Courses', icon: 'courses' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'resources', label: 'Resources', icon: 'resources' },
]

export default function Sidebar({ active = 'overview', onNavigate }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={`glass sticky top-4 flex h-[calc(100vh-2rem)] shrink-0 flex-col rounded-3xl p-4 transition-all duration-300 ease-out ${
        collapsed ? 'w-[72px]' : 'w-60'
      }`}
    >
      <div className="flex items-center gap-3 px-1">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-lg shadow-indigo-500/30">
          <Icon name="sparkle" className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="leading-tight">
            <div className="text-[15px] font-bold tracking-tight">StudyStation</div>
            <div className="text-[11px] text-white/50">Coursework OS</div>
          </div>
        )}
      </div>

      <nav className="mt-8 flex flex-1 flex-col gap-1.5">
        {NAV.map((item) => {
          const isActive = item.id === active
          return (
            <button
              key={item.id}
              onClick={() => onNavigate?.(item.id)}
              title={item.label}
              className={`group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-white/15 text-white shadow-inner'
                  : 'text-white/55 hover:bg-white/8 hover:text-white'
              }`}
            >
              <Icon
                name={item.icon}
                className={`h-5 w-5 shrink-0 ${isActive ? 'text-cyan-300' : ''}`}
              />
              {!collapsed && <span>{item.label}</span>}
            </button>
          )
        })}
      </nav>

      <button
        onClick={() => setCollapsed((c) => !c)}
        className="mt-4 flex items-center justify-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-white/45 transition-all duration-200 hover:bg-white/8 hover:text-white"
      >
        <Icon name="collapse" className="h-5 w-5 shrink-0" />
        {!collapsed && <span>Collapse</span>}
      </button>
    </aside>
  )
}
