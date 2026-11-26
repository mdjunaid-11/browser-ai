import { useEffect, useRef, useState } from 'react'
import type { TextModelSession, VoiceMode, VoiceRecognitionMetrics } from '../../types'
import type { VoiceInputError, VoiceInputState } from '../../hooks/useVoiceInput'
import { cn } from '../../utils/cn'
import { Icon } from '../ui/Icon'
import { modelManager } from '../../ai/models/modelManager'
import { StatusIndicator } from '../ui/StatusIndicator'

interface ComposerProps {
  draft: string
  onDraftChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  isGenerating: boolean
  voiceMode: VoiceMode
  voiceState: VoiceInputState
  voiceLevel: number
  voiceError: VoiceInputError | null
  voicePreview: string
  voicePreviewKind: 'partial' | 'final' | null
  voiceMetrics: VoiceRecognitionMetrics | null
  voiceEngine: 'private' | 'fast'
  canRetryVoice: boolean
  micSupported: boolean
  onStartListening: () => void
  onStopListening: () => void
  onCancelListening: () => void
  onRetryVoice: () => void
  modelSession: TextModelSession
  onInitialize: () => void
  onRetryModel: () => void
  onOpenSetup: () => void
}

const LOCKED_TEXT = 'Load your AI model to start chatting'

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
  voicePreview,
  voicePreviewKind,
  voiceMetrics,
  voiceEngine,
  canRetryVoice,
  micSupported,
  onStartListening,
  onStopListening,
  onCancelListening,
  onRetryVoice,
  modelSession,
  onInitialize,
  onRetryModel,
  onOpenSetup,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [holding, setHolding] = useState(false)
  const [showMetrics, setShowMetrics] = useState(false)

  const ready =
    modelSession.state === 'ready' && modelManager.isTextModelReady()
  const modelBusy =
    modelSession.state === 'configuring' ||
    modelSession.state === 'downloading' ||
    modelSession.state === 'initializing'

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(180, Math.max(52, textarea.scrollHeight))}px`
  }, [draft, ready])

  useEffect(() => {
    if (!isGenerating && ready) textareaRef.current?.focus()
  }, [isGenerating, ready])

  const submit = () => {
    // The authoritative check also lives in useChat.sendMessage().
    if (!ready || isGenerating || !draft.trim()) return
    onSend()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault()
      submit()
    }
  }

  const recording = voiceState === 'recording'
  const requesting = voiceState === 'requesting'
  const transcribing = voiceState === 'transcribing'
  const busy = requesting || transcribing
  const voiceDisabled = !ready || !micSupported || busy || isGenerating

  const startPushToTalk = () => {
    if (voiceDisabled || recording) return
    setHolding(true)
    onStartListening()
  }

  const stopPushToTalk = () => {
    if (!holding) return
    setHolding(false)
    if (recording) onStopListening()
  }

  const handleMicClick = () => {
    if (voiceDisabled) return
    if (voiceMode === 'push-to-talk') return
    if (recording) {
      onStopListening()
      return
    }
    if (voiceState === 'error') {
      onRetryVoice()
      return
    }
    if (busy) {
      onCancelListening()
      return
    }
    onStartListening()
  }

  const statusText = (() => {
    if (voiceError) return voiceError.message
    if (requesting) return 'Starting microphone…'
    if (transcribing) return voiceEngine === 'fast' ? 'Finishing recognition…' : 'Transcribing on-device…'
    if (recording) {
      return voiceMode === 'push-to-talk'
        ? 'Listening — release to transcribe'
        : 'Listening — pause when you are done'
    }
    if (voicePreviewKind === 'partial' && voicePreview) {
      return `Partial: ${voicePreview}`
    }
    return null
  })()

  return (
    <div className="safe-bottom shrink-0 px-3 pb-2 pt-2 sm:px-5">
      <div className="mx-auto w-full max-w-3xl">
        {!ready && (
          <div className="mb-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusIndicator
                tone={modelBusy ? 'busy' : modelSession.state === 'error' ? 'error' : 'neutral'}
                pulse={modelBusy}
              >
                {LOCKED_TEXT}
              </StatusIndicator>
              {modelSession.state === 'error' && (
                <span className="text-[11px] text-rose-300">Initialization failed</span>
              )}
            </div>
            {modelSession.state === 'error' ? (
              <>
                <p className="mt-2 break-words text-[11px] leading-relaxed text-[var(--text-muted)]">
                  {modelSession.error ?? 'The model could not be loaded.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm min-h-11"
                    onClick={onRetryModel}
                    disabled={modelBusy}
                  >
                    <Icon name="refresh" size={14} />
                    Retry
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm min-h-11"
                    onClick={onOpenSetup}
                  >
                    Select another model
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm mt-3 min-h-11"
                onClick={onInitialize}
                disabled={modelBusy}
              >
                <Icon name={modelBusy ? 'cpu' : 'download'} size={14} />
                {modelBusy ? 'Initializing…' : 'Initialize AI Model'}
              </button>
            )}
          </div>
        )}

        {ready && (
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-[var(--text-subtle)]">
            <StatusIndicator tone="ready">AI model ready</StatusIndicator>
            <span>{modelSession.backend === 'webgpu' ? 'WebGPU' : 'CPU / WASM'}</span>
          </div>
        )}

        {statusText && (
          <div
            className={cn(
              'mb-2 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs',
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
                    style={{ height: `${6 + Math.round(voiceLevel * (14 + index * 2))}px` }}
                  />
                ))}
              </span>
            )}
            {(requesting || transcribing) && (
              <Icon
                name={transcribing ? 'cpu' : 'mic'}
                size={14}
                className="mt-0.5 shrink-0 animate-soft-pulse"
              />
            )}
            <span className="min-w-0 flex-1 break-words">{statusText}</span>
            {transcribing && (
              <button
                type="button"
                className="btn-icon h-11 w-11 shrink-0"
                onClick={onCancelListening}
                aria-label="Cancel transcription"
              >
                <Icon name="x" size={15} />
              </button>
            )}
            {voiceError && (
              <button
                type="button"
                className="btn-icon h-11 w-11 shrink-0"
                onClick={onCancelListening}
                aria-label="Dismiss microphone message"
              >
                <Icon name="x" size={15} />
              </button>
            )}
          </div>
        )}

        {voiceError && (canRetryVoice || voiceError.fallbackEngine) && (
          <button
            type="button"
            className="btn btn-secondary btn-sm mb-2 min-h-11"
            onClick={onRetryVoice}
          >
            <Icon name="refresh" size={14} />
            {voiceError.fallbackEngine === 'fast'
              ? 'Try fast recognition'
              : voiceError.fallbackEngine === 'private'
                ? 'Try private recognition'
                : 'Retry transcription'}
          </button>
        )}

        {voiceMetrics && !voiceError && (
          <div className="mb-2">
            <button
              type="button"
              className="text-[10px] font-medium text-[var(--text-subtle)] underline-offset-2 hover:underline"
              onClick={() => setShowMetrics((value) => !value)}
              aria-expanded={showMetrics}
            >
              {showMetrics ? 'Hide' : 'Show'} recognition timings
            </button>
            {showMetrics && (
              <div className="mt-1 grid grid-cols-2 gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)] p-2 text-[10px] text-[var(--text-subtle)] sm:grid-cols-3">
                <span>Mic start {voiceMetrics.micStartMs} ms</span>
                <span>First partial {voiceMetrics.timeToFirstPartialMs ?? '—'} ms</span>
                <span>Final {voiceMetrics.finalLatencyMs ?? '—'} ms</span>
                <span>Audio {voiceMetrics.audioDurationMs} ms</span>
                <span>Processing {voiceMetrics.processingMs ?? '—'} ms</span>
                <span>Model init {voiceMetrics.modelInitMs ?? '—'} ms</span>
              </div>
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
                !ready
                  ? LOCKED_TEXT
                  : recording
                    ? 'Listening…'
                    : transcribing
                      ? 'Transcribing your voice…'
                      : 'Message your companion…'
              }
              aria-label="Message"
              className="max-h-[180px] min-h-[3.25rem] flex-1 resize-none bg-transparent px-2.5 py-3 text-[15px] leading-relaxed text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)] disabled:cursor-not-allowed"
              disabled={!ready || recording || transcribing}
            />

            {voiceMode !== 'text' && (
              <button
                type="button"
                onClick={handleMicClick}
                onPointerDown={(event) => {
                  if (voiceMode !== 'push-to-talk' || voiceDisabled) return
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
                  if (voiceMode !== 'push-to-talk' || voiceDisabled) return
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
                disabled={voiceDisabled && !recording}
                aria-label={
                  recording
                    ? 'Stop recording'
                    : voiceMode === 'push-to-talk'
                      ? 'Hold to talk'
                      : 'Start voice input'
                }
                aria-pressed={recording}
                title={voiceDisabled ? 'Unlock the model to use voice' : 'Voice input'}
                className={cn(
                  'relative grid h-11 w-11 shrink-0 place-items-center rounded-xl border transition',
                  recording
                    ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-300'
                    : transcribing
                      ? 'border-[var(--border)] bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]',
                  voiceDisabled && !recording && 'opacity-40',
                )}
              >
                {recording && (
                  <span className="absolute inset-0 animate-ping rounded-xl border border-emerald-400/40" />
                )}
                <Icon
                  name={transcribing ? 'cpu' : micSupported ? 'mic' : 'mic-off'}
                  size={18}
                />
              </button>
            )}

            {isGenerating && ready ? (
              <button
                type="button"
                onClick={onStop}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-rose-500/30 bg-rose-500/15 text-rose-300 transition hover:bg-rose-500/25"
                aria-label="Stop generating"
                title="Stop"
              >
                <Icon name="stop" size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={!ready || !draft.trim() || recording || transcribing}
                className={cn(
                  'grid h-11 w-11 shrink-0 place-items-center rounded-xl transition',
                  ready && draft.trim() && !recording && !transcribing
                    ? 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-[0_8px_24px_-10px_rgba(139,92,246,0.9)] hover:brightness-110'
                    : 'bg-[var(--surface-3)] text-[var(--text-subtle)]',
                )}
                aria-label="Send message"
                title={ready ? 'Send' : LOCKED_TEXT}
              >
                <Icon name="send" size={17} />
              </button>
            )}
          </div>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-[var(--text-subtle)]">
          <span>Enter to send · Shift+Enter for a new line</span>
          <span className="flex items-center gap-1">
            <Icon name="shield" size={11} />
            Stays on this device
          </span>
        </div>
      </div>
    </div>
  )
}
