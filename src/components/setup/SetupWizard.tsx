import { useEffect, useMemo, useState } from 'react'
import type {
  AppSettings,
  DeviceAssessment,
  DeviceCapabilities,
  OperatingMode,
  VoiceMode,
} from '../../types'
import {
  estimateModelSizeMB,
  formatModelSize,
  getDefaultTextModelId,
  getModelById,
} from '../../ai/models/modelRegistry'
import { describeDevice } from '../../services/device/deviceCapabilities'
import { voiceManager } from '../../services/audio/textToSpeech'
import { cn } from '../../utils/cn'
import { BrandMark } from '../ui/Brand'
import { Icon } from '../ui/Icon'
import { ProgressBar } from '../ui/ProgressBar'
import { Switch } from '../ui/Switch'
import { AvatarPicker } from '../avatar/AvatarPicker'
import { AnimalAvatar } from '../avatar/AnimalAvatar'
import { ANIMAL_CONFIGS } from '../avatar/animalConfig'

interface SetupWizardProps {
  settings: AppSettings
  capabilities: DeviceCapabilities | null
  assessment: DeviceAssessment | null
  detecting: boolean
  detectionError: string | null
  onRefreshCapabilities: () => Promise<void>
  onSetMode: (mode: OperatingMode) => void
  onUpdate: (patch: Partial<AppSettings>) => void
  onComplete: () => void
}

const STEPS = ['Welcome', 'Device', 'Mode', 'Voice', 'Ready'] as const

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
    detail: 'Smallest text model, browser voice, single model in memory.',
    icon: 'zap',
  },
  {
    id: 'balanced',
    title: 'Balanced',
    badge: 'Recommended',
    description: 'The best everyday trade-off.',
    detail: 'A more capable text model with browser speech and modest memory use.',
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
  {
    id: 'text',
    title: 'Text only',
    description: 'Type and read. No microphone or spoken replies.',
    icon: 'message',
  },
  {
    id: 'push-to-talk',
    title: 'Push to talk',
    description: 'Hold the microphone to speak, then hear the answer on demand.',
    icon: 'mic',
  },
  {
    id: 'auto',
    title: 'Auto conversation',
    description: 'Speak, pause, and the assistant replies aloud, then listens again.',
    icon: 'waveform',
  },
]

