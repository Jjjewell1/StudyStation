export function hasDue(iso) {
  return !!iso && !Number.isNaN(new Date(iso).getTime())
}

export function isPast(iso) {
  if (!hasDue(iso)) return false
  return new Date(iso).getTime() < Date.now()
}

export function isToday(iso) {
  if (!hasDue(iso)) return false
  const d = new Date(iso)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

export function isWithinDays(iso, days) {
  if (!hasDue(iso)) return false
  const d = new Date(iso).getTime()
  const end = Date.now() + days * 24 * 60 * 60 * 1000
  return d >= Date.now() && d <= end
}

export function formatDueDate(iso) {
  if (!hasDue(iso)) return 'No due date'
  const d = new Date(iso)
  if (isToday(iso)) return 'Today'
  const opts = { month: 'short', day: 'numeric' }
  const s = d.toLocaleDateString(undefined, opts)
  const time = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${s} · ${time}`
}

export function relativeLabel(iso) {
  if (!hasDue(iso)) return ''
  if (isPast(iso)) return 'Overdue'
  if (isToday(iso)) return 'Today'
  if (isWithinDays(iso, 1)) return 'Tomorrow'
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
  if (days <= 7) return `in ${days}d`
  return `${days}d`
}

// Week helpers (week starts Monday, matches how Canvas/schools typically lay
// out terms).
export function startOfWeek(iso) {
  const d = new Date(iso)
  const day = (d.getDay() + 6) % 7 // Mon=0 .. Sun=6
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}

export function endOfWeek(iso) {
  const d = startOfWeek(iso)
  d.setDate(d.getDate() + 6)
  d.setHours(23, 59, 59, 999)
  return d
}

export function weekKey(iso) {
  const d = startOfWeek(iso)
  return d.toISOString().slice(0, 10)
}

// ISO week number (1-53)
export function isoWeekNumber(iso) {
  const d = new Date(iso)
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7)
}

export function weekRangeLabel(iso) {
  const s = startOfWeek(iso)
  const e = endOfWeek(iso)
  const opts = { month: 'short', day: 'numeric' }
  const sameMonth = s.getMonth() === e.getMonth()
  const startStr = s.toLocaleDateString(undefined, sameMonth ? { month: 'short', day: 'numeric' } : opts)
  const endStr = e.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${startStr} – ${endStr}`
}
