import { useEffect, useMemo, useState } from 'react'
import type {
  AppSettings,
  AsrEngine,
  DeviceAssessment,
  DeviceCapabilities,
  OperatingMode,
  TextModelSession,
  VoiceMode,
} from '../../types'
import {
  ASR_MODELS,
  TEXT_MODELS,
  estimateModelSizeMB,
  formatModelSize,
  getDefaultTextModelId,
  getModelById,
} from '../../ai/models/modelRegistry'
import { checkModelCompatibility } from '../../ai/models/modelCompatibility'
import { describeDevice } from '../../services/device/deviceCapabilities'
import { voiceManager } from '../../services/audio/textToSpeech'
import {
  isWebSpeechSupported,
  webSpeechPrivacyNote,
} from '../../services/audio/webSpeechRecognition'
import { cn } from '../../utils/cn'
import { BrandMark } from '../ui/Brand'
import { Icon } from '../ui/Icon'
import { LoadingState } from '../ui/LoadingState'
import { ProgressBar } from '../ui/ProgressBar'
import { SelectionCard } from '../ui/SelectionCard'
import { StatusIndicator } from '../ui/StatusIndicator'
import { Switch } from '../ui/Switch'
import { AvatarPicker } from '../avatar/AvatarPicker'
import { AnimalAvatar } from '../avatar/AnimalAvatar'
import { ANIMAL_CONFIGS } from '../avatar/animalConfig'

interface SetupWizardProps {
  settings: AppSettings
  session: TextModelSession
  capabilities: DeviceCapabilities | null
  assessment: DeviceAssessment | null
  detecting: boolean
  detectionError: string | null
  onRefreshCapabilities: () => Promise<void>
  onSetMode: (mode: OperatingMode) => void
  onUpdate: (patch: Partial<AppSettings>) => void
  onInitialize: () => Promise<void>
  onRetry: () => Promise<void>
  onRestorePrevious: () => Promise<void>
  onComplete: () => void
}

const STEPS = [
  'Welcome',
  'Device',
  'Mode',
  'Companion',
  'AI model',
  'Voice',
  'Initialize',
] as const

const MODE_INFO: Array<{
  id: OperatingMode
  title: string
  badge: string
  description: string
  detail: string
  icon: 'zap' | 'sliders' | 'sparkles' | 'settings'
}> = [
  {
    id: 'potato',
    title: 'Potato',
    badge: 'Lightest',
    description: 'For older or low-memory devices.',
    detail: 'Smallest text model, browser voice, conservative voice limits.',
    icon: 'zap',
  },
  {
    id: 'balanced',
    title: 'Balanced',
    badge: 'Recommended',
    description: 'The best everyday trade-off.',
    detail: 'A more capable text model with modest memory use.',
    icon: 'sliders',
  },
  {
    id: 'quality',
    title: 'Quality',
    badge: 'Best answers',
    description: 'For modern laptops and phones.',
    detail: 'Larger chat model, optional neural voice, and more context.',
    icon: 'sparkles',
  },
  {
    id: 'custom',
    title: 'Custom',
    badge: 'Full control',
    description: 'Pick every model yourself.',
    detail: 'Starts from your current choices and lets you change them later.',
    icon: 'settings',
  },
]

const VOICE_MODES: Array<{
  id: VoiceMode
  title: string
  description: string
  icon: 'message' | 'mic' | 'waveform'
}> = [
  { id: 'text', title: 'Text only', description: 'Type and read.', icon: 'message' },
  {
    id: 'push-to-talk',
    title: 'Push to talk',
    description: 'Hold the mic, then review the text.',
    icon: 'mic',
  },
  {
    id: 'auto',
    title: 'Auto conversation',
    description: 'Speak, pause, and hear replies aloud.',
    icon: 'waveform',
  },
]

function sessionLabel(session: TextModelSession): string {
  const labels: Record<TextModelSession['state'], string> = {
    uninitialized: 'Not initialized',
    configuring: 'Checking compatibility…',
    downloading: 'Downloading model…',
    initializing: 'Initializing model…',
    ready: 'Model ready',
    error: 'Initialization failed',
  }
  return labels[session.state]
}

function sessionTone(
  session: TextModelSession,
): 'neutral' | 'ready' | 'busy' | 'error' {
  if (session.state === 'ready') return 'ready'
  if (session.state === 'error') return 'error'
  if (session.state === 'uninitialized') return 'neutral'
  return 'busy'
}

