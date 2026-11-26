import { useEffect, useRef, useState } from 'react'
import type { VoiceMode } from '../../types'
import { cn } from '../../utils/cn'
import { Icon } from '../ui/Icon'
import type { VoiceInputState } from '../../hooks/useVoiceInput'

interface ComposerProps {
  draft: string
  onDraftChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  isGenerating: boolean
  voiceMode: VoiceMode
  voiceState: VoiceInputState
  voiceLevel: number
  voiceError: string | null
  micSupported: boolean
  onStartListening: () => void
  onStopListening: () => void
  onCancelListening: () => void
}

export function Composer({
  draft,
  onDraftChange,
  onSend,
  onStop,
  isGenerating,
  voiceMode,
  voiceState,
  voiceLevel,
  voiceError,
  micSupported,
  onStartListening,
  onStopListening,
  onCancelListening,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [holding, setHolding] = useState(false)

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(180, Math.max(48, textarea.scrollHeight))}px`
  }, [draft])

  useEffect(() => {
    if (!isGenerating) textareaRef.current?.focus()
  }, [isGenerating])

  const submit = () => {
    if (isGenerating || !draft.trim()) return
    onSend()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  const recording = voiceState === 'recording'
  const requesting = voiceState === 'requesting'
  const transcribing = voiceState === 'transcribing'
  const busy = requesting || transcribing

  const startPushToTalk = () => {
    if (recording || busy) return
    setHolding(true)
    onStartListening()
  }

  const stopPushToTalk = () => {
    if (!holding) return
    setHolding(false)
    if (recording) onStopListening()
  }

  const handleMicClick = () => {
    if (voiceMode === 'push-to-talk') return
    if (recording) {
      onStopListening()
      return
    }
    if (busy) {
      onCancelListening()
      return
    }
    onStartListening()
  }

  const statusText = (() => {
    if (voiceError) return voiceError
    if (requesting) return 'Waiting for microphone permission…'
    if (transcribing) return 'Transcribing on-device…'
    if (recording) {
      return voiceMode === 'push-to-talk'
        ? 'Listening — release to transcribe'
        : 'Listening — pause when you are done'
    }
    return null
  })()

  return (
    <div className="safe-bottom px-3 pb-2 sm:px-5">
      <div className="mx-auto w-full max-w-3xl">
        {statusText && (
          <div
            className={cn(
              'mb-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs',
              voiceError
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)]',
            )}
            role="status"
            aria-live="polite"
          >
            {recording && (
              <span className="flex items-end gap-0.5" aria-hidden="true">
                {[0, 1, 2, 3].map((index) => (
                  <span
                    key={index}
                    className="w-1 rounded-full bg-emerald-400 transition-[height] duration-100"
                    style={{
                      height: `${6 + Math.round(voiceLevel * (14 + index * 2))}px`,
                    }}
                  />
                ))}
              </span>
            )}
            {(requesting || transcribing) && (
              <Icon
                name={transcribing ? 'cpu' : 'mic'}
                size={14}
                className="shrink-0 animate-soft-pulse"
              />
            )}
            <span className="min-w-0 flex-1">{statusText}</span>
            {voiceError && (
              <button
                type="button"
                className="btn-icon h-6 w-6 shrink-0"
                onClick={onCancelListening}
                aria-label="Dismiss microphone message"
              >
                <Icon name="x" size={13} />
              </button>
            )}
          </div>
        )}

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)]/90 p-2 shadow-[0_18px_50px_-24px_var(--shadow-color)] backdrop-blur-xl">
          <div className="flex items-end gap-1.5">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={
                recording
                  ? 'Listening…'
                  : transcribing
                    ? 'Transcribing your voice…'
                    : 'Message your companion…'
              }
              aria-label="Message"
              className="max-h-[180px] min-h-12 flex-1 resize-none bg-transparent px-2.5 py-2.5 text-[15px] leading-relaxed text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)]"
              disabled={recording || transcribing}
            />

            {voiceMode !== 'text' && (
              <button
                type="button"
                onClick={handleMicClick}
                onPointerDown={(event) => {
                  if (voiceMode !== 'push-to-talk') return
                  if (event.button !== 0) return
                  event.preventDefault()
                  event.currentTarget.setPointerCapture?.(event.pointerId)
                  startPushToTalk()
                }}
                onPointerUp={() => {
                  if (voiceMode === 'push-to-talk') stopPushToTalk()
                }}
                onPointerCancel={() => {
                  if (voiceMode === 'push-to-talk') {
                    setHolding(false)
                    onCancelListening()
                  }
                }}
                onKeyDown={(event) => {
                  if (voiceMode !== 'push-to-talk') return
                  if (event.key === ' ' || event.key === 'Enter') {
                    event.preventDefault()
                    if (!event.repeat) startPushToTalk()
                  }
                }}
                onKeyUp={(event) => {
                  if (voiceMode !== 'push-to-talk') return
                  if (event.key === ' ' || event.key === 'Enter') {
                    event.preventDefault()
                    stopPushToTalk()
                  }
                }}
                disabled={!micSupported || busy}
                aria-label={
                  recording
                    ? 'Stop recording'
                    : voiceMode === 'push-to-talk'
                      ? 'Hold to talk'
                      : 'Start voice input'
                }
                aria-pressed={recording}
                title={
                  micSupported
                    ? voiceMode === 'push-to-talk'
                      ? 'Hold to talk'
                      : 'Voice input'
                    : 'Microphone unavailable'
                }
                className={cn(
                  'relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border transition',
                  recording
                    ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-300'
                    : transcribing
                      ? 'border-[var(--border)] bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]',
                  (!micSupported || busy) && 'opacity-50',
                )}
              >
                {recording && (
                  <span className="absolute inset-0 animate-ping rounded-xl border border-emerald-400/40" />
                )}
                <Icon
                  name={
                    transcribing
                      ? 'cpu'
                      : micSupported
                        ? 'mic'
                        : 'mic-off'
                  }
                  size={18}
                />
              </button>
            )}

            {isGenerating ? (
              <button
                type="button"
                onClick={onStop}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-rose-500/30 bg-rose-500/15 text-rose-300 transition hover:bg-rose-500/25"
                aria-label="Stop generating"
                title="Stop"
              >
                <Icon name="stop" size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={!draft.trim() || recording || transcribing}
                className={cn(
                  'grid h-10 w-10 shrink-0 place-items-center rounded-xl transition',
                  draft.trim() && !recording && !transcribing
                    ? 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-[0_8px_24px_-10px_rgba(139,92,246,0.9)] hover:brightness-110'
                    : 'bg-[var(--surface-3)] text-[var(--text-subtle)]',
                )}
                aria-label="Send message"
                title="Send"
              >
                <Icon name="send" size={17} />
              </button>
            )}
          </div>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-[var(--text-subtle)]">
          <span>
            Enter to send · Shift+Enter for a new line
          </span>
          <span className="flex items-center gap-1">
            <Icon name="shield" size={11} />
            Stays on this device
          </span>
        </div>
      </div>
    </div>
  )
}
