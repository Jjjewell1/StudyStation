import { useEffect, useState } from 'react'
import { getContacts, createContact } from '@/api/client'
import { Icon } from './Icon'

export default function ContactsView() {
  const [contacts, setContacts] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getContacts()
      .then(setContacts)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function search(e) {
    const q = e.target.value
    setQuery(q)
    try {
      setContacts(await getContacts(q))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="glass rounded-3xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">Contacts</h2>
        <span className="text-xs text-white/45">{loading ? '…' : `${contacts.length} people`}</span>
      </div>

      <div className="glass-subtle mb-4 flex items-center gap-3 rounded-2xl px-4 py-2.5 focus-within:border-white/20">
        <Icon name="search" className="h-5 w-5 text-white/40" />
        <input
          value={query}
          onChange={search}
          placeholder="Search contacts…"
          className="w-full bg-transparent text-sm text-white placeholder-white/40 outline-none"
        />
      </div>

      {error && <p className="mb-3 text-sm text-red-300">{error}</p>}
      {loading && <div className="py-10 text-center text-sm text-white/40">Loading…</div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {contacts.map((c) => (
          <div
            key={c.resourceName}
            className="glass-subtle flex items-center gap-3 rounded-2xl p-4 transition-all duration-200 hover:border-white/20"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500/40 to-cyan-400/30 text-sm font-bold text-white">
              {(c.name || '?')[0].toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">{c.name}</div>
              {c.email && <div className="truncate text-xs text-white/45">{c.email}</div>}
              {c.phone && <div className="truncate text-xs text-white/45">{c.phone}</div>}
            </div>
          </div>
        ))}
      </div>

      {!loading && contacts.length === 0 && (
        <div className="py-10 text-center text-sm text-white/45">No contacts found.</div>
      )}
    </section>
  )
}
