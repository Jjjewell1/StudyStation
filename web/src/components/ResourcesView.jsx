import { useEffect, useState } from 'react'
import { getResources } from '@/api/client'
import { Icon } from './Icon'

export default function ResourcesView() {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await getResources()
        if (!cancelled) setGroups(data)
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

  return (
    <section className="glass rounded-3xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">Resources</h2>
        <span className="text-xs text-white/45">
          {loading ? '…' : `${groups.reduce((n, g) => n + g.links.length, 0)} links`}
        </span>
      </div>

      {loading && (
        <div className="flex flex-1 items-center justify-center py-16 text-sm text-white/40">
          Loading…
        </div>
      )}

      {!loading && !error && groups.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Icon name="resources" className="h-8 w-8 text-white/25" />
          <p className="text-sm text-white/45">
            No resources yet — the Canvas sync will populate this.
          </p>
        </div>
      )}

      {!loading &&
        groups.map((group) => (
          <div key={group.category} className="mb-6 last:mb-0">
            <h3 className="mb-3 px-1 text-sm font-semibold text-white/75">
              {group.category}
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.links.map((link, i) => (
                <a
                  key={`${link.url}-${i}`}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glass-subtle group flex items-center gap-3 rounded-2xl p-4 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-white/20 hover:shadow-md"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500/30 to-cyan-400/20 text-cyan-300 transition-colors duration-200 group-hover:text-cyan-200">
                    <Icon name="external" className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-white transition-colors duration-200 group-hover:text-cyan-300">
                      {link.title}
                    </span>
                    <span className="block truncate text-xs text-white/40">
                      {link.url.replace(/^https?:\/\//, '').split('/')[0]}
                    </span>
                  </span>
                </a>
              ))}
            </div>
          </div>
        ))}
    </section>
  )
}
