import type { AnimalId } from '../../types'
import { cn } from '../../utils/cn'
import { ANIMAL_LIST } from './animalConfig'
import { AnimalAvatar } from './AnimalAvatar'

interface AvatarPickerProps {
  value: AnimalId
  onChange: (animal: AnimalId) => void
  compact?: boolean
}

export function AvatarPicker({
  value,
  onChange,
  compact = false,
}: AvatarPickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Choose your companion"
      className={cn(
        'grid gap-2',
        compact ? 'grid-cols-5 sm:grid-cols-9' : 'grid-cols-3 sm:grid-cols-5',
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
              'group relative flex flex-col items-center gap-1 rounded-2xl border p-2 transition',
              active
                ? 'border-[var(--border-strong)] bg-[var(--accent-soft)] shadow-[0_8px_30px_-16px_rgba(139,92,246,0.9)]'
                : 'border-transparent bg-[var(--surface-2)] hover:border-[var(--border)] hover:bg-[var(--surface-3)]',
            )}
          >
            <AnimalAvatar
              animal={animal.id}
              state={active ? 'happy' : 'idle'}
              size={compact ? 46 : 62}
            />
            <span
              className={cn(
                'text-[11px] font-semibold',
                active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]',
              )}
            >
              {animal.label}
            </span>
            {active && (
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            )}
          </button>
        )
      })}
    </div>
  )
}
