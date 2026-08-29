import { useEffect, useMemo, useState } from 'react'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import StatCard from './components/StatCard'
import AssignmentsPanel from './components/AssignmentsPanel'
import CoursesView from './components/CoursesView'
import DocumentsView from './components/DocumentsView'
import CalendarView from './components/CalendarView'
import ResourcesView from './components/ResourcesView'
import MailView from './components/MailView'
import TasksView from './components/TasksView'
import ContactsView from './components/ContactsView'
import SettingsView from './components/SettingsView'
import LoginPage from './components/LoginPage'
import GoogleConnect, { useGoogleStatus } from './components/GoogleConnect'
import ChatPanel from './components/ChatPanel'
import { Icon } from './components/Icon'
import { useDashboardData } from './hooks/useDashboardData'
import { getAuthStatus, setAuthToken } from '@/api/client'

function Background() {
  return (
    <div className="bg-stage">
      <div
        className="blob left-[-10%] top-[-15%] h-[45rem] w-[45rem] bg-indigo-600/50"
        data-depth="0.6"
      />
      <div
        className="blob right-[-12%] top-[10%] h-[38rem] w-[38rem] bg-fuchsia-600/35"
        data-depth="0.35"
      />
      <div
        className="blob bottom-[-20%] left-[30%] h-[40rem] w-[40rem] bg-teal-500/30"
        data-depth="0.5"
      />
    </div>
  )
}

const FILTERS = {
  overdue: { label: 'Overdue', tone: 'red' },
  dueToday: { label: 'Due today', tone: 'amber' },
  dueThisWeek: { label: 'Due this week', tone: 'blue' },
  completed: { label: 'Completed', tone: 'green' },
}

export default function App() {
  const [auth, setAuth] = useState({ checking: true, pinRequired: false, authenticated: true })

  // Check PIN gate on mount.
  useEffect(() => {
    getAuthStatus()
      .then((s) => setAuth({ checking: false, pinRequired: s.pinRequired, authenticated: s.authenticated }))
      .catch(() => setAuth({ checking: false, pinRequired: false, authenticated: true }))
  }, [])

  function handleLogout() {
    setAuthToken(null)
    setAuth({ checking: false, pinRequired: true, authenticated: false })
  }

  if (auth.checking) {
    return (
      <div className="relative flex min-h-screen items-center justify-center">
        <Background />
        <div className="text-sm text-white/50">Loading…</div>
      </div>
    )
  }

  if (auth.pinRequired && !auth.authenticated) {
    return (
      <LoginPage
        onAuthenticated={() =>
          setAuth((a) => ({ ...a, authenticated: true }))
        }
      />
    )
  }

  return <Dashboard onLogout={handleLogout} />
}

