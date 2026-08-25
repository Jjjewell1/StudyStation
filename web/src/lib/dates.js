export function isPast(iso) {
  return new Date(iso).getTime() < Date.now()
}

export function isToday(iso) {
  const d = new Date(iso)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

export function isWithinDays(iso, days) {
  const d = new Date(iso).getTime()
  const end = Date.now() + days * 24 * 60 * 60 * 1000
  return d >= Date.now() && d <= end
}

export function formatDueDate(iso) {
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
  if (isPast(iso)) return 'Overdue'
  if (isToday(iso)) return 'Today'
  if (isWithinDays(iso, 1)) return 'Tomorrow'
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
  if (days <= 7) return `in ${days}d`
  return `${days}d`
}
