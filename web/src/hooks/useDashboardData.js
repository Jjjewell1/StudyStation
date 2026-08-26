import { useEffect, useState } from 'react'
import { getCourses, getAssignments } from '@/api/client'
import { isPast, isToday, isWithinDays } from '@/lib/dates'

// Loads courses + assignments from the REST API and derives the dashboard
// stats. Returns loading/error so the UI can render graceful empty states.
export function useDashboardData() {
  const [courses, setCourses] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [c, a] = await Promise.all([getCourses(), getAssignments()])
        if (cancelled) return
        setCourses(c)
        setAssignments(a)
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const incomplete = assignments.filter((a) => a.status !== 'submitted')
  const overdue = incomplete.filter((a) => isPast(a.dueAt))
  const dueToday = incomplete.filter((a) => isToday(a.dueAt) && !isPast(a.dueAt))
  const dueThisWeek = incomplete.filter(
    (a) => isWithinDays(a.dueAt, 7) && !isPast(a.dueAt),
  )
  const completed = assignments.filter((a) => a.status === 'submitted')

  function updateStatus(id, status) {
    setAssignments((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)))
  }

  return {
    courses,
    assignments,
    stats: {
      overdue: overdue.length,
      dueToday: dueToday.length,
      dueThisWeek: dueThisWeek.length,
      completed: completed.length,
    },
    filtered: { overdue, dueToday, dueThisWeek, completed },
    updateStatus,
    loading,
    error,
  }
}
