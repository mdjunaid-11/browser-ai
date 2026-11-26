import type { AnimalId } from '../../types'
import { cn } from '../../utils/cn'
import { ANIMAL_LIST } from './animalConfig'
import { AnimalAvatar } from './AnimalAvatar'

interface AvatarPickerProps {
  value: AnimalId
  onChange: (animal: AnimalId) => void
  /** Kept for API compatibility; cards are always large and readable now. */
  compact?: boolean
  className?: string
}

/**
 * Responsive companion grid: 2 columns on phones, 3 on tablets and 5 on
 * desktop. Every card is a full illustration with its name underneath.
 */
export function AvatarPicker({
  value,
  onChange,
  compact: _compact = false,
  className,
}: AvatarPickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Choose your companion"
      className={cn(
        'grid w-full min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5',
        className,
      )}
    >
      {ANIMAL_LIST.map((animal) => {
        const active = animal.id === value
        return (
          <button
            key={animal.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${animal.label} — ${animal.tagline}`}
            onClick={() => onChange(animal.id)}
            className={cn(
              'group relative flex min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-4 transition sm:px-3',
              'min-h-[8.5rem] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
              active
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-[0_18px_50px_-26px_rgba(139,92,246,0.95)]'
                : 'border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)]',
            )}
          >
            <span className="grid h-[4.75rem] w-full max-w-[5.5rem] place-items-center overflow-visible">
              <AnimalAvatar
                animal={animal.id}
                state={active ? 'happy' : 'idle'}
                size={76}
                className="max-w-full"
              />
            </span>
            <span className="w-full truncate text-center text-xs font-semibold sm:text-sm">
              {animal.label}
            </span>
            {active && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-[var(--accent)]/50 animate-selection-glow"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
