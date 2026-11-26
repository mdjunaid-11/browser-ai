import { cn } from '../../utils/cn'

export function BrandMark({
  size = 40,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500 via-indigo-500 to-fuchsia-500 shadow-[0_8px_30px_-8px_rgba(139,92,246,0.7)]',
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 40 40"
        width={size}
        height={size}
        className="absolute inset-0 h-full w-full opacity-30"
      >
        <circle cx="30" cy="8" r="16" fill="white" />
        <circle cx="8" cy="34" r="12" fill="white" />
      </svg>
      <svg
        viewBox="0 0 40 40"
        width={size * 0.68}
        height={size * 0.68}
        fill="none"
        className="relative"
        aria-hidden="true"
      >
        <path
          d="M11 17c0-5.5 4-9.5 9-9.5s9 4 9 9.5c0 6.2-4 10.5-9 10.5s-9-4.3-9-10.5Z"
          fill="white"
          fillOpacity="0.95"
        />
        <path
          d="M11.5 15.5 10 9.5l5 3.2M28.5 15.5 30 9.5l-5 3.2"
          stroke="white"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="16.4" cy="18" r="1.35" fill="#5b21b6" />
        <circle cx="23.6" cy="18" r="1.35" fill="#5b21b6" />
        <path
          d="M18.4 21.7c1 .9 2.2.9 3.2 0"
          stroke="#5b21b6"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path d="M20 22.8v1.3" stroke="#5b21b6" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </div>
  )
}

export function BrandWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark size={compact ? 34 : 40} />
      <div className="leading-tight">
        <p className="text-[15px] font-bold tracking-tight text-[var(--text)]">
          Browser AI
        </p>
        {!compact && (
          <p className="text-[11px] font-medium text-[var(--text-subtle)]">
            local · private · adaptive
          </p>
        )}
      </div>
    </div>
  )
}