export function SetupWizard({
  settings,
  session,
  capabilities,
  assessment,
  detecting,
  detectionError,
  onRefreshCapabilities,
  onSetMode,
  onUpdate,
  onInitialize,
  onRetry,
  onRestorePrevious,
  onComplete,
}: SetupWizardProps) {
  const [step, setStep] = useState(0)
  const [previewing, setPreviewing] = useState(false)
  const [voices, setVoices] = useState(() => voiceManager.getVoices())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const unsubscribe = voiceManager.onVoicesChanged(() =>
      setVoices(voiceManager.getVoices()),
    )
    const timer = window.setTimeout(() => setVoices(voiceManager.getVoices()), 400)
    return () => {
      unsubscribe()
      window.clearTimeout(timer)
      voiceManager.stop()
    }
  }, [])

  const animal = ANIMAL_CONFIGS[settings.avatar]
  const textModel = getModelById(settings.textModelId)
  const asrModel = getModelById(settings.asrModelId)
  const recommendedMode = assessment?.recommendedMode ?? 'balanced'
  const fastSupported = isWebSpeechSupported()
  const ready =
    session.state === 'ready' && session.modelId === settings.textModelId
  const initializing =
    session.state === 'configuring' ||
    session.state === 'downloading' ||
    session.state === 'initializing'

  const voiceList = useMemo(() => {
    const english = voices.filter((voice) => /^en/i.test(voice.lang))
    return english.length > 0 ? english : voices
  }, [voices])

  const textModels = useMemo(() => {
    return TEXT_MODELS.map((model) => ({
      model,
      compatibility: capabilities
        ? checkModelCompatibility(
            model,
            capabilities,
            settings.backend,
            settings.mode,
          )
        : null,
    }))
  }, [capabilities, settings.backend, settings.mode])

  const runInitialize = async () => {
    setBusy(true)
    try {
      await onInitialize()
    } finally {
      setBusy(false)
    }
  }

  const runRetry = async () => {
    setBusy(true)
    try {
      await onRetry()
    } finally {
      setBusy(false)
    }
  }

  const previewVoice = async () => {
    if (previewing) {
      voiceManager.stop()
      setPreviewing(false)
      return
    }
    setPreviewing(true)
    try {
      await voiceManager.speak({
        engine: 'browser',
        text: `Hi, I'm your ${animal.label.toLowerCase()} companion. I run entirely in your browser.`,
        browser: {
          voiceURI: settings.browserVoiceURI,
          lang: settings.browserVoiceLang,
          rate: settings.voiceRate,
          pitch: settings.voicePitch,
          volume: settings.voiceVolume,
        },
        kokoro: {
          modelId: 'onnx-community/Kokoro-82M-v1.0-ONNX',
          voice: settings.kokoroVoice,
          speed: settings.voiceRate,
          volume: settings.voiceVolume,
          backend: 'wasm',
        },
        fallbackToBrowser: true,
        onEnd: () => setPreviewing(false),
        onError: () => setPreviewing(false),
      })
    } catch {
      setPreviewing(false)
    }
  }

  const selectVoiceMode = (voiceMode: VoiceMode) => {
    onUpdate({
      voiceMode,
      autoSpeak: voiceMode === 'auto' ? true : settings.autoSpeak,
      autoSubmitTranscript: voiceMode === 'auto' ? true : false,
      ttsEngine:
        voiceMode === 'text' && settings.ttsEngine === 'kokoro'
          ? 'browser'
          : settings.ttsEngine,
    })
  }

  const next = () => setStep((current) => Math.min(STEPS.length - 1, current + 1))
  const back = () => setStep((current) => Math.max(0, current - 1))

  const nav = (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
      <button
        type="button"
        className="btn btn-ghost min-h-11"
        onClick={back}
        disabled={step === 0}
      >
        <Icon name="chevron-right" size={16} className="rotate-180" />
        Back
      </button>
      {step < STEPS.length - 1 ? (
        <button type="button" className="btn btn-primary min-h-11 px-6" onClick={next}>
          Continue
          <Icon name="chevron-right" size={16} />
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-primary min-h-11 px-6"
          onClick={onComplete}
          disabled={!ready || busy}
        >
          <Icon name="sparkles" size={16} />
          Start chatting
        </button>
      )}
    </div>
  )

  return (
    <div className="min-h-dvh w-full overflow-x-hidden">
      <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-5 sm:px-6 sm:py-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BrandMark size={40} />
            <div>
              <p className="text-sm font-bold tracking-tight text-[var(--text)]">
                Browser AI
              </p>
              <p className="text-[11px] text-[var(--text-subtle)]">
                private · local · adaptive
              </p>
            </div>
          </div>
          <span className="chip chip-accent">
            <Icon name="shield" size={12} />
            No account · no backend
          </span>
        </header>

        <nav aria-label="Setup progress" className="mt-6">
          <div className="sm:hidden">
            <div className="flex items-center justify-between gap-2 text-xs font-semibold text-[var(--text-muted)]">
              <span>
                Step {step + 1} of {STEPS.length}
              </span>
              <span>{STEPS[step]}</span>
            </div>
            <div className="mt-2">
              <ProgressBar
                value={(step + 1) / STEPS.length}
                label={`Step ${step + 1} of ${STEPS.length}`}
              />
            </div>
          </div>
          <ol className="hidden flex-wrap gap-1.5 sm:flex">
            {STEPS.map((label, index) => {
              const active = index === step
              const complete = index < step
              return (
                <li key={label} className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (index <= step) setStep(index)
                    }}
                    disabled={index > step}
                    aria-current={active ? 'step' : undefined}
                    className={cn(
                      'flex w-full min-w-0 items-center gap-2 rounded-full border px-2 py-2 text-left transition',
                      active
                        ? 'border-[var(--border-strong)] bg-[var(--accent-soft)]'
                        : complete
                          ? 'border-[var(--border)] bg-[var(--surface-2)]'
                          : 'border-transparent bg-[var(--surface-2)]/50',
                    )}
                  >
                    <span
                      className={cn(
                        'grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold',
                        active
                          ? 'bg-[var(--accent-strong)] text-white'
                          : complete
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-[var(--surface-4)] text-[var(--text-subtle)]',
                      )}
                    >
                      {complete ? <Icon name="check" size={12} /> : index + 1}
                    </span>
                    <span className="truncate text-[11px] font-semibold text-[var(--text-muted)]">
                      {label}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>

        <main className="mt-6 min-w-0 flex-1">
          {step === 0 && (
            <section className="grid animate-fade-in gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
              <div>
                <span className="chip chip-accent">
                  <Icon name="shield" size={12} />
                  Runs in your browser
                </span>
                <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-[var(--text)] sm:text-4xl">
                  A little companion that lives in your browser.
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--text-muted)] sm:text-base">
                  Chat by text or voice with a small language model running
                  locally. No account, no server, and no conversation ever leaves
                  your device. You decide exactly when the first model downloads.
                </p>
                <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
                  {[
                    ['shield', 'Private by design', 'Messages stay in this browser.'],
                    ['cpu', 'Runs locally', 'Transformers.js + WebAssembly/WebGPU.'],
                    ['waveform', 'Voice in and out', 'Local Whisper and browser speech.'],
                    ['sparkles', 'Adapts to you', 'Picks a model that fits your device.'],
                  ].map(([icon, title, detail]) => (
                    <li key={title} className="flex items-start gap-2.5">
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                        <Icon name={icon as 'shield'} size={15} />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-[var(--text)]">
                          {title}
                        </p>
                        <p className="text-[11px] text-[var(--text-subtle)]">
                          {detail}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mx-auto w-full max-w-xs">
                <div className="card flex flex-col items-center gap-3 p-6">
                  <AnimalAvatar animal={settings.avatar} state="happy" size={160} />
                  <div className="text-center">
                    <p className="text-sm font-semibold text-[var(--text)]">
                      {animal.label}
                    </p>
                    <p className="text-xs text-[var(--text-subtle)]">
                      {animal.tagline}
                    </p>
                  </div>
                  <p className="rounded-xl bg-[var(--surface-2)] px-3 py-2 text-center text-[11px] leading-relaxed text-[var(--text-muted)]">
                    “Hi! Pick any companion you like — you can change it later.”
                  </p>
                </div>
              </div>
            </section>
          )}

          {step === 1 && (
            <section className="animate-fade-in">
              <h2 className="text-xl font-semibold tracking-tight text-[var(--text)] sm:text-2xl">
                Let’s look at this device
              </h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Browser checks are approximate. They only shape the suggestion —
                you stay in control.
              </p>
              {detecting ? (
                <div className="mt-5">
                  <LoadingState
                    label="Checking browser capabilities…"
                    detail="Looking for WebAssembly, WebGPU, memory hints, and storage."
                    indeterminate
                  />
                </div>
              ) : (
                <div className="card mt-5 overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                        <Icon name="monitor" size={20} />
                      </span>
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-[var(--text)]">
                          {capabilities
                            ? describeDevice(capabilities)
                            : 'Capabilities unavailable'}
                        </p>
                        <p className="text-[11px] text-[var(--text-subtle)]">
                          {assessment
                            ? `${assessment.profile} profile · score ${assessment.score}/100`
                            : 'Detection did not complete'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm min-h-11"
                      onClick={() => void onRefreshCapabilities()}
                    >
                      <Icon name="refresh" size={14} />
                      Re-check
                    </button>
                  </div>
                  {capabilities && (
                    <div className="grid grid-cols-2 gap-px bg-[var(--border-subtle)] sm:grid-cols-3">
                      {[
                        ['Memory hint', capabilities.deviceMemoryGB ? `${capabilities.deviceMemoryGB} GB` : 'Not exposed'],
                        ['Logical cores', capabilities.hardwareConcurrency?.toString() ?? 'Unknown'],
                        ['GPU', capabilities.webgpu ? 'WebGPU ready' : 'CPU / WASM'],
                        ['WASM SIMD', capabilities.wasmSimd ? 'Supported' : 'Unavailable'],
                        ['Storage', capabilities.storageQuotaMB ? `${capabilities.storageQuotaMB} MB quota` : 'Not reported'],
                        ['Threads', capabilities.crossOriginIsolated ? 'Multi-threaded' : 'Single-threaded'],
                      ].map(([label, value]) => (
                        <div key={label} className="min-w-0 bg-[var(--surface-2)] px-4 py-3">
                          <p className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
                            {label}
                          </p>
                          <p className="mt-0.5 break-words text-sm font-medium text-[var(--text)]">
                            {value}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  {assessment && (
                    <div className="space-y-3 px-5 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="chip chip-accent">Suggested: {recommendedMode}</span>
                        {assessment.reasons.slice(0, 2).map((reason) => (
                          <span key={reason} className="chip">
                            <Icon name="check" size={11} />
                            {reason}
                          </span>
                        ))}
                      </div>
                      {assessment.warnings.slice(0, 3).map((warning) => (
                        <p
                          key={warning}
                          className="flex items-start gap-2 text-[11px] leading-relaxed text-[var(--text-subtle)]"
                        >
                          <Icon name="info" size={13} className="mt-0.5 shrink-0 text-amber-300" />
                          {warning}
                        </p>
                      ))}
                    </div>
                  )}
                  {detectionError && (
                    <p className="border-t border-[var(--border-subtle)] px-5 py-3 text-xs text-amber-300">
                      {detectionError} You can continue with the defaults.
                    </p>
                  )}
                </div>
              )}
            </section>
          )}

          {step === 2 && (
            <section className="animate-fade-in">
              <h2 className="text-xl font-semibold tracking-tight text-[var(--text)] sm:text-2xl">
                Choose how much model you want
              </h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Every mode stays fully local. Bigger models need more memory and
                download time.
              </p>
              <div
                role="radiogroup"
                aria-label="Performance mode"
                className="mt-5 grid gap-3 sm:grid-cols-2"
              >
                {MODE_INFO.map((mode) => {
                  const model = getModelById(getDefaultTextModelId(mode.id))
                  const size = model
                    ? estimateModelSizeMB(model, capabilities?.webgpu ? 'webgpu' : 'wasm')
                    : 0
                  return (
                    <SelectionCard
                      key={mode.id}
                      selected={settings.mode === mode.id}
                      onSelect={() => onSetMode(mode.id)}
                      label={`${mode.title} mode`}
                      badge={
                        <>
                          {recommendedMode === mode.id && (
                            <span className="chip chip-accent">For this device</span>
                          )}
                          <span className="chip">{mode.badge}</span>
                        </>
                      }
                    >
                      <span className="flex items-center gap-2">
                        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--surface-3)] text-[var(--accent)]">
                          <Icon name={mode.icon} size={16} />
                        </span>
                        <span className="text-sm font-semibold text-[var(--text)]">
                          {mode.title}
                        </span>
                      </span>
                      <span className="mt-2 block text-xs text-[var(--text-muted)]">
                        {mode.description}
                      </span>
                      <span className="mt-1 block text-[11px] leading-relaxed text-[var(--text-subtle)]">
                        {mode.detail}
                      </span>
                      <span className="mt-3 block border-t border-[var(--border-subtle)] pt-2 text-[11px] text-[var(--text-subtle)]">
                        {model?.label ?? 'Your current model'}
                        {size > 0 && ` · ${formatModelSize(size)}`}
                      </span>
                    </SelectionCard>
                  )
                })}
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="animate-fade-in">
              <h2 className="text-xl font-semibold tracking-tight text-[var(--text)] sm:text-2xl">
                Meet your companion
              </h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Pick an animal friend. The name sits below the full illustration.
              </p>
              <div className="card mt-5 flex flex-wrap items-center gap-4 p-4">
                <AnimalAvatar animal={settings.avatar} state="happy" size={72} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text)]">
                    {animal.label}
                  </p>
                  <p className="text-xs text-[var(--text-subtle)]">{animal.tagline}</p>
                </div>
                <span className="ml-auto chip">Change any time</span>
              </div>
              <div className="mt-4">
                <AvatarPicker
                  value={settings.avatar}
                  onChange={(avatar) => onUpdate({ avatar })}
                />
              </div>
            </section>
          )}

          {step === 4 && (
            <section className="animate-fade-in">
              <h2 className="text-xl font-semibold tracking-tight text-[var(--text)] sm:text-2xl">
                Choose your AI text model
              </h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Nothing downloads until you press “Download & initialize” on the
                last step.
              </p>
              <div
                role="radiogroup"
                aria-label="Text generation model"
                className="mt-5 grid gap-3 lg:grid-cols-2"
              >
                {textModels.map(({ model, compatibility }) => {
                  const unavailable = compatibility?.compatible === false
                  return (
                    <SelectionCard
                      key={model.id}
                      selected={settings.textModelId === model.id}
                      onSelect={() =>
                        onUpdate({
                          textModelId: model.id,
                          mode: 'custom',
                        })
                      }
                      label={model.label}
                      disabled={unavailable}
                      badge={
                        <>
                          {model.recommended && (
                            <span className="chip chip-accent">Suggested</span>
                          )}
                          {unavailable && (
                            <span className="chip border-rose-400/30 text-rose-300">
                              Unavailable here
                            </span>
                          )}
                        </>
                      }
                    >
                      <span className="block text-sm font-semibold text-[var(--text)]">
                        {model.label}
                      </span>
                      <span className="mt-1 block text-[11px] leading-relaxed text-[var(--text-subtle)]">
                        {model.description}
                      </span>
                      <span className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-[var(--text-subtle)]">
                        <span>
                          {formatModelSize(
                            estimateModelSizeMB(model, capabilities?.webgpu ? 'webgpu' : 'wasm'),
                          )}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="break-all">{model.license}</span>
                      </span>
                    </SelectionCard>
                  )
                })}
              </div>
              <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-[var(--text-subtle)]">
                <Icon name="info" size={13} className="mt-0.5 shrink-0" />
                Files are cached by your browser after the first download.
                Switching models locks chat until the replacement is ready.
              </p>
            </section>
          )}

          {step === 5 && (
            <section className="animate-fade-in">
              <h2 className="text-xl font-semibold tracking-tight text-[var(--text)] sm:text-2xl">
                Set up your voice
              </h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Voice is optional and independent from your chat model.
              </p>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="card p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                    How you’ll chat
                  </p>
                  <div className="grid gap-2">
                    {VOICE_MODES.map((mode) => {
                      const active = settings.voiceMode === mode.id
                      return (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => selectVoiceMode(mode.id)}
                          aria-pressed={active}
                          className={cn(
                            'flex min-h-14 items-start gap-3 rounded-xl border p-3 text-left transition',
                            active
                              ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                              : 'border-[var(--border-subtle)] hover:bg-[var(--surface-3)]',
                          )}
                        >
                          <span
                            className={cn(
                              'grid h-8 w-8 shrink-0 place-items-center rounded-lg',
                              active
                                ? 'bg-[var(--accent-strong)] text-white'
                                : 'bg-[var(--surface-3)] text-[var(--accent)]',
                            )}
                          >
                            <Icon name={mode.icon} size={15} />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-[var(--text)]">
                              {mode.title}
                            </span>
                            <span className="block text-[11px] leading-relaxed text-[var(--text-subtle)]">
                              {mode.description}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--text)]">
                        Spoken replies
                      </p>
                      <p className="text-[11px] text-[var(--text-subtle)]">
                        {settings.ttsEngine === 'kokoro'
                          ? 'Kokoro neural voice'
                          : 'Browser voice'}
                      </p>
                    </div>
                    <Switch
                      checked={settings.ttsEngine === 'kokoro'}
                      onChange={(checked) =>
                        onUpdate({ ttsEngine: checked ? 'kokoro' : 'browser' })
                      }
                      label="Use neural Kokoro voice"
                      disabled={settings.voiceMode === 'text'}
                    />
                  </div>
                  {settings.voiceMode !== 'text' && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm min-h-11"
                        onClick={() => void previewVoice()}
                        disabled={!voiceManager.isBrowserSpeechSupported()}
                      >
                        <Icon name={previewing ? 'stop' : 'volume'} size={14} />
                        {previewing ? 'Stop preview' : 'Test voice'}
                      </button>
                      <select
                        className="select min-h-11 max-w-full flex-1 text-xs"
                        value={settings.browserVoiceURI}
                        onChange={(event) => {
                          const selected = voiceList.find(
                            (voice) => voice.uri === event.target.value,
                          )
                          onUpdate({
                            browserVoiceURI: event.target.value,
                            browserVoiceLang: selected?.lang ?? '',
                          })
                        }}
                        aria-label="Browser voice"
                      >
                        <option value="">Automatic voice</option>
                        {voiceList.map((voice) => (
                          <option key={voice.uri} value={voice.uri}>
                            {voice.name} ({voice.lang})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="card p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                    Speech recognition
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(
                      [
                        ['private', 'Private local', 'On-device Whisper'],
                        ['fast', 'Fast', 'Browser service'],
                        ['auto', 'Automatic', 'Prefer private'],
                      ] as Array<[AsrEngine, string, string]>
                    ).map(([value, title, detail]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => onUpdate({ asrEngine: value })}
                        aria-pressed={settings.asrEngine === value}
                        className={cn(
                          'min-h-14 rounded-xl border p-3 text-left transition',
                          settings.asrEngine === value
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                            : 'border-[var(--border-subtle)] hover:bg-[var(--surface-3)]',
                        )}
                      >
                        <span className="block text-xs font-semibold text-[var(--text)]">
                          {title}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-[var(--text-subtle)]">
                          {detail}
                        </span>
                      </button>
                    ))}
                  </div>
                  {settings.asrEngine !== 'private' && (
                    <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3">
                      <label className="flex min-h-11 items-start gap-3 text-[11px] leading-relaxed text-amber-200">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 shrink-0 accent-violet-500"
                          checked={settings.fastRecognitionAccepted}
                          onChange={(event) =>
                            onUpdate({ fastRecognitionAccepted: event.target.checked })
                          }
                        />
                        <span>
                          {fastSupported
                            ? webSpeechPrivacyNote()
                            : 'Fast recognition is not supported in this browser. Private local recognition will be used instead.'}
                        </span>
                      </label>
                    </div>
                  )}
                  <label className="mt-3 block">
                    <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                      Local recognition model
                    </span>
                    <select
                      className="select mt-1 min-h-11 text-xs"
                      value={settings.asrModelId}
                      onChange={(event) => onUpdate({ asrModelId: event.target.value })}
                    >
                      {ASR_MODELS.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.label} · {formatModelSize(model.approxSizeMB)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-[var(--text-subtle)]">
                    <Icon name="mic" size={13} className="mt-0.5 shrink-0" />
                    {settings.mode === 'potato'
                      ? 'Potato mode uses a shorter recording limit. Speak in short sentences and pause before finishing.'
                      : `${asrModel?.label ?? 'Whisper'} loads once, on your first voice message. Audio stays on this device for Private Local Recognition.`}
                  </p>
                </div>
              </div>
            </section>
          )}

          {step === 6 && (
            <section className="animate-fade-in">
              <h2 className="text-xl font-semibold tracking-tight text-[var(--text)] sm:text-2xl">
                Initialize your AI model
              </h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Chat stays locked until this succeeds. Conversations are kept.
              </p>
              <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--text)]">
                        {textModel?.label ?? settings.textModelId}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--text-subtle)]">
                        {textModel
                          ? `${formatModelSize(estimateModelSizeMB(textModel, capabilities?.webgpu ? 'webgpu' : 'wasm'))} · ${textModel.license}`
                          : 'Unknown model'}
                      </p>
                    </div>
                    <StatusIndicator tone={sessionTone(session)} pulse={initializing}>
                      {sessionLabel(session)}
                    </StatusIndicator>
                  </div>

                  {initializing && (
                    <div className="mt-5">
                      <LoadingState
                        label={sessionLabel(session)}
                        detail="Keep this tab open. The model is cached after the first successful load."
                        progress={session.progress}
                        indeterminate={
                          session.state === 'configuring' || session.progress === 0
                        }
                      />
                    </div>
                  )}

                  {session.state === 'error' && (
                    <div className="mt-5 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4">
                      <p className="text-xs font-semibold text-rose-200">
                        Initialization failed
                      </p>
                      <p className="mt-1 break-words text-[11px] leading-relaxed text-rose-200/90">
                        {session.error ?? 'An unknown error occurred.'}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm min-h-11"
                          onClick={() => void runRetry()}
                          disabled={busy}
                        >
                          <Icon name="refresh" size={14} />
                          Retry
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm min-h-11"
                          onClick={() => setStep(4)}
                        >
                          Select another model
                        </button>
                        {session.previousModelId && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm min-h-11"
                            onClick={() => void onRestorePrevious()}
                          >
                            Use previous model
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {session.state === 'uninitialized' && (
                    <button
                      type="button"
                      className="btn btn-primary mt-5 min-h-12 w-full"
                      onClick={() => void runInitialize()}
                      disabled={busy}
                    >
                      <Icon name="download" size={16} />
                      Download & initialize model
                    </button>
                  )}

                  {ready && (
                    <div className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4">
                      <StatusIndicator tone="ready">
                        Ready on {session.backend ?? 'this device'}
                      </StatusIndicator>
                      <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
                        Chat is unlocked. You can start talking to {animal.label}.
                      </p>
                    </div>
                  )}
                </div>

                <div className="card p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                    Your setup
                  </p>
                  <dl className="mt-3 space-y-2 text-xs">
                    {[
                      ['Mode', settings.mode],
                      ['Companion', animal.label],
                      ['Text model', textModel?.label ?? settings.textModelId],
                      ['Speech recognition', asrModel?.label ?? settings.asrModelId],
                      ['Voice', settings.ttsEngine === 'kokoro' ? 'Kokoro' : 'Browser voice'],
                      ['Interaction', settings.voiceMode],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="flex min-w-0 justify-between gap-3 border-b border-[var(--border-subtle)] pb-2 last:border-0"
                      >
                        <dt className="shrink-0 text-[var(--text-subtle)]">{label}</dt>
                        <dd className="min-w-0 break-words text-right font-medium text-[var(--text)]">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-4 space-y-2 text-[11px] leading-relaxed text-[var(--text-subtle)]">
                    <p className="flex items-start gap-2">
                      <Icon name="shield" size={13} className="mt-0.5 shrink-0" />
                      Conversations and settings stay in this browser.
                    </p>
                    <p className="flex items-start gap-2">
                      <Icon name="alert" size={13} className="mt-0.5 shrink-0 text-amber-300" />
                      Small local models can be wrong. Verify important information.
                    </p>
                    {textModel && (
                      <p className="flex items-start gap-2">
                        <Icon name="info" size={13} className="mt-0.5 shrink-0" />
                        {textModel.license} licensed. Non-commercial licenses apply.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}
        </main>

        {nav}

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-4 text-[10px] text-[var(--text-subtle)]">
          <span>No account · no backend · no tracking</span>
          <span>Model files come from Hugging Face when you confirm</span>
        </footer>
      </div>
    </div>
  )
}
