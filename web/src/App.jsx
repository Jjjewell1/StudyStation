import { useMemo, useState } from 'react'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import StatCard from './components/StatCard'
import AssignmentRow from './components/AssignmentRow'
import CourseProgressCard from './components/CourseProgressCard'
import ChatPanel from './components/ChatPanel'
import { Icon } from './components/Icon'
import { useDashboardData } from './hooks/useDashboardData'

const STATUS_ORDER = { not_started: 0, drafted: 1, submitted: 2 }

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

export default function App() {
  const { courses, assignments, stats, loading, error } = useDashboardData()
  const [active, setActive] = useState('overview')

  // Group assignments by course, sorted by course name, rows sorted by status
  // then due date. Empty-state friendly when the backend isn't wired yet.
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

  const totalCourses = courses.length
  const totalAssignments = assignments.length

  return (
    <div className="relative min-h-screen">
      <Background />

      <div className="flex gap-4 p-4">
        <Sidebar active={active} onNavigate={setActive} />

        <main className="flex min-w-0 flex-1 flex-col gap-6 pb-8">
          <Header />

          {/* Stat cards */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Overdue"
              value={loading ? '—' : stats.overdue}
              tone="red"
              icon={<Icon name="calendar" className="h-5 w-5" />}
              sub="needs attention"
            />
            <StatCard
              label="Due today"
              value={loading ? '—' : stats.dueToday}
              tone="amber"
              icon={<Icon name="assignments" className="h-5 w-5" />}
              sub="closing soon"
            />
            <StatCard
              label="Due this week"
              value={loading ? '—' : stats.dueThisWeek}
              tone="blue"
              icon={<Icon name="overview" className="h-5 w-5" />}
              sub="next 7 days"
            />
            <StatCard
              label="Completed"
              value={loading ? '—' : stats.completed}
              tone="green"
              icon={<Icon name="send" className="h-5 w-5" />}
              sub={`of ${totalAssignments} total`}
            />
          </section>

          {error && (
            <div className="glass rounded-3xl border-red-400/30 p-4 text-sm text-red-200">
              Couldn&apos;t load data: {error}. The API backend isn&apos;t wired up yet.
            </div>
          )}

          {/* Main grid */}
          <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {/* Assignments by course */}
            <div className="glass flex flex-col rounded-3xl p-5 xl:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold">Assignments</h2>
                <span className="text-xs text-white/45">
                  {loading ? '…' : `${totalAssignments} total`}
                </span>
              </div>

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

              {!loading &&
                grouped.map((course) => {
                  const rows = [...course.assignments].sort(
                    (a, b) =>
                      (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0) ||
                      new Date(a.dueAt) - new Date(b.dueAt),
                  )
                  return (
                    <div key={course.id} className="mb-6 last:mb-0">
                      <div className="mb-2 flex items-baseline gap-2 px-1">
                        <h3 className="text-sm font-semibold text-white/80">
                          {course.name}
                        </h3>
                        <span className="text-xs text-white/40">
                          {rows.length} assignment{rows.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className="flex flex-col gap-2">
                        {rows.map((a) => (
                          <AssignmentRow key={a.id} assignment={a} />
                        ))}
                      </div>
                    </div>
                  )
                })}
            </div>

            {/* Right column: courses + chat */}
            <div className="flex flex-col gap-6">
              <div className="glass rounded-3xl p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-bold">Courses</h2>
                  <span className="text-xs text-white/45">
                    {loading ? '…' : `${totalCourses} active`}
                  </span>
                </div>
                {loading ? (
                  <div className="py-10 text-center text-sm text-white/40">Loading…</div>
                ) : grouped.length === 0 ? (
                  <div className="py-10 text-center text-sm text-white/45">
                    No courses yet.
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {grouped.map((course) => (
                      <CourseProgressCard key={course.id} course={course} />
                    ))}
                  </div>
                )}
              </div>

              <ChatPanel />
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
