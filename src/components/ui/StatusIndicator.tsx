import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

export type StatusTone = 'neutral' | 'ready' | 'busy' | 'error' | 'warning'

const TONES: Record<StatusTone, { dot: string; text: string }> = {
  neutral: { dot: 'bg-[var(--text-subtle)]', text: 'text-[var(--text-muted)]' },
  ready: { dot: 'bg-emerald-400', text: 'text-emerald-300' },
  busy: { dot: 'bg-amber-400', text: 'text-amber-300' },
  error: { dot: 'bg-rose-400', text: 'text-rose-300' },
  warning: { dot: 'bg-amber-400', text: 'text-amber-300' },
}

interface StatusIndicatorProps {
  tone?: StatusTone
  pulse?: boolean
  children: ReactNode
  className?: string
}

export function StatusIndicator({
  tone = 'neutral',
  pulse = false,
  children,
  className,
}: StatusIndicatorProps) {
  const colors = TONES[tone]
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-2 text-xs font-medium',
        colors.text,
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'h-2 w-2 shrink-0 rounded-full',
          colors.dot,
          pulse && 'animate-soft-pulse',
        )}
      />
      <span className="min-w-0">{children}</span>
    </span>
  )
}
