import { Icon } from './Icon'

export default function EmptyState({ icon = 'sparkle', title, hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-3xl bg-white/5 text-white/25 ring-1 ring-white/10">
        <Icon name={icon} className="h-8 w-8" />
      </div>
      <div className="text-sm font-semibold text-white/60">{title}</div>
      {hint && (
        <div className="max-w-xs text-xs leading-relaxed text-white/40">{hint}</div>
      )}
      {action}
    </div>
  )
}