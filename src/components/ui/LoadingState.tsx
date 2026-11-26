import type { ReactNode } from 'react'
import { ProgressBar } from './ProgressBar'
import { cn } from '../../utils/cn'

interface LoadingStateProps {
  label: string
  detail?: string
  progress?: number
  indeterminate?: boolean
  footer?: ReactNode
  className?: string
}

export function LoadingState({
  label,
  detail,
  progress = 0,
  indeterminate = false,
  footer,
  className,
}: LoadingStateProps) {
  return (
    <div className={cn('card w-full p-5 sm:p-6', className)}>
      <p className="text-sm font-semibold text-[var(--text)]">{label}</p>
      {detail && (
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
          {detail}
        </p>
      )}
      <div className="mt-4">
        <ProgressBar value={progress} indeterminate={indeterminate} label={label} />
      </div>
      {footer && <div className="mt-4 text-xs text-[var(--text-subtle)]">{footer}</div>}
    </div>
  )
}
