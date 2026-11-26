import { useEffect, useRef } from 'react'
import type { AnimalId, AvatarState } from '../../types'
import { cn } from '../../utils/cn'
import { speechLevel } from '../../services/audio/speechLevel'
import { AnimalAvatar } from './AnimalAvatar'

const STATE_LABELS: Record<AvatarState, { title: string; detail: string }> = {
  idle: { title: 'Ready', detail: 'Say hello or type a message' },
  listening: { title: 'Listening', detail: 'Speak now — I am all ears' },
  thinking: { title: 'Thinking', detail: 'Working through your message' },
  speaking: { title: 'Speaking', detail: 'Reading the answer aloud' },
  happy: { title: 'Happy', detail: 'That went well' },
  error: { title: 'Oops', detail: 'Something needs attention' },
}

interface AvatarPanelProps {
  animal: AnimalId
  state: AvatarState
  size?: number
  level?: number
  showWaveform?: boolean
  compact?: boolean
  className?: string
}

export function AvatarPanel({
  animal,
  state,
  size = 170,
  level = 0,
  showWaveform = true,
  compact = false,
  className,
}: AvatarPanelProps) {
  const label = STATE_LABELS[state]

  return (
    <div
      className={cn(
        'flex flex-col items-center text-center',
        compact ? 'gap-2' : 'gap-3',
        className,
      )}
    >
      <div className="relative">
        {state === 'listening' && (
          <div className="absolute inset-0 -z-10 animate-pulse rounded-full bg-emerald-400/10 blur-2xl" />
        )}
        {state === 'speaking' && (
          <div className="absolute inset-0 -z-10 animate-pulse rounded-full bg-violet-400/15 blur-2xl" />
        )}
        <AnimalAvatar animal={animal} state={state} size={size} />
      </div>

      <div className="space-y-0.5">
        <p className="text-sm font-semibold text-[var(--text)]">{label.title}</p>
        {!compact && (
          <p className="text-xs text-[var(--text-subtle)]">{label.detail}</p>
        )}
      </div>

      {showWaveform && (state === 'listening' || state === 'speaking') && (
        <Waveform state={state} level={level} />
      )}
    </div>
  )
}

function Waveform({ state, level }: { state: AvatarState; level: number }) {
  const barsRef = useRef<Array<HTMLSpanElement | null>>([])

  useEffect(() => {
    if (state !== 'speaking') return
    let frame = 0
    const bars = barsRef.current.filter(Boolean) as HTMLSpanElement[]
    if (bars.length === 0) return

    const animate = () => {
      const value = speechLevel.getLevel()
      for (let i = 0; i < bars.length; i += 1) {
        const wobble = 0.45 + 0.55 * Math.abs(Math.sin(performance.now() / (120 + i * 23) + i))
        bars[i].style.transform = `scaleY(${Math.max(0.18, value * wobble).toFixed(3)})`
      }
      frame = requestAnimationFrame(animate)
    }
    animate()
    return () => cancelAnimationFrame(frame)
  }, [state])

  const count = 9
  return (
    <div
      className="flex h-8 items-center justify-center gap-1"
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, index) => {
        const base = state === 'listening' ? level : 0.3
        const variance =
          state === 'listening'
            ? 0.4 + 0.6 * Math.abs(Math.sin((index + 1) * 1.7))
            : 1
        return (
          <span
            key={index}
            ref={(element) => {
              barsRef.current[index] = element
            }}
            className={cn(
              'w-1.5 rounded-full transition-transform duration-100',
              state === 'listening' ? 'bg-emerald-400' : 'bg-violet-400',
            )}
            style={{
              height: '100%',
              transform: `scaleY(${Math.max(0.18, base * variance).toFixed(3)})`,
              transformOrigin: 'center',
            }}
          />
        )
      })}
    </div>
  )
}
