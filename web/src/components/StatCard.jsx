import { useEffect, useRef, useState } from 'react'

const TONES = {
  red: {
    glow: 'shadow-red-500/25',
    accent: 'from-red-500/20 to-transparent',
    chip: 'from-red-500/25 to-red-500/5 text-red-300 ring-red-400/20',
    number: 'from-rose-300 to-red-400',
  },
  amber: {
    glow: 'shadow-amber-500/25',
    accent: 'from-amber-500/20 to-transparent',
    chip: 'from-amber-500/25 to-amber-500/5 text-amber-300 ring-amber-400/20',
    number: 'from-amber-200 to-amber-400',
  },
  blue: {
    glow: 'shadow-sky-500/25',
    accent: 'from-sky-500/20 to-transparent',
    chip: 'from-sky-500/25 to-sky-500/5 text-sky-300 ring-sky-400/20',
    number: 'from-sky-200 to-sky-400',
  },
  green: {
    glow: 'shadow-emerald-500/25',
    accent: 'from-emerald-500/20 to-transparent',
    chip: 'from-emerald-500/25 to-emerald-500/5 text-emerald-300 ring-emerald-400/20',
    number: 'from-emerald-200 to-emerald-400',
  },
}

function useCountUp(value) {
  const [display, setDisplay] = useState(value)
  const prev = useRef(value)

  useEffect(() => {
    const target = Number(value)
    if (Number.isNaN(target)) {
      setDisplay(value)
      prev.current = value
      return
    }
    const from = Number(prev.current)
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (Number.isNaN(from) || target === from || reduce) {
      setDisplay(target)
      prev.current = value
      return
    }
    const dur = 650
    const t0 = performance.now()
    let raf
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(from + (target - from) * eased))
      if (p < 1) raf = requestAnimationFrame(step)
      else {
        setDisplay(target)
        prev.current = value
      }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])

  return display
}

export default function StatCard({ label, value, tone = 'blue', icon, sub, active, onClick }) {
  const t = TONES[tone] ?? TONES.blue
  const Comp = onClick ? 'button' : 'div'
  const shown = useCountUp(value)

  return (
    <Comp
      onClick={onClick}
      className={`glass group relative overflow-hidden rounded-3xl p-5 text-left transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-xl ${
        onClick ? 'cursor-pointer' : ''
      } ${active ? 'ring-2 ring-cyan-300/40 shadow-[0_0_0_1px_rgba(34,211,238,0.2)]' : ''}`}
    >
      <div
        className={`pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${t.accent} blur-xl transition-opacity duration-300 group-hover:opacity-100`}
      />
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white/55">{label}</span>
        {icon && (
          <span
            className={`grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br ring-1 ${t.chip} transition-transform duration-300 group-hover:scale-105`}
          >
            {icon}
          </span>
        )}
      </div>
      <div
        className={`mt-3 bg-gradient-to-br bg-clip-text text-4xl font-bold tracking-tight text-transparent ${t.number}`}
      >
        {shown}
      </div>
      {sub && <div className="mt-1 text-xs text-white/45">{sub}</div>}
      {onClick && (
        <span className="absolute bottom-4 right-4 opacity-0 transition-opacity duration-200 group-hover:opacity-60">
          →
        </span>
      )}
    </Comp>
  )
}