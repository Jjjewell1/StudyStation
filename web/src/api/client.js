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

export const getCourses = () => getJSON('/courses')
export const getAssignments = () => getJSON('/assignments')
