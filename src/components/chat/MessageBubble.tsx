import { useState } from 'react'
import type { AnimalId, ChatMessage } from '../../types'
import { cn } from '../../utils/cn'
import { formatClock, formatDuration } from '../../utils/format'
import { getModelById } from '../../ai/models/modelRegistry'
import { AnimalAvatar } from '../avatar/AnimalAvatar'
import { Icon } from '../ui/Icon'
import { RichText } from './RichText'

interface MessageBubbleProps {
  message: ChatMessage
  animal: AnimalId
  streaming: boolean
  canSpeak: boolean
  speaking: boolean
  canRegenerate: boolean
  disabled: boolean
  onSpeak: (text: string) => void
  onStopSpeak: () => void
  onRegenerate: () => void
  onDelete: (id: string) => void
}

export function MessageBubble({
  message,
  animal,
  streaming,
  canSpeak,
  speaking,
  canRegenerate,
  disabled,
  onSpeak,
  onStopSpeak,
  onRegenerate,
  onDelete,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'
  const model = message.modelId ? getModelById(message.modelId) : undefined
  const showTyping = streaming && !message.content.trim()

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard access may be denied.
    }
  }

  if (isUser) {
    return (
      <article className="group flex animate-message-in justify-end gap-2">
        <div className="flex max-w-[85%] flex-col items-end gap-1 sm:max-w-[75%]">
          <div className="rounded-2xl rounded-br-md border border-[var(--border)] bg-[var(--surface-3)] px-4 py-2.5 text-[15px] leading-relaxed text-[var(--text)] shadow-sm">
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1 touch-visible-actions transition">
            <span className="mr-1 text-[10px] text-[var(--text-subtle)]">
              {formatClock(message.createdAt)}
            </span>
            <button
              type="button"
              className="btn-icon h-6 w-6"
              onClick={() => void copy()}
              aria-label={copied ? 'Copied' : 'Copy message'}
              title={copied ? 'Copied' : 'Copy'}
            >
              <Icon name={copied ? 'check' : 'copy'} size={12} />
            </button>
            <button
              type="button"
              className="btn-icon h-6 w-6 hover:text-rose-300"
              onClick={() => onDelete(message.id)}
              aria-label="Delete message"
              title="Delete message"
              disabled={disabled}
            >
              <Icon name="trash" size={12} />
            </button>
          </div>
        </div>
      </article>
    )
  }

  return (
    <article className="group flex animate-message-in items-start gap-2.5 sm:gap-3">
      <div className="mt-0.5 shrink-0">
        <AnimalAvatar
          animal={animal}
          state={
            message.status === 'error'
              ? 'error'
              : streaming
                ? 'thinking'
                : speaking
                  ? 'speaking'
                  : 'idle'
          }
          size={34}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'rounded-2xl rounded-tl-md border px-4 py-3 shadow-sm',
            message.status === 'error'
              ? 'border-rose-500/30 bg-rose-500/5'
              : 'border-[var(--border-subtle)] bg-[var(--surface-2)]',
          )}
        >
          {showTyping ? (
            <div className="flex items-center gap-1.5 py-1" aria-label="Thinking">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          ) : message.content ? (
            <div className="message-content">
              <RichText text={message.content} />
              {streaming && (
                <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-[var(--accent)] align-middle" />
              )}
            </div>
          ) : (
            <p className="text-sm italic text-[var(--text-subtle)]">
              No response was produced.
            </p>
          )}

          {message.status === 'stopped' && (
            <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-amber-300">
              <Icon name="stop" size={11} />
              Stopped early
            </p>
          )}

          {message.status === 'error' && message.error && (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-rose-300">
              <Icon name="alert" size={12} className="mt-0.5 shrink-0" />
              {message.error}
            </p>
          )}
        </div>

        <div className="mt-1 flex min-h-6 flex-wrap items-center gap-1.5 px-1">
          <span className="text-[10px] text-[var(--text-subtle)]">
            {formatClock(message.createdAt)}
          </span>
          {model && (
            <span className="hidden text-[10px] text-[var(--text-subtle)] sm:inline">
              · {model.label}
            </span>
          )}
          {message.durationMs ? (
            <span className="text-[10px] text-[var(--text-subtle)]">
              · {formatDuration(message.durationMs)}
              {message.tokensPerSecond
                ? ` · ${message.tokensPerSecond.toFixed(1)} tok/s`
                : ''}
            </span>
          ) : null}

          <div className="ml-auto flex flex-wrap items-center justify-end gap-0.5 touch-visible-actions transition">
            <button
              type="button"
              className="btn-icon h-6 w-6"
              onClick={() => void copy()}
              aria-label={copied ? 'Copied' : 'Copy response'}
              title={copied ? 'Copied' : 'Copy'}
              disabled={!message.content}
            >
              <Icon name={copied ? 'check' : 'copy'} size={12} />
            </button>
            {canSpeak && (
              <button
                type="button"
                className={cn(
                  'btn-icon h-6 w-6',
                  speaking && 'bg-[var(--accent-soft)] text-[var(--accent)]',
                )}
                onClick={() =>
                  speaking ? onStopSpeak() : onSpeak(message.content)
                }
                aria-label={speaking ? 'Stop speaking' : 'Read aloud'}
                title={speaking ? 'Stop speaking' : 'Read aloud'}
                disabled={!message.content || streaming}
              >
                <Icon name={speaking ? 'stop' : 'volume'} size={12} />
              </button>
            )}
            {canRegenerate && (
              <button
                type="button"
                className="btn-icon h-6 w-6"
                onClick={onRegenerate}
                aria-label="Regenerate response"
                title="Regenerate"
                disabled={disabled || streaming}
              >
                <Icon name="refresh" size={12} />
              </button>
            )}
            <button
              type="button"
              className="btn-icon h-6 w-6 hover:text-rose-300"
              onClick={() => onDelete(message.id)}
              aria-label="Delete response"
              title="Delete response"
              disabled={disabled || streaming}
            >
              <Icon name="trash" size={12} />
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}
