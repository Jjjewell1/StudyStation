import CourseProgressCard from './CourseProgressCard'
import EmptyState from './EmptyState'

export default function CoursesView({ courses, loading, error }) {
  return (
    <section className="glass animate-rise rounded-3xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">Courses</h2>
        <span className="text-xs text-white/45">
          {loading ? '…' : `${courses.length} active`}
        </span>
      </div>

      {loading && (
        <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2.5 rounded-2xl border border-white/5 bg-white/[0.03] p-4">
              <div className="skeleton h-4 w-3/4" />
              <div className="skeleton h-2.5 w-1/2" />
              <div className="skeleton ml-auto h-20 w-20 rounded-full" />
            </div>
          ))}
        </div>
      )}

      {!loading && !error && courses.length === 0 && (
        <EmptyState
          icon="courses"
          title="No courses yet"
          hint="The Canvas sync will populate this."
        />
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
