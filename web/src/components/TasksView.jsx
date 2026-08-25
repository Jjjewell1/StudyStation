import { useEffect, useState } from 'react'
import { getTaskLists, getTasks, createTask, updateTask, deleteTask } from '@/api/client'
import { Icon } from './Icon'

export default function TasksView() {
  const [lists, setLists] = useState([])
  const [activeList, setActiveList] = useState(null)
  const [tasks, setTasks] = useState([])
  const [newTitle, setNewTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getTaskLists()
      .then((ls) => {
        setLists(ls)
        if (ls.length) setActiveList(ls[0].id)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!activeList) return
    setLoading(true)
    getTasks(activeList)
      .then(setTasks)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [activeList])

  async function addTask(e) {
    e.preventDefault()
    if (!newTitle.trim() || !activeList) return
    const created = await createTask(activeList, newTitle.trim())
    setTasks((prev) => [...prev, { ...created, completed: false }])
    setNewTitle('')
  }

  async function toggle(task) {
    await updateTask(activeList, task.id, { completed: !task.completed })
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completed: !task.completed } : t)))
  }

  async function remove(task) {
    await deleteTask(activeList, task.id)
    setTasks((prev) => prev.filter((t) => t.id !== task.id))
  }

  const pending = tasks.filter((t) => !t.completed)
  const done = tasks.filter((t) => t.completed)

  return (
    <section className="glass rounded-3xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">Tasks</h2>
        {lists.length > 1 && (
          <select
            value={activeList ?? ''}
            onChange={(e) => setActiveList(e.target.value)}
            className="rounded-xl bg-white/10 px-3 py-1.5 text-sm text-white outline-none"
          >
            {lists.map((l) => (
              <option key={l.id} value={l.id} className="bg-slate-800">
                {l.title}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-red-300">{error}</p>}

      <form onSubmit={addTask} className="mb-4 flex items-center gap-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a task…"
          className="glass-subtle flex-1 rounded-2xl px-4 py-2.5 text-sm text-white placeholder-white/40 outline-none transition-colors focus:border-white/20"
        />
        <button
          type="submit"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-white shadow-lg shadow-indigo-500/25 transition-transform hover:scale-105 active:scale-95"
          aria-label="Add task"
        >
          <Icon name="add" className="h-5 w-5" />
        </button>
      </form>

      {loading && <div className="py-10 text-center text-sm text-white/40">Loading…</div>}

      {!loading && pending.length === 0 && done.length === 0 && (
        <div className="py-10 text-center text-sm text-white/45">No tasks — add one above.</div>
      )}

      {pending.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {pending.map((t) => (
            <div
              key={t.id}
              className="glass-subtle group flex items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-200 hover:border-white/20"
            >
              <button
                onClick={() => toggle(t)}
                className="grid h-5 w-5 shrink-0 place-items-center rounded-md border border-white/25 text-transparent transition-colors hover:border-cyan-300"
                aria-label="Mark complete"
              />
              <span className="min-w-0 flex-1 truncate text-sm text-white">{t.title}</span>
              {t.due && <span className="shrink-0 text-xs text-white/40">{t.due.slice(0, 10)}</span>}
              <button
                onClick={() => remove(t)}
                className="shrink-0 text-white/30 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-300"
                aria-label="Delete task"
              >
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {done.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-white/40">
            Completed ({done.length})
          </div>
          <div className="flex flex-col gap-1.5">
            {done.map((t) => (
              <div
                key={t.id}
                className="glass-subtle group flex items-center gap-3 rounded-2xl px-4 py-2.5 transition-all duration-200 hover:border-white/20"
              >
                <button
                  onClick={() => toggle(t)}
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-cyan-400/20 text-cyan-300"
                  aria-label="Mark incomplete"
                >
                  <Icon name="tasks" className="h-4 w-4" />
                </button>
                <span className="min-w-0 flex-1 truncate text-sm text-white/45 line-through">{t.title}</span>
                <button
                  onClick={() => remove(t)}
                  className="shrink-0 text-white/30 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-300"
                  aria-label="Delete task"
                >
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
