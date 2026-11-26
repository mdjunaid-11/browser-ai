import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AppSettings,
  ChatMessage,
  Conversation,
  DeviceCapabilities,
  MessageStatus,
} from '../types'
import {
  CancelledError,
  modelManager,
} from '../ai/models/modelManager'
import { checkModelCompatibility } from '../ai/models/modelCompatibility'
import { getModelById } from '../ai/models/modelRegistry'
import {
  createId,
  deleteConversation as deleteConversationRecord,
  deleteMessage,
  listConversations,
  listMessages,
  saveConversation,
  saveMessage,
  clearAllData,
  isMemoryFallback,
  titleFromText,
} from '../services/storage/db'

export type ChatStatus = 'idle' | 'loading' | 'thinking' | 'streaming' | 'error'

interface UseChatOptions {
  settings: AppSettings
  capabilities: DeviceCapabilities | null
  onAssistantReady?: (text: string, messageId: string) => void
  onError?: (message: string) => void
  onScrollToBottom?: () => void
}

interface RevealState {
  timer: number | null
  queue: string
  displayed: string
  target: string
  done: boolean
  messageId: string | null
  conversationId: string | null
  startedAt: number
  finalized: boolean
  completed: boolean
  onComplete: (() => void) | null
}

const emptyReveal = (): RevealState => ({
  timer: null,
  queue: '',
  displayed: '',
  target: '',
  done: false,
  messageId: null,
  conversationId: null,
  startedAt: 0,
  finalized: false,
  completed: false,
  onComplete: null,
})

function temperatureForMode(mode: AppSettings['mode']): number {
  if (mode === 'potato') return 0.4
  if (mode === 'quality') return 0.7
  return 0.6
}

