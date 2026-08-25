// Clean REST client. The real backend (reading Postgres, populated by the
// nightly Canvas sync) will serve these two endpoints. No backend-specific
// SDK, no Supabase — just fetch against relative /api routes so the same
// build runs identically in dev and self-hosted production.
const BASE = '/api'

async function getJSON(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`GET ${BASE}${path} failed (${res.status})`)
  }
  return res.json()
}

async function sendJSON(path, method, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    let detail = `${res.status}`
    try {
      const data = await res.json()
      if (data.detail) detail = data.detail
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }
  return res.status === 204 ? null : res.json()
}

export const getCourses = () => getJSON('/courses')
export const getAssignments = () => getJSON('/assignments')
export const getResources = () => getJSON('/resources')

// Google
export const getGoogleStatus = () => getJSON('/google/status')
export const googleAuthUrl = () => `${BASE}/google/auth`
export const disconnectGoogle = () => sendJSON('/google/disconnect', 'POST')

export const getCalendarEvents = (timeMin, timeMax) => {
  const q = new URLSearchParams()
  if (timeMin) q.set('timeMin', timeMin)
  if (timeMax) q.set('timeMax', timeMax)
  return getJSON(`/google/calendar/events?${q.toString()}`)
}

export const getTaskLists = () => getJSON('/google/tasks/lists')
export const getTasks = (listId, showCompleted = true) =>
  getJSON(`/google/tasks/lists/${listId}/tasks?showCompleted=${showCompleted}`)
export const createTask = (listId, title) =>
  sendJSON(`/google/tasks/lists/${listId}/tasks`, 'POST', { title })
export const updateTask = (listId, taskId, patch) =>
  sendJSON(`/google/tasks/lists/${listId}/tasks/${taskId}`, 'PATCH', patch)
export const deleteTask = (listId, taskId) =>
  sendJSON(`/google/tasks/lists/${listId}/tasks/${taskId}`, 'DELETE')

export const getContacts = (query) =>
  getJSON(`/google/contacts${query ? `?query=${encodeURIComponent(query)}` : ''}`)
export const createContact = (contact) => sendJSON('/google/contacts', 'POST', contact)

export const getMailMessages = (q, pageToken) => {
  const params = new URLSearchParams({ q: q || 'in:inbox' })
  if (pageToken) params.set('pageToken', pageToken)
  return getJSON(`/google/mail/messages?${params.toString()}`)
}
export const getMailMessage = (id) => getJSON(`/google/mail/messages/${id}`)
export const markMailRead = (id, read = true) =>
  sendJSON(`/google/mail/messages/${id}/read`, 'POST', { read })
