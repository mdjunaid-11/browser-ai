import { useEffect, useRef, useState } from 'react'
import type { AnimalId, ChatMessage } from '../../types'
import { cn } from '../../utils/cn'
import { getModelById, formatModelSize } from '../../ai/models/modelRegistry'
import { AvatarPanel } from '../avatar/AvatarPanel'
import { Icon } from '../ui/Icon'
import { MessageBubble } from './MessageBubble'

interface ChatViewProps {
  messages: ChatMessage[]
  animal: AnimalId
  streamingMessageId: string | null
  isGenerating: boolean
  speakingMessageId: string | null
  canSpeak: boolean
  canRegenerate: boolean
  onSpeak: (text: string, messageId: string) => void
  onStopSpeak: () => void
  onRegenerate: () => void
  onDelete: (id: string) => void
  onSuggestion: (text: string) => void
  onStartVoice?: () => void
  textModelId: string
  voiceEnabled: boolean
  onOpenSetup?: () => void
}

const SUGGESTIONS = [
  {
    icon: 'sparkles' as const,
    title: 'Explain something simply',
    prompt: 'Explain how WebAssembly works in simple terms.',
  },
  {
    icon: 'edit' as const,
    title: 'Write a short poem',
    prompt: 'Write a short, cheerful poem about a rainy afternoon.',
  },
  {
    icon: 'zap' as const,
    title: 'Plan my day',
    prompt: 'Help me plan a focused 3-hour study session with short breaks.',
  },
  {
    icon: 'message' as const,
    title: 'What can you do?',
    prompt: 'What can you help me with, and what are your limitations?',
  },
]

export function ChatView({
  messages,
  animal,
  streamingMessageId,
  isGenerating,
  speakingMessageId,
  canSpeak,
  canRegenerate,
  onSpeak,
  onStopSpeak,
  onRegenerate,
  onDelete,
  onSuggestion,
  onStartVoice,
  textModelId,
  voiceEnabled,
  onOpenSetup,
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState(true)
  const model = getModelById(textModelId)

  useEffect(() => {
    const container = scrollRef.current
    if (!container || !pinned) return
    container.scrollTo({ top: container.scrollHeight, behavior: 'auto' })
  }, [messages, pinned])

  const handleScroll = () => {
    const container = scrollRef.current
    if (!container) return
    const distance =
      container.scrollHeight - container.scrollTop - container.clientHeight
    setPinned(distance < 140)
  }

  const scrollToBottom = () => {
    const container = scrollRef.current
    if (!container) return
    setPinned(true)
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
  }

  const lastAssistant = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant')

  if (messages.length === 0) {
    return (
      <div
        ref={scrollRef}
        className="scrollbar-thin flex flex-1 flex-col overflow-y-auto"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-5 py-8 text-center">
          <div className="relative">
            <div className="absolute inset-0 -z-10 rounded-full bg-[var(--accent)] opacity-20 blur-3xl" />
            <AvatarPanel
              animal={animal}
              state={isGenerating ? 'thinking' : 'idle'}
              size={180}
              showWaveform={false}
            />
          </div>

          <h1 className="mt-5 text-2xl font-bold tracking-tight text-[var(--text)] sm:text-3xl">
            What’s on your mind?
          </h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--text-muted)]">
            Ask anything. Your companion thinks locally, in this tab, and never
            sends your words to a server.
          </p>

          <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion.title}
                type="button"
                onClick={() => onSuggestion(suggestion.prompt)}
                className="group flex items-start gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/70 p-3 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)]"
              >
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Icon name={suggestion.icon} size={14} />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-[var(--text)]">
                    {suggestion.title}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-[var(--text-subtle)]">
                    {suggestion.prompt}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {voiceEnabled && onStartVoice && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onStartVoice}
              >
                <Icon name="mic" size={14} />
                Talk instead
              </button>
            )}
            <span className="chip">
              <Icon name="cpu" size={11} />
              {model?.label ?? 'Local model'}
              {model ? ` · ${formatModelSize(model.approxSizeMB)}` : ''}
            </span>
            {onOpenSetup && (
              <button
                type="button"
                className="text-[11px] font-medium text-[var(--text-subtle)] underline-offset-4 hover:text-[var(--text)] hover:underline"
                onClick={onOpenSetup}
              >
                Change setup
              </button>
            )}
          </div>

          <p className="mt-4 max-w-md text-[11px] leading-relaxed text-[var(--text-subtle)]">
            The first reply downloads the model once ({model ? formatModelSize(model.approxSizeMB) : 'a few hundred MB'}) and
            caches it in your browser. Local models can be wrong — verify
            important information.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="scrollbar-thin flex-1 overflow-y-auto"
      >
        <div className="mx-auto w-full max-w-3xl space-y-5 px-3 py-5 sm:px-5 sm:py-6">
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              animal={animal}
              streaming={
                message.id === streamingMessageId &&
                message.status === 'streaming'
              }
              canSpeak={canSpeak && message.role === 'assistant'}
              speaking={
                speakingMessageId === message.id &&
                message.id === lastAssistant?.id
              }
              canRegenerate={
                canRegenerate &&
                message.id === lastAssistant?.id &&
                message.status !== 'streaming'
              }
              disabled={isGenerating}
              onSpeak={(text) => onSpeak(text, message.id)}
              onStopSpeak={onStopSpeak}
              onRegenerate={onRegenerate}
              onDelete={onDelete}
            />
          ))}
          <div className="h-2" />
        </div>
      </div>

      {!pinned && (
        <button
          type="button"
          onClick={scrollToBottom}
          className={cn(
            'absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-muted)] shadow-lg backdrop-blur transition hover:text-[var(--text)]',
          )}
        >
          <span className="flex items-center gap-1.5">
            <Icon name="chevron-down" size={13} />
            {isGenerating ? 'Follow the reply' : 'Jump to latest'}
          </span>
        </button>
      )}
    </div>
  )
}
