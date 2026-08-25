const TONES = {
  red: { glow: 'shadow-red-500/25', accent: 'from-red-500/20 to-transparent' },
  amber: { glow: 'shadow-amber-500/25', accent: 'from-amber-500/20 to-transparent' },
  blue: { glow: 'shadow-sky-500/25', accent: 'from-sky-500/20 to-transparent' },
  green: { glow: 'shadow-emerald-500/25', accent: 'from-emerald-500/20 to-transparent' },
}

export default function StatCard({ label, value, tone = 'blue', icon, sub }) {
  const t = TONES[tone] ?? TONES.blue
  return (
    <div className="glass group relative overflow-hidden rounded-3xl p-5 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-lg">
      <div
        className={`pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${t.accent} blur-xl transition-opacity duration-300`}
      />
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white/55">{label}</span>
        {icon && (
          <span className={`text-white/70 transition-colors duration-200 ${t.glow}`}>
            {icon}
          </span>
        )}
      </div>
      <div className="mt-3 text-4xl font-bold tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-white/45">{sub}</div>}
    </div>
  )
}