export function useChat(options: UseChatOptions) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<ChatStatus>('idle')
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)
  const [persistenceWarning, setPersistenceWarning] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const conversationsRef = useRef<Conversation[]>([])
  const activeIdRef = useRef<string | null>(null)
  const messagesRef = useRef<ChatMessage[]>([])
  const settingsRef = useRef(options.settings)
  const capabilitiesRef = useRef(options.capabilities)
  const callbacksRef = useRef(options)
  const abortRef = useRef<AbortController | null>(null)
  const cancelledRef = useRef(false)
  const generatingRef = useRef(false)
  const revealRef = useRef<RevealState>(emptyReveal())

  useEffect(() => {
    settingsRef.current = options.settings
    capabilitiesRef.current = options.capabilities
    callbacksRef.current = options
  })

  useEffect(() => {
    conversationsRef.current = conversations
  }, [conversations])

  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const applyMessages = useCallback(
    (updater: (previous: ChatMessage[]) => ChatMessage[]) => {
      const next = updater(messagesRef.current)
      messagesRef.current = next
      setMessages(next)
    },
    [],
  )

  const applyConversations = useCallback(
    (updater: (previous: Conversation[]) => Conversation[]) => {
      const next = updater(conversationsRef.current)
      conversationsRef.current = next
      setConversations(next)
    },
    [],
  )

  const stopRevealTimer = useCallback(() => {
    const state = revealRef.current
    if (state.timer !== null) {
      window.clearInterval(state.timer)
      state.timer = null
    }
  }, [])

  const persistConversation = useCallback(
    async (conversation: Conversation) => {
      await saveConversation(conversation)
    },
    [],
  )

  const updateConversation = useCallback(
    (
      conversationId: string,
      patch: Partial<Conversation>,
      persist = true,
    ) => {
      const existing = conversationsRef.current.find(
        (conversation) => conversation.id === conversationId,
      )
      if (!existing) return
      const updated: Conversation = {
        ...existing,
        ...patch,
        updatedAt: Date.now(),
      }
      applyConversations((previous) =>
        previous.map((conversation) =>
          conversation.id === conversationId ? updated : conversation,
        ),
      )
      if (persist) void persistConversation(updated)
    },
    [applyConversations, persistConversation],
  )

  const finalizeAssistant = useCallback(
    async (
      finalStatus: MessageStatus,
      error?: string,
      meta?: { durationMs?: number; tokensPerSecond?: number },
    ) => {
      const state = revealRef.current
      if (state.finalized) return
      state.finalized = true
      stopRevealTimer()

      const messageId = state.messageId
      const conversationId = state.conversationId
      const content = state.displayed || state.target

      if (!messageId || !conversationId) {
        setStatus('idle')
        setStreamingMessageId(null)
        return
      }

      if (finalStatus === 'stopped' && !content.trim()) {
        applyMessages((previous) =>
          previous.filter((message) => message.id !== messageId),
        )
        setStatus('idle')
        setStreamingMessageId(null)
        return
      }

      const existing = messagesRef.current.find(
        (message) => message.id === messageId,
      )
      if (!existing) {
        setStatus('idle')
        setStreamingMessageId(null)
        return
      }

      const updated: ChatMessage = {
        ...existing,
        content:
          content.trim() ||
          (finalStatus === 'error'
            ? 'The response could not be completed.'
            : ''),
        status: finalStatus,
        updatedAt: Date.now(),
        error,
        durationMs: meta?.durationMs,
        tokensPerSecond: meta?.tokensPerSecond,
      }

      applyMessages((previous) =>
        previous.map((message) =>
          message.id === messageId ? updated : message,
        ),
      )

      setStatus(finalStatus === 'error' ? 'error' : 'idle')
      setStreamingMessageId(null)

      await saveMessage(updated)
      updateConversation(conversationId, {
        preview: updated.content.slice(0, 120),
        messageCount: messagesRef.current.filter(
          (message) => message.conversationId === conversationId,
        ).length,
      })
      if (finalStatus === 'complete' && updated.content.trim()) {
        callbacksRef.current.onAssistantReady?.(updated.content, updated.id)
      }
    },
    [
      applyMessages,
      stopRevealTimer,
      updateConversation,
    ],
  )

  const startReveal = useCallback(
    (messageId: string, conversationId: string) => {
      stopRevealTimer()
      revealRef.current = {
        timer: null,
        queue: '',
        displayed: '',
        target: '',
        done: false,
        messageId,
        conversationId,
        startedAt: Date.now(),
        finalized: false,
        completed: false,
        onComplete: null,
      }

      const tick = () => {
        const state = revealRef.current
        if (state.finalized) return

        if (state.queue.length > 0) {
          const speed = settingsRef.current.typingSpeed
          const charsPerTick =
            speed <= 0
              ? state.queue.length
              : Math.max(1, Math.ceil(speed * 0.04))
          const chunk = state.queue.slice(0, charsPerTick)
          state.queue = state.queue.slice(charsPerTick)
          state.displayed += chunk

          const content = state.displayed
          applyMessages((previous) =>
            previous.map((message) =>
              message.id === state.messageId
                ? { ...message, content, updatedAt: Date.now() }
                : message,
            ),
          )
          callbacksRef.current.onScrollToBottom?.()
        }

        if (state.queue.length === 0 && state.done && !state.completed) {
          state.completed = true
          state.onComplete?.()
        }
      }

      revealRef.current.timer = window.setInterval(tick, 40)
      tick()
    },
    [applyMessages, stopRevealTimer],
  )

  const ensureTextModel = useCallback(async (): Promise<{
    modelId: string
    backend: 'wasm' | 'webgpu'
  }> => {
    const settings = settingsRef.current
    const capabilities = capabilitiesRef.current
    const model = getModelById(settings.textModelId)
    if (!model || model.kind !== 'text') {
      throw new Error('The selected text model is not available.')
    }

    let backend: 'wasm' | 'webgpu' = 'wasm'
    if (capabilities) {
      const compatibility = checkModelCompatibility(
        model,
        capabilities,
        settings.backend,
        settings.mode,
      )
      if (!compatibility.compatible) {
        throw new Error(
          compatibility.warnings[0] ??
            'This model is not compatible with this browser.',
        )
      }
      backend = compatibility.backend
    }

    if (!modelManager.isReady(model.id)) {
      setStatus('loading')
      await modelManager.loadText(model.id, backend)
    }

    return { modelId: model.id, backend }
  }, [])

  const runAssistant = useCallback(
    async (
      conversation: Conversation,
      history: ChatMessage[],
    ): Promise<void> => {
      const now = Date.now()
      const assistant: ChatMessage = {
        id: createId(),
        conversationId: conversation.id,
        role: 'assistant',
        content: '',
        createdAt: now,
        updatedAt: now,
        status: 'streaming',
        modelId: settingsRef.current.textModelId,
      }

      applyMessages((previous) => [...previous, assistant])
      setStreamingMessageId(assistant.id)
      setStatus('thinking')
      generatingRef.current = true
      cancelledRef.current = false
      startReveal(assistant.id, conversation.id)

      const modelMessages = history
        .filter(
          (message) =>
            (message.role === 'user' || message.role === 'assistant') &&
            message.content.trim().length > 0 &&
            message.status !== 'error',
        )
        .map((message) => ({
          role: message.role as 'user' | 'assistant',
          content: message.content,
        }))

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const { modelId, backend } = await ensureTextModel()
        if (cancelledRef.current) return

        setStatus('thinking')

        const result = await modelManager.generate(
          modelId,
          backend,
          modelMessages,
          {
            maxNewTokens: settingsRef.current.maxNewTokens,
            temperature: temperatureForMode(settingsRef.current.mode),
            topP: 0.92,
            contextTurns: settingsRef.current.contextTurns,
          },
          {
            signal: controller.signal,
            onToken: (text) => {
              if (cancelledRef.current) return
              const state = revealRef.current
              state.queue += text
              setStatus((previous) =>
                previous === 'thinking' ? 'streaming' : previous,
              )
            },
          },
        )

        if (cancelledRef.current) return

        const state = revealRef.current
        if (state.finalized) return

        state.target = result.text
        if (result.text.startsWith(state.displayed)) {
          state.queue += result.text.slice(state.displayed.length)
        } else {
          state.queue = ''
          state.displayed = result.text
          applyMessages((previous) =>
            previous.map((message) =>
              message.id === state.messageId
                ? { ...message, content: result.text }
                : message,
            ),
          )
        }
        state.done = true
        setStatus('streaming')

        const meta = {
          durationMs: result.durationMs,
          tokensPerSecond: result.tokensPerSecond,
        }
        const complete = () => {
          void finalizeAssistant('complete', undefined, meta)
        }

        if (settingsRef.current.typingSpeed <= 0) {
          state.queue = ''
          state.displayed = result.text
          applyMessages((previous) =>
            previous.map((message) =>
              message.id === state.messageId
                ? { ...message, content: result.text }
                : message,
            ),
          )
          complete()
        } else if (state.queue.length === 0) {
          state.completed = true
          complete()
        } else {
          state.onComplete = complete
        }
      } catch (error) {
        if (
          cancelledRef.current ||
          error instanceof CancelledError ||
          revealRef.current.finalized
        ) {
          return
        }
        const message =
          error instanceof Error
            ? error.message
            : 'The model could not produce a response.'
        callbacksRef.current.onError?.(message)
        const state = revealRef.current
        state.done = true
        state.target = state.displayed
        await finalizeAssistant('error', message)
      } finally {
        generatingRef.current = false
        abortRef.current = null
        setStreamingMessageId(null)
      }
    },
    [applyMessages, ensureTextModel, finalizeAssistant, startReveal],
  )

  const sendMessage = useCallback(
    async (rawText: string): Promise<void> => {
      const text = rawText.trim()
      if (!text || generatingRef.current) return

      let conversation: Conversation | undefined
      const currentId = activeIdRef.current
      if (currentId) {
        conversation = conversationsRef.current.find(
          (item) => item.id === currentId,
        )
      }

      const now = Date.now()
      if (!conversation) {
        conversation = {
          id: createId(),
          title: titleFromText(text),
          createdAt: now,
          updatedAt: now,
          preview: text,
          messageCount: 0,
        }
        applyConversations((previous) => [conversation!, ...previous])
        setActiveId(conversation.id)
        activeIdRef.current = conversation.id
        await persistConversation(conversation)
      } else if (conversation.messageCount === 0) {
        conversation = {
          ...conversation,
          title: titleFromText(text),
          preview: text,
          updatedAt: now,
        }
        updateConversation(conversation.id, {
          title: conversation.title,
          preview: text,
        })
      }

      const userMessage: ChatMessage = {
        id: createId(),
        conversationId: conversation.id,
        role: 'user',
        content: text,
        createdAt: now,
        updatedAt: now,
        status: 'complete',
      }

      applyMessages((previous) => [...previous, userMessage])
      await saveMessage(userMessage)

      const history = [...messagesRef.current]
      updateConversation(conversation.id, {
        preview: text,
        messageCount: history.length,
      })

      await runAssistant(conversation, history)
    },
    [
      applyConversations,
      applyMessages,
      persistConversation,
      runAssistant,
      updateConversation,
    ],
  )

  const stopGeneration = useCallback(() => {
    if (!generatingRef.current) return
    cancelledRef.current = true
    abortRef.current?.abort()
    const state = revealRef.current
    state.done = true
    state.queue = ''
    state.target = state.displayed
    void finalizeAssistant('stopped')
    setStreamingMessageId(null)
    setStatus('idle')
  }, [finalizeAssistant])

  const regenerate = useCallback(async (): Promise<void> => {
    if (generatingRef.current) return
    const currentId = activeIdRef.current
    if (!currentId) return

    const conversation = conversationsRef.current.find(
      (item) => item.id === currentId,
    )
    if (!conversation) return

    const current = messagesRef.current
    let lastUserIndex = -1
    for (let i = current.length - 1; i >= 0; i -= 1) {
      if (current[i].role === 'user') {
        lastUserIndex = i
        break
      }
    }
    if (lastUserIndex < 0) return

    const removed = current.slice(lastUserIndex + 1)
    for (const message of removed) {
      await deleteMessage(message.id)
    }

    const history = current.slice(0, lastUserIndex + 1)
    applyMessages(() => history)
    updateConversation(conversation.id, {
      messageCount: history.length,
      preview: history[history.length - 1]?.content.slice(0, 120) ?? '',
    })

    await runAssistant(conversation, history)
  }, [applyMessages, runAssistant, updateConversation])

  const newConversation = useCallback(() => {
    if (generatingRef.current) stopGeneration()
    setActiveId(null)
    activeIdRef.current = null
    applyMessages(() => [])
    setStatus('idle')
    setStreamingMessageId(null)
  }, [applyMessages, stopGeneration])

  const selectConversation = useCallback(
    async (id: string): Promise<void> => {
      if (generatingRef.current) stopGeneration()
      const loaded = await listMessages(id)
      setActiveId(id)
      activeIdRef.current = id
      applyMessages(() => loaded)
      setStatus('idle')
      setStreamingMessageId(null)
    },
    [applyMessages, stopGeneration],
  )

  const renameConversation = useCallback(
    async (id: string, title: string): Promise<void> => {
      const clean = title.trim() || 'Untitled conversation'
      updateConversation(id, { title: clean })
    },
    [updateConversation],
  )

  const removeConversation = useCallback(
    async (id: string): Promise<void> => {
      if (generatingRef.current && activeIdRef.current === id) stopGeneration()
      await deleteConversationRecord(id)
      applyConversations((previous) =>
        previous.filter((conversation) => conversation.id !== id),
      )
      if (activeIdRef.current === id) {
        const remaining = conversationsRef.current.filter(
          (conversation) => conversation.id !== id,
        )
        const next = remaining[0] ?? null
        setActiveId(next?.id ?? null)
        activeIdRef.current = next?.id ?? null
        if (next) {
          const loaded = await listMessages(next.id)
          applyMessages(() => loaded)
        } else {
          applyMessages(() => [])
        }
      }
    },
    [applyConversations, applyMessages, stopGeneration],
  )

  const deleteMessageById = useCallback(
    async (id: string): Promise<void> => {
      if (generatingRef.current) return
      const message = messagesRef.current.find((item) => item.id === id)
      if (!message) return
      await deleteMessage(id)
      applyMessages((previous) => previous.filter((item) => item.id !== id))
      const conversation = conversationsRef.current.find(
        (item) => item.id === message.conversationId,
      )
      if (conversation) {
        const remaining = messagesRef.current.filter(
          (item) => item.conversationId === conversation.id,
        )
        updateConversation(conversation.id, {
          messageCount: remaining.length,
          preview:
            remaining[remaining.length - 1]?.content.slice(0, 120) ??
            conversation.preview,
        })
      }
    },
    [applyMessages, updateConversation],
  )

  const clearAllConversations = useCallback(async (): Promise<void> => {
    if (generatingRef.current) stopGeneration()
    await clearAllData()
    applyConversations(() => [])
    applyMessages(() => [])
    setActiveId(null)
    activeIdRef.current = null
    setStatus('idle')
  }, [applyConversations, applyMessages, stopGeneration])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await listConversations()
        if (cancelled) return
        applyConversations(() => list)
        setPersistenceWarning(isMemoryFallback())
        if (list.length > 0) {
          const first = list[0]
          setActiveId(first.id)
          activeIdRef.current = first.id
          const loaded = await listMessages(first.id)
          if (!cancelled) applyMessages(() => loaded)
        }
      } catch {
        setPersistenceWarning(true)
      } finally {
        if (!cancelled) setInitialized(true)
      }
    })()

    return () => {
      cancelled = true
      stopRevealTimer()
      abortRef.current?.abort()
    }
  }, [applyConversations, applyMessages, stopRevealTimer])

  const activeConversation =
    conversations.find((conversation) => conversation.id === activeId) ?? null

  return {
    conversations,
    activeConversation,
    activeId,
    messages,
    status,
    streamingMessageId,
    persistenceWarning,
    initialized,
    sendMessage,
    stopGeneration,
    regenerate,
    newConversation,
    selectConversation,
    renameConversation,
    removeConversation,
    deleteMessage: deleteMessageById,
    clearAllConversations,
    isGenerating:
      status === 'thinking' || status === 'streaming' || status === 'loading',
  }
}
