import CourseProgressCard from './CourseProgressCard'
import { Icon } from './Icon'

export default function CoursesView({ courses, loading, error }) {
  return (
    <section className="glass rounded-3xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">Courses</h2>
        <span className="text-xs text-white/45">
          {loading ? '…' : `${courses.length} active`}
        </span>
      </div>

      {loading && (
        <div className="flex flex-1 items-center justify-center py-16 text-sm text-white/40">
          Loading…
        </div>
      )}

      {!loading && !error && courses.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Icon name="courses" className="h-8 w-8 text-white/25" />
          <p className="text-sm text-white/45">No courses yet — the Canvas sync will populate this.</p>
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {courses.map((course) => (
            <CourseProgressCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </section>
  )
}
