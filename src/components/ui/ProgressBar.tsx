import { cn } from '../../utils/cn'

interface ProgressBarProps {
  value: number
  label?: string
  detail?: string
  indeterminate?: boolean
  className?: string
  tone?: 'accent' | 'success' | 'warning'
}

export function ProgressBar({
  value,
  label,
  detail,
  indeterminate = false,
  className,
  tone = 'accent',
}: ProgressBarProps) {
  const percent = Math.max(0, Math.min(100, Math.round(value * 100)))
  const toneClass =
    tone === 'success'
      ? 'from-emerald-400 to-teal-400'
      : tone === 'warning'
        ? 'from-amber-400 to-orange-400'
        : 'from-violet-500 via-fuchsia-500 to-indigo-400'

  return (
    <div className={cn('w-full', className)}>
      {(label || detail) && (
        <div className="mb-2 flex items-center justify-between gap-3 text-xs">
          <span className="truncate font-medium text-[var(--text-secondary)]">
            {label}
          </span>
          {detail && (
            <span className="shrink-0 tabular-nums text-[var(--text-subtle)]">
              {detail}
            </span>
          )}
        </div>
      )}
      <div
        className="relative h-2 overflow-hidden rounded-full bg-[var(--surface-4)]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : percent}
        aria-label={label ?? 'Progress'}
      >
        <div
          className={cn(
            'h-full rounded-full bg-gradient-to-r transition-[width] duration-300 ease-out',
            toneClass,
            indeterminate && 'w-1/3 animate-progress-slide',
          )}
          style={indeterminate ? undefined : { width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
