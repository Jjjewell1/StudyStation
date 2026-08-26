// Clean REST client. The real backend (reading Postgres, populated by the
// nightly Canvas sync) will serve these two endpoints. No backend-specific
// SDK, no Supabase — just fetch against relative /api routes so the same
// build runs identically in dev and self-hosted production.
const BASE = '/api'

let authToken = null
try {
  authToken = localStorage.getItem('studystation_token')
} catch {
  /* SSR / privacy mode */
}

export function setAuthToken(token) {
  authToken = token
  try {
    if (token) localStorage.setItem('studystation_token', token)
    else localStorage.removeItem('studystation_token')
  } catch {
    /* ignore */
  }
}

export function hasAuthToken() {
  return !!authToken
}

function authHeaders(extra = {}) {
  const headers = { ...extra, Accept: 'application/json' }
  if (authToken) headers.Authorization = `Bearer ${authToken}`
  return headers
}

async function getJSON(path) {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() })
  if (!res.ok) {
    throw new Error(`GET ${BASE}${path} failed (${res.status})`)
  }
  return res.json()
}

async function sendJSON(path, method, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: authHeaders({ 'Content-Type': 'application/json' }),
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

// Auth
export const login = (pin) => sendJSON('/auth/login', 'POST', { pin })
export const getAuthStatus = () => getJSON('/auth/status')
export const logout = () => sendJSON('/auth/logout', 'POST')

export const getCourses = () => getJSON('/courses')
export const getAssignments = () => getJSON('/assignments')
export const getResources = () => getJSON('/resources')
export const setAssignmentStatus = (id, status) =>
  sendJSON(`/assignments/${id}/status`, 'PATCH', { status })

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
