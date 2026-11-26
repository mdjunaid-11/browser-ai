import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AvatarState,
  ModelKind,
  OperatingMode,
} from './types'
import { useSettings } from './hooks/useSettings'
import { useChat } from './hooks/useChat'
import { useVoiceInput } from './hooks/useVoiceInput'
import { useTTS } from './hooks/useTTS'
import { useModelStatus } from './hooks/useModelStatus'
import { checkModelCompatibility } from './ai/models/modelCompatibility'
import { formatModelSize, getModelById } from './ai/models/modelRegistry'
import { modelManager } from './ai/models/modelManager'
import { ChatHeader } from './components/layout/ChatHeader'
import { Sidebar } from './components/layout/Sidebar'
import { ChatView } from './components/chat/ChatView'
import { Composer } from './components/chat/Composer'
import { AvatarPanel } from './components/avatar/AvatarPanel'
import { SetupWizard } from './components/setup/SetupWizard'
import { SettingsModal } from './components/settings/SettingsModal'
import { ConfirmDialog } from './components/ui/ConfirmDialog'
import { Icon } from './components/ui/Icon'
import { useToast } from './components/ui/toastContext'
import { ANIMAL_CONFIGS } from './components/avatar/animalConfig'
import { cn } from './utils/cn'

const TTS_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX'

