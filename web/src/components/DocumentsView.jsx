import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import {
  askCourseDocuments,
  courseDocumentUrl,
  deleteCourseDocument,
  getChatConfig,
  getCourseDocuments,
  uploadCourseDocuments,
} from '@/api/client'

function formatBytes(n) {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  return `${v.toFixed(i === 0 || v >= 10 ? 0 : 1)} ${units[i]}`
}

export default function DocumentsView({ courses }) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? null)
  const [docs, setDocs] = useState(null) // null = loading
  const [loadError, setLoadError] = useState(null)
  const [errors, setErrors] = useState([]) // per-file upload errors
  const [uploading, setUploading] = useState(false)
  const [configured, setConfigured] = useState(true)
  const [msg, setMsg] = useState('')
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    getChatConfig()
      .then((c) => setConfigured(c.configured))
      .catch(() => setConfigured(false))
  }, [])

  useEffect(() => {
    if (!courseId && courses.length > 0) setCourseId(courses[0].id)
  }, [courses, courseId])

  const course = courses.find((c) => String(c.id) === String(courseId))

  function refresh() {
    if (!courseId) return
    setDocs(null)
    setLoadError(null)
    getCourseDocuments(courseId)
      .then((r) => setDocs(r.documents))
      .catch((e) => {
        setDocs([])
        setLoadError(e.message)
      })
  }

  useEffect(() => {
    refresh()
    setHistory([])
    setErrors([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [history, busy])

  async function onPick(e) {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (!files.length || !courseId) return
    setUploading(true)
    setErrors([])
    try {
      const res = await uploadCourseDocuments(courseId, files)
      setErrors(res.errors || [])
      refresh()
    } catch (err) {
      setErrors([{ filename: '—', error: err.message }])
    } finally {
      setUploading(false)
    }
  }

  async function onDelete(doc) {
    if (!window.confirm(`Delete "${doc.filename}"?`)) return
    try {
      await deleteCourseDocument(courseId, doc.id)
      refresh()
    } catch (err) {
      setErrors([{ filename: doc.filename, error: err.message }])
    }
  }

  async function ask(e) {
    e.preventDefault()
    if (!msg.trim() || busy) return
    const text = msg.trim()
    setMsg('')
    setErrors([])
    const next = [...history, { role: 'user', text }]
    setHistory(next)
    setBusy(true)
    try {
      const { reply } = await askCourseDocuments(courseId, text, history)
      setHistory([...next, { role: 'assistant', text: reply }])
    } catch (err) {
      setHistory([...next, { role: 'assistant', text: 'Sorry — ' + err.message }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="glass rounded-3xl p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Documents</h2>
          <p className="mt-0.5 text-xs text-white/45">
            Upload books, PDFs, and notes per class — then ask questions about them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={courseId ?? ''}
            onChange={(e) => setCourseId(e.target.value || null)}
            className="glass-subtle max-w-[220px] rounded-2xl border border-transparent px-3 py-2 text-sm text-white outline-none transition-colors focus:border-white/20 [&>option]:bg-slate-900"
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.short}
              </option>
            ))}
          </select>
          <input ref={fileRef} type="file" multiple hidden onChange={onPick} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading || !courseId}
            className="flex shrink-0 items-center gap-2 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-50"
          >
            <Icon name="add" className="h-4 w-4" />
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>

      {!course && courses.length === 0 && (
        <div className="rounded-2xl bg-white/5 px-4 py-8 text-center text-sm text-white/45">
          No classes available. Run a Canvas sync first.
        </div>
      )}

      {course && (
        <>
          {loadError && (
            <div className="mb-3 rounded-2xl bg-red-500/10 px-4 py-2 text-sm text-red-200">
              Couldn&apos;t load documents: {loadError}
            </div>
          )}

          {errors.length > 0 && (
            <div className="mb-3 flex flex-col gap-1 rounded-2xl bg-amber-400/10 px-4 py-3 text-sm">
              {errors.map((err, i) => (
                <div key={i} className="text-amber-200">
                  <span className="font-semibold">{err.filename}:</span> {err.error}
                </div>
              ))}
            </div>
          )}

          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
            {course.name}
          </p>

          <div className="flex flex-col gap-2">
            {docs === null && (
              <div className="py-4 text-center text-sm text-white/45">Loading documents…</div>
            )}
            {docs !== null && docs.length === 0 && (
              <div className="rounded-2xl bg-white/5 px-4 py-10 text-center text-sm text-white/45">
                No documents uploaded for this class yet. Supported: PDF, DOCX, TXT/MD, CSV, JSON,
                HTML (up to 50 MB per file).
              </div>
            )}
            {docs?.map((d) => (
              <div
                key={d.id}
                className="glass-subtle flex items-center gap-3 rounded-2xl p-3"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500/30 to-cyan-400/20 text-cyan-300">
                  <Icon name="book" className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-white">{d.filename}</div>
                  <div className="text-xs text-white/45">
                    {formatBytes(d.sizeBytes)} · {d.chunkCount} chunks ·{' '}
                    {d.createdAt ? new Date(d.createdAt).toLocaleDateString() : ''}
                  </div>
                </div>
                <a
                  href={courseDocumentUrl(courseId, d.id)}
                  download={d.filename}
                  className="shrink-0 rounded-xl bg-white/5 px-3 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                >
                  Download
                </a>
                <button
                  onClick={() => onDelete(d)}
                  className="shrink-0 rounded-xl bg-white/5 px-3 py-1.5 text-xs text-white/60 transition-colors hover:bg-red-500/15 hover:text-red-300"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>

          <div className="mt-6 border-t border-white/10 pt-5">
            <div className="mb-3 flex items-center gap-2 px-1">
              <Icon name="chat" className="h-5 w-5 text-cyan-300" />
              <span className="text-sm font-semibold">
                Ask about {course.short}&apos;s documents
              </span>
              {!configured && (
                <span className="ml-auto rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                  Not configured
                </span>
              )}
            </div>

            {history.length > 0 && (
              <div
                ref={scrollRef}
                className="mb-3 flex max-h-80 flex-col gap-2 overflow-y-auto pr-1"
              >
                {history.map((h, i) => (
                  <div
                    key={i}
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      h.role === 'user'
                        ? 'self-end bg-gradient-to-br from-indigo-500/40 to-cyan-400/20 text-white'
                        : 'self-start bg-white/5 text-white/85'
                    }`}
                  >
                    {h.text}
                  </div>
                ))}
                {busy && (
                  <div className="self-start rounded-2xl bg-white/5 px-3 py-2 text-sm text-white/45">
                    Thinking…
                  </div>
                )}
              </div>
            )}

            {!configured && (
              <p className="mb-3 rounded-2xl bg-white/5 px-3 py-2 text-xs text-white/55">
                Set <code>GEMINI_API_KEY</code> in the API environment to enable Q&amp;A over
                your documents.
              </p>
            )}

            <form onSubmit={ask} className="flex items-center gap-2">
              <input
                type="text"
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                placeholder={
                  configured
                    ? "e.g. What does chapter 3 say about rendezvous?"
                    : 'Q&A not configured yet'
                }
                disabled={!configured || busy || !docs?.length}
                className="glass-subtle flex-1 rounded-2xl px-4 py-2.5 text-sm text-white placeholder-white/40 outline-none transition-colors duration-200 focus:border-white/20 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!configured || busy || !msg.trim() || !docs?.length}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-white shadow-lg shadow-indigo-500/25 transition-transform duration-200 hover:scale-105 active:scale-95 disabled:opacity-50"
                aria-label="Ask"
              >
                <Icon name="send" className="h-5 w-5" />
              </button>
            </form>
            {docs !== null && docs.length === 0 && (
              <p className="mt-2 text-[11px] text-white/40">
                Upload at least one document above before asking.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  )
}