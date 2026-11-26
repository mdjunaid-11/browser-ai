import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

interface SelectionCardProps {
  selected: boolean
  onSelect: () => void
  label: string
  badge?: ReactNode
  children: ReactNode
  className?: string
  disabled?: boolean
}

/** Reusable radio-style card with a large, touch-friendly hit area. */
export function SelectionCard({
  selected,
  onSelect,
  label,
  badge,
  children,
  className,
  disabled = false,
}: SelectionCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'relative flex min-h-28 min-w-0 flex-col rounded-2xl border p-4 text-left transition',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
        selected
          ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-[0_18px_50px_-28px_rgba(139,92,246,0.9)]'
          : 'border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)]',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      {badge && <div className="mb-2 flex flex-wrap gap-1.5">{badge}</div>}
      <div className="min-w-0 flex-1">{children}</div>
      {selected && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-[var(--accent)]/40 animate-selection-glow"
        />
      )}
    </button>
  )
}
