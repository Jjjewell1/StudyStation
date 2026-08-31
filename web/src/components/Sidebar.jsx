import { useState } from 'react'
import { Icon } from './Icon'
import Logo from './Logo'

const NAV = [
  { id: 'overview', label: 'Overview', icon: 'overview' },
  { id: 'assignments', label: 'Assignments', icon: 'assignments' },
  { id: 'courses', label: 'Courses', icon: 'courses' },
  { id: 'documents', label: 'Documents', icon: 'book' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'mail', label: 'Mail', icon: 'mail' },
  { id: 'tasks', label: 'Tasks', icon: 'tasks' },
  { id: 'contacts', label: 'Contacts', icon: 'contacts' },
  { id: 'resources', label: 'Resources', icon: 'resources' },
  { id: 'settings', label: 'Settings', icon: 'gear' },
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
        <div className="grid h-10 w-10 shrink-0 place-items-center">
          <Logo className="h-10 w-10 drop-shadow-lg" />
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
              aria-current={isActive ? 'page' : undefined}
              className={`group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-gradient-to-r from-indigo-500/30 to-cyan-400/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_4px_16px_rgba(79,70,229,0.25)]'
                  : 'text-white/55 hover:bg-white/8 hover:text-white'
              }`}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-cyan-300" />
              )}
              <Icon
                name={item.icon}
                className={`h-5 w-5 shrink-0 transition-colors ${isActive ? 'text-cyan-300' : ''}`}
              />
              {!collapsed && <span>{item.label}</span>}
            </button>
          )
        })}
      </nav>

      <div className="border-t border-white/10 pt-4">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="flex flex-1 items-center justify-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-white/45 transition-all duration-200 hover:bg-white/8 hover:text-white"
          >
            <Icon name="collapse" className="h-5 w-5 shrink-0" />
            {!collapsed && <span>Collapse</span>}
          </button>
          {!collapsed && (
            <span className="shrink-0 rounded-full bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/35">
              v0.2
            </span>
          )}
        </div>
      </div>
    </aside>
  )
}
