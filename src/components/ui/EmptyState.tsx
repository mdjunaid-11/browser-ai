import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex min-h-0 flex-col items-center justify-center px-4 py-10 text-center',
        className,
      )}
    >
      {icon && (
        <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          {icon}
        </div>
      )}
      <h2 className="text-base font-semibold text-[var(--text)]">{title}</h2>
      {description && (
        <p className="mt-1 max-w-md text-xs leading-relaxed text-[var(--text-muted)]">
          {description}
        </p>
      )}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}
