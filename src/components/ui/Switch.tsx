import { cn } from '../../utils/cn'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
  className?: string
}

export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
  className,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-checked={checked ? 'true' : 'false'}
      className={cn('switch', disabled && 'opacity-50', className)}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-thumb" />
    </button>
  )
}

interface ToggleRowProps {
  title: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export function ToggleRow({
  title,
  description,
  checked,
  onChange,
  disabled,
}: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--text)]">{title}</p>
        {description && (
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-subtle)]">
            {description}
          </p>
        )}
      </div>
      <Switch
        checked={checked}
        onChange={onChange}
        label={title}
        disabled={disabled}
        className="mt-0.5"
      />
    </div>
  )
}