export function SetupWizard({
  settings,
  capabilities,
  assessment,
  detecting,
  detectionError,
  onRefreshCapabilities,
  onSetMode,
  onUpdate,
  onComplete,
}: SetupWizardProps) {
  const [step, setStep] = useState(0)
  const [previewing, setPreviewing] = useState(false)
  const [voices, setVoices] = useState(() => voiceManager.getVoices())

  useEffect(() => {
    const unsubscribe = voiceManager.onVoicesChanged(() =>
      setVoices(voiceManager.getVoices()),
    )
    const timer = window.setTimeout(
      () => setVoices(voiceManager.getVoices()),
      400,
    )
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

  const voiceList = useMemo(() => {
    const english = voices.filter((voice) => /^en/i.test(voice.lang))
    return english.length > 0 ? english : voices
  }, [voices])

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

  return (
    <div className="relative min-h-dvh overflow-y-auto">
      <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-4 py-6 sm:px-6 sm:py-10">
        <header className="flex items-center justify-between gap-4">
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
          <button
            type="button"
            className="text-xs font-medium text-[var(--text-subtle)] underline-offset-4 hover:text-[var(--text)] hover:underline"
            onClick={() => {
              onSetMode('balanced')
              onComplete()
            }}
          >
            Skip and use balanced defaults
          </button>
        </header>

        <nav aria-label="Setup progress" className="mt-7">
          <ol className="flex items-center gap-1.5 sm:gap-2">
            {STEPS.map((label, index) => {
              const active = index === step
              const complete = index < step
              return (
                <li key={label} className="flex flex-1 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (index <= step) setStep(index)
                    }}
                    disabled={index > step}
                    aria-current={active ? 'step' : undefined}
                    className={cn(
                      'flex min-w-0 flex-1 items-center gap-2 rounded-full border px-2 py-1.5 text-left transition sm:px-3',
                      active
                        ? 'border-[var(--border-strong)] bg-[var(--accent-soft)]'
                        : complete
                          ? 'border-[var(--border)] bg-[var(--surface-2)]'
                          : 'border-transparent bg-[var(--surface-2)]/50',
                    )}
                  >
                    <span
                      className={cn(
                        'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold',
                        active
                          ? 'bg-[var(--accent-strong)] text-white'
                          : complete
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-[var(--surface-4)] text-[var(--text-subtle)]',
                      )}
                    >
                      {complete ? <Icon name="check" size={11} /> : index + 1}
                    </span>
                    <span
                      className={cn(
                        'hidden truncate text-[11px] font-semibold sm:block',
                        active
                          ? 'text-[var(--text)]'
                          : 'text-[var(--text-subtle)]',
                      )}
                    >
                      {label}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>

        <main className="mt-6 flex-1">
          {step === 0 && (
            <section className="grid gap-6 animate-fade-in lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
              <div>
                <span className="chip chip-accent">
                  <Icon name="shield" size={12} />
                  100% on-device
                </span>
                <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-[var(--text)] sm:text-4xl">
                  A little companion that lives in your browser.
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--text-muted)] sm:text-base">
                  Chat by text or voice with a small language model running
                  locally. No account, no server, and no conversation ever leaves
                  your device. The first model download is the only time the app
                  touches the network.
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
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={next}
                  >
                    Get started
                    <Icon name="arrow-up" size={16} className="rotate-90" />
                  </button>
                  <span className="text-[11px] text-[var(--text-subtle)]">
                    Takes about a minute · no sign-up
                  </span>
                </div>
              </div>

              <div className="relative mx-auto w-full max-w-xs">
                <div className="absolute inset-6 -z-10 rounded-full bg-[var(--accent)] opacity-20 blur-3xl" />
                <div className="card flex flex-col items-center gap-3 p-6">
                  <AnimalAvatar animal={settings.avatar} state="happy" size={170} />
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
                Browser checks are approximate. They only shape the
                recommendation — you stay in control.
              </p>

              {detecting ? (
                <div className="card mt-5 p-6">
                  <ProgressBar
                    value={0}
                    indeterminate
                    label="Checking browser capabilities…"
                  />
                  <p className="mt-3 text-xs text-[var(--text-subtle)]">
                    Looking for WebAssembly, WebGPU, memory hints, and storage.
                  </p>
                </div>
              ) : (
                <div className="card mt-5 overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                        <Icon name="monitor" size={20} />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-[var(--text)]">
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
                      className="btn btn-secondary btn-sm"
                      onClick={() => void onRefreshCapabilities()}
                    >
                      <Icon name="refresh" size={14} />
                      Re-check
                    </button>
                  </div>

                  {capabilities && (
                    <div className="grid grid-cols-2 gap-px bg-[var(--border-subtle)] sm:grid-cols-3">
                      {[
                        [
                          'Memory hint',
                          capabilities.deviceMemoryGB
                            ? `${capabilities.deviceMemoryGB} GB`
                            : 'Not exposed',
                        ],
                        [
                          'Logical cores',
                          capabilities.hardwareConcurrency?.toString() ??
                            'Unknown',
                        ],
                        [
                          'GPU',
                          capabilities.webgpu
                            ? 'WebGPU ready'
                            : 'CPU / WASM',
                        ],
                        [
                          'WASM SIMD',
                          capabilities.wasmSimd ? 'Supported' : 'Unavailable',
                        ],
                        [
                          'Storage',
                          capabilities.storageQuotaMB
                            ? `${capabilities.storageQuotaMB} MB quota`
                            : 'Not reported',
                        ],
                        [
                          'Threads',
                          capabilities.crossOriginIsolated
                            ? 'Multi-threaded'
                            : 'Single-threaded',
                        ],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="bg-[var(--surface-2)] px-4 py-3"
                        >
                          <p className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
                            {label}
                          </p>
                          <p className="mt-0.5 text-sm font-medium text-[var(--text)]">
                            {value}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {assessment && (
                    <div className="space-y-3 px-5 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="chip chip-accent">
                          Suggested: {recommendedMode}
                        </span>
                        {assessment.reasons.slice(0, 2).map((reason) => (
                          <span key={reason} className="chip">
                            <Icon name="check" size={11} />
                            {reason}
                          </span>
                        ))}
                      </div>
                      {assessment.warnings.length > 0 && (
                        <ul className="space-y-1.5">
                          {assessment.warnings.slice(0, 3).map((warning) => (
                            <li
                              key={warning}
                              className="flex items-start gap-2 text-[11px] leading-relaxed text-[var(--text-subtle)]"
                            >
                              <Icon
                                name="info"
                                size={13}
                                className="mt-0.5 shrink-0 text-amber-300"
                              />
                              {warning}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {detectionError && (
                    <p className="border-t border-[var(--border-subtle)] px-5 py-3 text-xs text-amber-300">
                      {detectionError} You can continue with the default
                      settings.
                    </p>
                  )}
                </div>
              )}

              <div className="mt-5 flex justify-between gap-2">
                <button type="button" className="btn btn-ghost" onClick={back}>
                  Back
                </button>
                <button type="button" className="btn btn-primary" onClick={next}>
                  Continue
                  <Icon name="chevron-right" size={16} />
                </button>
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="animate-fade-in">
              <h2 className="text-xl font-semibold tracking-tight text-[var(--text)] sm:text-2xl">
                Choose how much model you want
              </h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Every mode stays fully local. Bigger models give better answers
                but need more memory and download time.
              </p>

              <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                {MODE_INFO.map((mode) => {
                  const active = settings.mode === mode.id
                  const suggested = recommendedMode === mode.id
                  const model = getModelById(getDefaultTextModelId(mode.id))
                  const size = model
                    ? estimateModelSizeMB(
                        model,
                        capabilities?.webgpu ? 'webgpu' : 'wasm',
                      )
                    : 0
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => onSetMode(mode.id)}
                      aria-pressed={active}
                      className={cn(
                        'relative flex flex-col rounded-2xl border p-4 text-left transition',
                        active
                          ? 'border-[var(--border-strong)] bg-[var(--accent-soft)]'
                          : 'border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)]',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            'grid h-9 w-9 place-items-center rounded-xl',
                            active
                              ? 'bg-[var(--accent-strong)] text-white'
                              : 'bg-[var(--surface-3)] text-[var(--accent)]',
                          )}
                        >
                          <Icon name={mode.icon} size={17} />
                        </span>
                        <div className="flex items-center gap-1.5">
                          {suggested && (
                            <span className="chip chip-accent">
                              For this device
                            </span>
                          )}
                          <span className="chip">{mode.badge}</span>
                        </div>
                      </div>
                      <p className="mt-3 text-sm font-semibold text-[var(--text)]">
                        {mode.title}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                        {mode.description}
                      </p>
                      <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-subtle)]">
                        {mode.detail}
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-2.5">
                        <span className="truncate text-[11px] font-medium text-[var(--text-secondary)]">
                          {model?.label ?? 'Your current model'}
                        </span>
                        {size > 0 && (
                          <span className="shrink-0 text-[11px] text-[var(--text-subtle)]">
                            {formatModelSize(size)} download
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>

              <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-[var(--text-subtle)]">
                <Icon name="info" size={13} className="mt-0.5 shrink-0" />
                Model files download once and are cached by your browser. The
                app never downloads anything until you send your first message
                (or press a download button).
              </p>

              <div className="mt-5 flex justify-between gap-2">
                <button type="button" className="btn btn-ghost" onClick={back}>
                  Back
                </button>
                <button type="button" className="btn btn-primary" onClick={next}>
                  Continue
                  <Icon name="chevron-right" size={16} />
                </button>
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="animate-fade-in">
              <h2 className="text-xl font-semibold tracking-tight text-[var(--text)] sm:text-2xl">
                Meet your companion
              </h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Pick an animal friend and decide how you want to talk.
              </p>

              <div className="mt-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="card flex flex-col items-center p-5">
                  <AnimalAvatar
                    animal={settings.avatar}
                    state={previewing ? 'speaking' : 'happy'}
                    size={150}
                  />
                  <p className="mt-2 text-sm font-semibold text-[var(--text)]">
                    {animal.label}
                  </p>
                  <p className="text-xs text-[var(--text-subtle)]">
                    {animal.tagline}
                  </p>
                  <div className="mt-4 w-full">
                    <AvatarPicker
                      value={settings.avatar}
                      onChange={(value) => onUpdate({ avatar: value })}
                      compact
                    />
                  </div>
                </div>

                <div className="space-y-3">
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
                              'flex items-start gap-3 rounded-xl border p-3 text-left transition',
                              active
                                ? 'border-[var(--border-strong)] bg-[var(--accent-soft)]'
                                : 'border-[var(--border-subtle)] hover:bg-[var(--surface-3)]',
                            )}
                          >
                            <span
                              className={cn(
                                'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg',
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
                  </div>

                  <div className="card p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-[var(--text)]">
                          Spoken replies
                        </p>
                        <p className="text-[11px] text-[var(--text-subtle)]">
                          {settings.ttsEngine === 'kokoro'
                            ? 'Kokoro neural voice (downloads on first use)'
                            : 'Your browser’s built-in voice'}
                        </p>
                      </div>
                      <Switch
                        checked={settings.ttsEngine === 'kokoro'}
                        onChange={(checked) =>
                          onUpdate({
                            ttsEngine: checked ? 'kokoro' : 'browser',
                          })
                        }
                        label="Use neural Kokoro voice"
                        disabled={settings.voiceMode === 'text'}
                      />
                    </div>

                    {settings.voiceMode !== 'text' && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => void previewVoice()}
                          disabled={
                            !voiceManager.isBrowserSpeechSupported()
                          }
                        >
                          <Icon
                            name={previewing ? 'stop' : 'volume'}
                            size={14}
                          />
                          {previewing ? 'Stop preview' : 'Test voice'}
                        </button>
                        <select
                          className="select max-w-[15rem] flex-1 !py-1.5 text-xs"
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

                  {settings.voiceMode !== 'text' && (
                    <p className="flex items-start gap-2 text-[11px] leading-relaxed text-[var(--text-subtle)]">
                      <Icon name="mic" size={13} className="mt-0.5 shrink-0" />
                      The first voice message downloads the local Whisper model
                      (about 41 MB). Microphone audio is processed on-device and
                      is never uploaded.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5 flex justify-between gap-2">
                <button type="button" className="btn btn-ghost" onClick={back}>
                  Back
                </button>
                <button type="button" className="btn btn-primary" onClick={next}>
                  Continue
                  <Icon name="chevron-right" size={16} />
                </button>
              </div>
            </section>
          )}

          {step === 4 && (
            <section className="animate-fade-in">
              <div className="card overflow-hidden">
                <div className="flex flex-col items-center gap-3 border-b border-[var(--border-subtle)] bg-gradient-to-br from-violet-500/10 to-transparent px-5 py-7 text-center">
                  <AnimalAvatar
                    animal={settings.avatar}
                    state="happy"
                    size={120}
                  />
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight text-[var(--text)]">
                      You’re all set
                    </h2>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      {animal.label} is ready to chat on this device.
                    </p>
                  </div>
                </div>

                <dl className="grid grid-cols-1 gap-px bg-[var(--border-subtle)] sm:grid-cols-2">
                  {[
                    ['Mode', settings.mode],
                    ['Text model', textModel?.label ?? settings.textModelId],
                    [
                      'Model size',
                      textModel
                        ? formatModelSize(
                            estimateModelSizeMB(
                              textModel,
                              capabilities?.webgpu ? 'webgpu' : 'wasm',
                            ),
                          )
                        : '—',
                    ],
                    ['Speech recognition', asrModel?.label ?? settings.asrModelId],
                    [
                      'Voice',
                      settings.ttsEngine === 'kokoro'
                        ? 'Kokoro neural voice'
                        : 'Browser voice',
                    ],
                    [
                      'Interaction',
                      settings.voiceMode === 'text'
                        ? 'Text only'
                        : settings.voiceMode === 'auto'
                          ? 'Auto conversation'
                          : 'Push to talk',
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="bg-[var(--surface-2)] px-5 py-3.5"
                    >
                      <dt className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
                        {label}
                      </dt>
                      <dd className="mt-0.5 truncate text-sm font-medium text-[var(--text)]">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>

                <div className="space-y-2 px-5 py-4">
                  <p className="flex items-start gap-2 text-[11px] leading-relaxed text-[var(--text-subtle)]">
                    <Icon name="shield" size={13} className="mt-0.5 shrink-0" />
                    Conversations and settings are stored in this browser only.
                    Clearing site data removes them permanently.
                  </p>
                  <p className="flex items-start gap-2 text-[11px] leading-relaxed text-[var(--text-subtle)]">
                    <Icon name="alert" size={13} className="mt-0.5 shrink-0 text-amber-300" />
                    Small local models can be wrong or outdated. Verify important
                    information and never treat replies as professional advice.
                  </p>
                  <p className="flex items-start gap-2 text-[11px] leading-relaxed text-[var(--text-subtle)]">
                    <Icon name="info" size={13} className="mt-0.5 shrink-0" />
                    LaMini models are CC-BY-NC-4.0 (non-commercial). SmolLM2,
                    Qwen, Whisper and Kokoro are Apache-2.0.
                  </p>
                </div>
              </div>

              <div className="mt-5 flex justify-between gap-2">
                <button type="button" className="btn btn-ghost" onClick={back}>
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-primary px-6"
                  onClick={onComplete}
                >
                  <Icon name="sparkles" size={16} />
                  Start chatting
                </button>
              </div>
            </section>
          )}
        </main>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-4 text-[10px] text-[var(--text-subtle)]">
          <span>No account · no backend · no tracking</span>
          <span>Models are downloaded from Hugging Face when needed</span>
        </footer>
      </div>
    </div>
  )
}
