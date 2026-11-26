import type { AnimalId, ModelRuntimeStatus } from '../../types'
import { cn } from '../../utils/cn'
import { describeRuntimeStatus } from '../../ai/models/modelManager'
import { AnimalAvatar } from '../avatar/AnimalAvatar'
import { Icon } from '../ui/Icon'

interface ChatHeaderProps {
  title: string
  avatar: AnimalId
  modelLabel: string
  modelStatus?: ModelRuntimeStatus
  onOpenSidebar: () => void
  onOpenSettings: () => void
  autoSpeak: boolean
  onToggleAutoSpeak: () => void
  speaking: boolean
  onStopSpeak: () => void
  voiceAvailable: boolean
}

export function ChatHeader({
  title,
  avatar,
  modelLabel,
  modelStatus,
  onOpenSidebar,
  onOpenSettings,
  autoSpeak,
  onToggleAutoSpeak,
  speaking,
  onStopSpeak,
  voiceAvailable,
}: ChatHeaderProps) {
  const downloading =
    modelStatus?.state === 'downloading' || modelStatus?.state === 'loading'
  const ready = modelStatus?.state === 'ready'

  return (
    <header className="glass sticky top-0 z-20 border-b border-[var(--border-subtle)]">
      <div className="flex items-center gap-2 px-3 py-2.5 sm:px-5">
        <button
          type="button"
          className="btn-icon md:hidden"
          onClick={onOpenSidebar}
          aria-label="Open conversations"
        >
          <Icon name="menu" size={19} />
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="hidden sm:block">
            <AnimalAvatar
              animal={avatar}
              state={speaking ? 'speaking' : 'idle'}
              size={34}
            />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-[var(--text)]">
              {title}
            </h1>
            <p className="flex items-center gap-1.5 truncate text-[10px] text-[var(--text-subtle)]">
              <span
                className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  ready
                    ? 'bg-emerald-400'
                    : downloading
                      ? 'animate-pulse bg-amber-400'
                      : modelStatus?.state === 'error'
                        ? 'bg-rose-400'
                        : 'bg-[var(--text-subtle)]',
                )}
              />
              <span className="truncate">
                {modelLabel} · {describeRuntimeStatus(modelStatus)}
              </span>
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {voiceAvailable && (
            <button
              type="button"
              onClick={speaking ? onStopSpeak : onToggleAutoSpeak}
              className={cn(
                'btn-icon',
                (autoSpeak || speaking) &&
                  'bg-[var(--accent-soft)] text-[var(--accent)]',
              )}
              aria-label={
                speaking
                  ? 'Stop speaking'
                  : autoSpeak
                    ? 'Disable spoken replies'
                    : 'Enable spoken replies'
              }
              title={
                speaking
                  ? 'Stop speaking'
                  : autoSpeak
                    ? 'Spoken replies on'
                    : 'Spoken replies off'
              }
            >
              <Icon
                name={speaking ? 'stop' : autoSpeak ? 'volume' : 'volume-off'}
                size={18}
              />
            </button>
          )}
          <button
            type="button"
            className="btn-icon"
            onClick={onOpenSettings}
            aria-label="Open settings"
            title="Settings"
          >
            <Icon name="settings" size={18} />
          </button>
        </div>
      </div>

      {downloading && (
        <div className="h-0.5 w-full bg-[var(--surface-3)]">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-[width] duration-300"
            style={{
              width: `${Math.max(3, Math.round((modelStatus?.progress ?? 0) * 100))}%`,
            }}
          />
        </div>
      )}
    </header>
  )
}