function App() {
  const {
    settings,
    updateSettings,
    setMode,
    resetSettings,
    completeOnboarding,
    capabilities,
    assessment,
    detecting,
    detectionError,
    refreshCapabilities,
  } = useSettings()
  const toast = useToast()
  const { statuses, getStatus, refresh: refreshStatuses } = useModelStatus()

  const [draft, setDraft] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [showSetup, setShowSetup] = useState(false)
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [happy, setHappy] = useState(false)
  const [persistenceDismissed, setPersistenceDismissed] = useState(false)

  const happyTimer = useRef<number | null>(null)
  const autoListenTimer = useRef<number | null>(null)
  const suppressAutoListen = useRef(false)
  const speakRef = useRef<(text: string, messageId: string) => void>(() => {})
  const startListeningRef = useRef<() => void>(() => {})

  const setupVisible = !settings.onboarded || showSetup

  const chat = useChat({
    settings,
    capabilities,
    onAssistantReady: (text, messageId) => {
      suppressAutoListen.current = false
      setHappy(true)
      if (happyTimer.current !== null) window.clearTimeout(happyTimer.current)
      happyTimer.current = window.setTimeout(() => setHappy(false), 2400)
      if (settings.autoSpeak || settings.voiceMode === 'auto') {
        speakRef.current(text, messageId)
      }
    },
    onError: (message) => {
      toast.error('The response could not be completed', message)
    },
  })

  const voiceInput = useVoiceInput({
    settings,
    capabilities,
    onTranscript: (text) => {
      if (settings.autoSubmitTranscript && !chat.isGenerating) {
        setDraft('')
        void chat.sendMessage(text)
      } else {
        setDraft((previous) => (previous ? `${previous} ${text}` : text))
      }
    },
    onError: (message) => {
      toast.error('Voice input', message)
    },
  })

  const tts = useTTS({
    settings,
    capabilities,
    onNotice: (notice) => {
      toast.push({
        kind: 'warning',
        title: 'Voice fallback',
        description: notice.message,
        duration: 7000,
      })
    },
    onError: (message) => {
      setSpeakingMessageId(null)
      toast.error('Speech synthesis failed', message)
    },
    onEnd: () => {
      setSpeakingMessageId(null)
      const canContinue =
        settings.voiceMode === 'auto' &&
        settings.autoSpeak &&
        settings.onboarded &&
        !settingsOpen &&
        !setupVisible &&
        !suppressAutoListen.current
      if (!canContinue) return
      if (autoListenTimer.current !== null) {
        window.clearTimeout(autoListenTimer.current)
      }
      autoListenTimer.current = window.setTimeout(() => {
        if (!suppressAutoListen.current) startListeningRef.current()
      }, 650)
    },
  })

  useEffect(() => {
    speakRef.current = (text, messageId) => {
      setSpeakingMessageId(messageId)
      suppressAutoListen.current = false
      void tts.speak(text)
    }
    startListeningRef.current = () => {
      if (tts.speaking) {
        suppressAutoListen.current = true
        tts.stop()
        setSpeakingMessageId(null)
      }
      void voiceInput.startListening()
    }
  })

  useEffect(() => {
    modelManager.configure(settings, capabilities)
  }, [settings, capabilities])

  useEffect(() => {
    return modelManager.onNotice((notice) => {
      toast.push({
        kind: 'info',
        title: 'Model update',
        description: notice.message,
        duration: 7000,
      })
    })
  }, [toast])

  useEffect(() => {
    return () => {
      if (happyTimer.current !== null) window.clearTimeout(happyTimer.current)
      if (autoListenTimer.current !== null) {
        window.clearTimeout(autoListenTimer.current)
      }
    }
  }, [])

  useEffect(() => {
    if (settings.voiceMode === 'text' && tts.speaking) {
      tts.stop()
    }
  }, [settings.voiceMode, tts])

  const activeSpeakingId = tts.speaking ? speakingMessageId : null

  const handleSend = useCallback(
    (text?: string) => {
      const value = (text ?? draft).trim()
      if (!value || chat.isGenerating) return
      suppressAutoListen.current = false
      if (tts.speaking || tts.synthesizing) {
        tts.stop()
        setSpeakingMessageId(null)
      }
      if (
        voiceInput.state === 'recording' ||
        voiceInput.state === 'requesting'
      ) {
        void voiceInput.cancelListening()
      }
      setDraft('')
      void chat.sendMessage(value)
    },
    [chat, draft, tts, voiceInput],
  )

  const handleSpeak = useCallback(
    (text: string, messageId: string) => {
      speakRef.current(text, messageId)
    },
    [],
  )

  const handleStopSpeak = useCallback(() => {
    suppressAutoListen.current = true
    tts.stop()
    setSpeakingMessageId(null)
  }, [tts])

  const handleStartListening = useCallback(() => {
    if (tts.speaking) {
      suppressAutoListen.current = true
      tts.stop()
      setSpeakingMessageId(null)
    }
    void voiceInput.startListening()
  }, [tts, voiceInput])

  const handleStopListening = useCallback(() => {
    void voiceInput.stopListening()
  }, [voiceInput])

  const handleCancelListening = useCallback(() => {
    void voiceInput.cancelListening()
  }, [voiceInput])

  const handleDownloadModel = useCallback(
    async (kind: ModelKind) => {
      const modelId =
        kind === 'text'
          ? settings.textModelId
          : kind === 'asr'
            ? settings.asrModelId
            : TTS_MODEL_ID
      const model = getModelById(modelId)
      if (!model) {
        toast.error('Unknown model', 'That model is not in the registry.')
        return
      }
      if (!capabilities) {
        toast.warning('Device not ready', 'Wait for the device check to finish.')
        return
      }

      const compatibility = checkModelCompatibility(
        model,
        capabilities,
        settings.backend,
        settings.mode,
      )
      if (!compatibility.compatible) {
        toast.error(
          'This model cannot run here',
          compatibility.warnings[0] ?? 'The browser is missing a required capability.',
        )
        return
      }

      toast.info(
        'Loading model',
        `${model.label} · ${formatModelSize(model.approxSizeMB)}. The first download can take a while.`,
      )

      try {
        if (kind === 'text') {
          await modelManager.loadText(modelId, compatibility.backend)
        } else if (kind === 'asr') {
          await modelManager.loadAsr(modelId, compatibility.backend)
        } else {
          await modelManager.loadTts(modelId, compatibility.backend)
        }
        toast.success('Model ready', `${model.label} is loaded on this device.`)
      } catch (error) {
        toast.error(
          'Model failed to load',
          error instanceof Error ? error.message : 'An unexpected error occurred.',
        )
      }
    },
    [capabilities, settings, toast],
  )

  const handleClearConversations = useCallback(async () => {
    await chat.clearAllConversations()
    toast.success('Conversations deleted', 'This browser no longer stores them.')
  }, [chat, toast])

  const handleClearModelCache = useCallback(async () => {
    try {
      modelManager.reset()
      refreshStatuses()
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys()
        const targets = keys.filter((key) =>
          /transformers|onnx|browser-ai/i.test(key),
        )
        await Promise.all(targets.map((key) => caches.delete(key)))
      }
      await refreshCapabilities()
      toast.success(
        'Model cache cleared',
        'Models will download again the next time you use them.',
      )
    } catch (error) {
      toast.error(
        'Could not clear the cache',
        error instanceof Error ? error.message : 'Try again after reloading.',
      )
    }
  }, [refreshCapabilities, refreshStatuses, toast])

  const handleResetSettings = useCallback(() => {
    resetSettings()
    setSettingsOpen(false)
    setShowSetup(true)
    setDraft('')
    setSpeakingMessageId(null)
    tts.stop()
    toast.info('Settings reset', 'Your conversations were kept.')
  }, [resetSettings, tts, toast])

  const handleCompleteSetup = useCallback(() => {
    completeOnboarding()
    setShowSetup(false)
    toast.success(
      'Your companion is ready',
      'Say hello or type a message. The first reply downloads the model once.',
    )
  }, [completeOnboarding, toast])

  const handleTestVoice = useCallback(() => {
    speakRef.current(
      `Hi, I'm ${ANIMAL_CONFIGS[settings.avatar].label.toLowerCase()}. This is how I sound.`,
      'preview',
    )
  }, [settings.avatar])

  const avatarState: AvatarState = (() => {
    if (voiceInput.state === 'recording') return 'listening'
    if (tts.speaking) return 'speaking'
    if (chat.status === 'error' || voiceInput.state === 'error') return 'error'
    if (
      chat.status === 'thinking' ||
      chat.status === 'loading' ||
      voiceInput.state === 'transcribing' ||
      tts.synthesizing
    ) {
      return 'thinking'
    }
    if (happy) return 'happy'
    return 'idle'
  })()

  const textModel = getModelById(settings.textModelId)
  const textStatus = getStatus(settings.textModelId)
  const voiceAvailable =
    tts.supported || settings.ttsEngine === 'kokoro' || settings.voiceMode !== 'text'
  const title = chat.activeConversation?.title ?? 'New conversation'

  if (setupVisible) {
    return (
      <SetupWizard
        settings={settings}
        capabilities={capabilities}
        assessment={assessment}
        detecting={detecting}
        detectionError={detectionError}
        onRefreshCapabilities={refreshCapabilities}
        onSetMode={setMode}
        onUpdate={updateSettings}
        onComplete={handleCompleteSetup}
      />
    )
  }

  return (
    <div className="app-shell">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        conversations={chat.conversations}
        activeId={chat.activeId}
        avatar={settings.avatar}
        modelId={settings.textModelId}
        modelStatus={textStatus}
        onNew={chat.newConversation}
        onSelect={(id) => void chat.selectConversation(id)}
        onDelete={setPendingDeleteId}
        onRename={(id, name) => void chat.renameConversation(id, name)}
        onOpenSettings={() => {
          setSidebarOpen(false)
          setSettingsOpen(true)
        }}
        onOpenSetup={() => {
          setSidebarOpen(false)
          setShowSetup(true)
        }}
        onClearAll={() => setConfirmClearAll(true)}
      />

      <div className="app-main">
        <ChatHeader
          title={title}
          avatar={settings.avatar}
          modelLabel={textModel?.label ?? settings.textModelId}
          modelStatus={textStatus}
          onOpenSidebar={() => setSidebarOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          autoSpeak={settings.autoSpeak}
          onToggleAutoSpeak={() => {
            const next = !settings.autoSpeak
            updateSettings({ autoSpeak: next })
            if (!next) handleStopSpeak()
          }}
          speaking={tts.speaking}
          onStopSpeak={handleStopSpeak}
          voiceAvailable={voiceAvailable}
        />

        {chat.persistenceWarning && !persistenceDismissed && (
          <div className="flex items-start gap-2 border-b border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200 sm:px-5">
            <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
            <p className="flex-1">
              IndexedDB is unavailable, so conversations are kept in memory for
              this tab only and will disappear on reload.
            </p>
            <button
              type="button"
              className="btn-icon h-6 w-6 shrink-0"
              onClick={() => setPersistenceDismissed(true)}
              aria-label="Dismiss storage warning"
            >
              <Icon name="x" size={13} />
            </button>
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <ChatView
              messages={chat.messages}
              animal={settings.avatar}
              streamingMessageId={chat.streamingMessageId}
              isGenerating={chat.isGenerating}
              speakingMessageId={activeSpeakingId}
              canSpeak={voiceAvailable}
              canRegenerate={chat.messages.some(
                (message) => message.role === 'user',
              )}
              onSpeak={handleSpeak}
              onStopSpeak={handleStopSpeak}
              onRegenerate={() => void chat.regenerate()}
              onDelete={(id) => void chat.deleteMessage(id)}
              onSuggestion={(text) => handleSend(text)}
              onStartVoice={
                settings.voiceMode === 'text' ? undefined : handleStartListening
              }
              textModelId={settings.textModelId}
              voiceEnabled={settings.voiceMode !== 'text'}
              onOpenSetup={() => setShowSetup(true)}
            />

            <Composer
              draft={draft}
              onDraftChange={setDraft}
              onSend={() => handleSend()}
              onStop={chat.stopGeneration}
              isGenerating={chat.isGenerating}
              voiceMode={settings.voiceMode}
              voiceState={voiceInput.state}
              voiceLevel={voiceInput.level}
              voiceError={voiceInput.error}
              micSupported={voiceInput.isSupported}
              onStartListening={handleStartListening}
              onStopListening={handleStopListening}
              onCancelListening={handleCancelListening}
            />
          </div>

          {chat.messages.length > 0 && (
            <aside className="hidden w-72 shrink-0 flex-col gap-4 border-l border-[var(--border-subtle)] px-4 py-5 xl:flex">
              <div className="card flex flex-col items-center p-4">
                <AvatarPanel
                  animal={settings.avatar}
                  state={avatarState}
                  size={150}
                  level={voiceInput.level}
                  showWaveform={settings.showWaveform}
                  compact
                />
                <div className="mt-3 flex w-full flex-wrap justify-center gap-1.5">
                  <span className="chip capitalize">{settings.mode}</span>
                  <span className="chip">
                    <Icon
                      name={capabilities?.webgpu ? 'zap' : 'cpu'}
                      size={11}
                    />
                    {capabilities?.webgpu ? 'WebGPU' : 'CPU'}
                  </span>
                </div>
                {tts.speaking && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm mt-3 w-full"
                    onClick={handleStopSpeak}
                  >
                    <Icon name="stop" size={13} />
                    Stop speaking
                  </button>
                )}
              </div>

              <div className="card p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  This conversation
                </p>
                <dl className="mt-2 space-y-1.5 text-[11px]">
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--text-subtle)]">Messages</dt>
                    <dd className="font-medium text-[var(--text-secondary)]">
                      {chat.messages.length}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--text-subtle)]">Model</dt>
                    <dd className="max-w-[9rem] truncate text-right font-medium text-[var(--text-secondary)]">
                      {textModel?.label ?? settings.textModelId}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--text-subtle)]">Memory</dt>
                    <dd className="font-medium text-[var(--text-secondary)]">
                      {settings.contextTurns} turns
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--text-subtle)]">Status</dt>
                    <dd
                      className={cn(
                        'font-medium',
                        chat.status === 'error'
                          ? 'text-rose-300'
                          : chat.status === 'thinking' ||
                              chat.status === 'loading'
                            ? 'text-amber-300'
                            : 'text-emerald-300',
                      )}
                    >
                      {chat.status === 'thinking' || chat.status === 'loading'
                        ? 'Working'
                        : chat.status === 'error'
                          ? 'Needs attention'
                          : 'Ready'}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={chat.newConversation}
                  >
                    <Icon name="plus" size={13} />
                    New
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setSettingsOpen(true)}
                  >
                    <Icon name="sliders" size={13} />
                    Tune
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 p-3">
                <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-[var(--text-subtle)]">
                  <Icon name="shield" size={12} className="mt-0.5 shrink-0" />
                  Messages, audio and model inference stay inside this browser.
                  Small models can be wrong — verify anything important.
                </p>
              </div>
            </aside>
          )}
        </div>
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        capabilities={capabilities}
        assessment={assessment}
        modelStatuses={statuses}
        voices={tts.voices}
        persistenceWarning={chat.persistenceWarning}
        onUpdate={updateSettings}
        onSetMode={(mode: OperatingMode) => setMode(mode)}
        onDownloadModel={(kind) => void handleDownloadModel(kind)}
        onTestVoice={handleTestVoice}
        onClearConversations={() => void handleClearConversations()}
        onClearModelCache={() => void handleClearModelCache()}
        onResetSettings={handleResetSettings}
        onOpenSetup={() => {
          setSettingsOpen(false)
          setShowSetup(true)
        }}
      />

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Delete this conversation?"
        description="The messages in this conversation will be removed from this browser. This cannot be undone."
        confirmLabel="Delete conversation"
        destructive
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={() => {
          if (pendingDeleteId) void chat.removeConversation(pendingDeleteId)
          setPendingDeleteId(null)
        }}
      />

      <ConfirmDialog
        open={confirmClearAll}
        title="Delete every conversation?"
        description="All chat history stored in this browser will be removed permanently. Your settings and downloaded models are kept."
        confirmLabel="Delete all"
        destructive
        onCancel={() => setConfirmClearAll(false)}
        onConfirm={() => {
          setConfirmClearAll(false)
          void handleClearConversations()
        }}
      />
    </div>
  )
}

export default App