function Dashboard({ onLogout }) {
  const { courses, assignments, stats, filtered, loading, error, updateStatus, reload } = useDashboardData()
  const [active, setActive] = useState('overview')
  const [filterKey, setFilterKey] = useState(null)
  const google = useGoogleStatus()

  // Group assignments by course, sorted by course name.
  const grouped = useMemo(() => {
    const map = new Map()
    for (const c of courses) map.set(c.id, { ...c, assignments: [] })
    for (const a of assignments) {
      const g = map.get(a.courseId) ?? { id: a.courseId, name: 'Unknown course', term: '', assignments: [] }
      g.assignments.push(a)
      map.set(a.courseId, g)
    }
    return [...map.values()].sort((x, y) => x.name.localeCompare(y.name))
  }, [courses, assignments])

  // Group a stat-filter bucket by course (same shape as `grouped`).
  const filteredGrouped = useMemo(() => {
    if (!filterKey) return null
    const bucket = filtered[filterKey] ?? []
    const map = new Map()
    for (const a of bucket) {
      const course = courses.find((c) => c.id === a.courseId) ?? {
        id: a.courseId, name: 'Unknown course', term: '',
      }
      if (!map.has(a.courseId)) map.set(a.courseId, { ...course, assignments: [] })
      map.get(a.courseId).assignments.push(a)
    }
    return [...map.values()].sort((x, y) => x.name.localeCompare(y.name))
  }, [filterKey, filtered, courses])

  const totalCourses = courses.length
  const totalAssignments = assignments.length

  function openFilter(key) {
    setFilterKey(key)
    setActive('assignments')
  }

  const statCards = (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Overdue"
        value={loading ? '—' : stats.overdue}
        tone="red"
        icon={<Icon name="calendar" className="h-5 w-5" />}
        sub="needs attention"
        active={filterKey === 'overdue'}
        onClick={() => openFilter('overdue')}
      />
      <StatCard
        label="Due today"
        value={loading ? '—' : stats.dueToday}
        tone="amber"
        icon={<Icon name="assignments" className="h-5 w-5" />}
        sub="closing soon"
        active={filterKey === 'dueToday'}
        onClick={() => openFilter('dueToday')}
      />
      <StatCard
        label="Due this week"
        value={loading ? '—' : stats.dueThisWeek}
        tone="blue"
        icon={<Icon name="overview" className="h-5 w-5" />}
        sub="next 7 days"
        active={filterKey === 'dueThisWeek'}
        onClick={() => openFilter('dueThisWeek')}
      />
      <StatCard
        label="Completed"
        value={loading ? '—' : stats.completed}
        tone="green"
        icon={<Icon name="send" className="h-5 w-5" />}
        sub={`of ${totalAssignments} total`}
        active={filterKey === 'completed'}
        onClick={() => openFilter('completed')}
      />
    </section>
  )

  return (
    <div className="relative min-h-screen">
      <Background />

      <div className="flex gap-4 p-4">
        <Sidebar active={active} onNavigate={setActive} />

        <main className="flex min-w-0 flex-1 flex-col gap-6 pb-8">
          <Header />

          {error && (
            <div className="glass rounded-3xl border-red-400/30 p-4 text-sm text-red-200">
              Couldn&apos;t load data: {error}.
            </div>
          )}

          {active === 'overview' && (
            <>
              {statCards}
              <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="xl:col-span-2">
                  <AssignmentsPanel
                    courses={courses}
                    grouped={grouped}
                    loading={loading}
                    error={error}
                    onStatusChange={updateStatus}
                  />
                </div>
                <div className="flex flex-col gap-6">
                  <div className="glass rounded-3xl p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-lg font-bold">Courses</h2>
                      <span className="text-xs text-white/45">
                        {loading ? '…' : `${totalCourses} active`}
                      </span>
                    </div>
                    <div className="flex flex-col gap-3">
                      {grouped.map((course) => (
                        <CourseProgressCardSmall key={course.id} course={course} />
                      ))}
                    </div>
                  </div>
                  <ChatPanel />
                  <GoogleConnect status={google} onChanged={google.refresh} compact />
                </div>
              </section>
            </>
          )}

          {active === 'assignments' && (
            <>
              {statCards}
              <AssignmentsPanel
                courses={courses}
                grouped={filteredGrouped ?? grouped}
                loading={loading}
                error={error}
                filter={filterKey ? FILTERS[filterKey] : null}
                onClearFilter={() => setFilterKey(null)}
                onStatusChange={updateStatus}
              />
            </>
          )}

          {active === 'courses' && (
            <CoursesView courses={courses} loading={loading} error={error} />
          )}

          {active === 'documents' && <DocumentsView courses={courses} />}

          {active === 'calendar' && <CalendarView assignments={assignments} />}

          {active === 'mail' && <MailView />}

          {active === 'tasks' && <TasksView />}

          {active === 'contacts' && <ContactsView />}

          {active === 'resources' && <ResourcesView />}

          {active === 'settings' && (
            <SettingsView onLogout={onLogout} courses={courses} onDataChanged={reload} />
          )}
        </main>
      </div>
    </div>
  )
}

function CourseProgressCardSmall({ course }) {
  return (
    <div className="glass-subtle flex items-center gap-3 rounded-2xl p-3 transition-all duration-200 hover:border-white/20">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-white">{course.name}</div>
        <div className="mt-0.5 text-xs text-white/45">{course.term}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-bold text-cyan-300">{course.progress}%</div>
      </div>
    </div>
  )
}
