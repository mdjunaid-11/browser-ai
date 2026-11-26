import { useMemo, useState } from 'react'
import type {
  AppSettings,
  DeviceAssessment,
  DeviceCapabilities,
  ModelInfo,
  ModelKind,
  ModelRuntimeStatus,
  OperatingMode,
  SpeechVoiceInfo,
} from '../../types'
import {
  ASR_MODELS,
  KOKORO_VOICES,
  TEXT_MODELS,
  TTS_MODELS,
  estimateModelSizeMB,
  formatModelSize,
} from '../../ai/models/modelRegistry'
import {
  checkModelCompatibility,
  resolveBackend,
} from '../../ai/models/modelCompatibility'
import { describeRuntimeStatus } from '../../ai/models/modelManager'
import { cn } from '../../utils/cn'
import { formatBytes } from '../../utils/format'
import { AvatarPicker } from '../avatar/AvatarPicker'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { ProgressBar } from '../ui/ProgressBar'
import { SegmentedControl } from '../ui/SegmentedControl'
import { Switch } from '../ui/Switch'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  settings: AppSettings
  capabilities: DeviceCapabilities | null
  assessment: DeviceAssessment | null
  modelStatuses: ModelRuntimeStatus[]
  voices: SpeechVoiceInfo[]
  persistenceWarning: boolean
  onUpdate: (patch: Partial<AppSettings>) => void
  onSetMode: (mode: OperatingMode) => void
  onDownloadModel: (kind: ModelKind) => void
  onTestVoice: () => void
  onClearConversations: () => void
  onClearModelCache: () => void
  onResetSettings: () => void
  onOpenSetup: () => void
}

type Tab = 'general' | 'models' | 'voice' | 'privacy'

const TABS: Array<{ id: Tab; label: string; icon: 'sliders' | 'cpu' | 'volume' | 'shield' }> = [
  { id: 'general', label: 'General', icon: 'sliders' },
  { id: 'models', label: 'Models', icon: 'cpu' },
  { id: 'voice', label: 'Voice', icon: 'volume' },
  { id: 'privacy', label: 'Privacy', icon: 'shield' },
]

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="border-b border-[var(--border-subtle)] px-5 py-5 last:border-0 sm:px-7">
      <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
      {description && (
        <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-subtle)]">
          {description}
        </p>
      )}
      <div className="mt-3.5">{children}</div>
    </section>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  display: string
}) {
  return (
    <label className="block py-2">
      <span className="mb-1.5 flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-[var(--text-secondary)]">{label}</span>
        <span className="tabular-nums text-[var(--text-subtle)]">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function statusFor(
  statuses: ModelRuntimeStatus[],
  modelId: string,
): ModelRuntimeStatus | undefined {
  return statuses.find((status) => status.modelId === modelId)
}

function ModelOption({
  model,
  selected,
  status,
  capabilities,
  settings,
  onSelect,
  onDownload,
}: {
  model: ModelInfo
  selected: boolean
  status?: ModelRuntimeStatus
  capabilities: DeviceCapabilities | null
  settings: AppSettings
  onSelect: () => void
  onDownload: () => void
}) {
  const compatibility = capabilities
    ? checkModelCompatibility(
        model,
        capabilities,
        settings.backend,
        settings.mode,
      )
    : null
  const backend = capabilities
    ? resolveBackend(settings.backend, capabilities)
    : 'wasm'
  const size = estimateModelSizeMB(model, backend)
  const downloading =
    status?.state === 'downloading' || status?.state === 'loading'

  return (
    <div
      className={cn(
        'rounded-xl border p-3 transition',
        selected
          ? 'border-[var(--border-strong)] bg-[var(--accent-soft)]'
          : 'border-[var(--border-subtle)] bg-[var(--surface-2)]',
      )}
    >
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          role="radio"
          aria-checked={selected}
          onClick={onSelect}
          className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border"
          style={{
            borderColor: selected ? 'var(--accent)' : 'var(--border-strong)',
            background: selected ? 'var(--accent)' : 'transparent',
          }}
          aria-label={`Select ${model.label}`}
        >
          {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-xs font-semibold text-[var(--text)]">
              {model.label}
            </p>
            {model.recommended && (
              <span className="chip chip-accent">Suggested</span>
            )}
            {compatibility?.compatible === false && (
              <span className="chip border-rose-400/30 text-rose-300">
                Unavailable
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-subtle)]">
            {model.description}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-[var(--text-subtle)]">
            <span>{formatModelSize(size)}</span>
            <span aria-hidden="true">·</span>
            <span>{model.license}</span>
            <span aria-hidden="true">·</span>
            <span className="uppercase">{model.dtype[backend] ?? model.dtype.wasm}</span>
            {status && (
              <>
                <span aria-hidden="true">·</span>
                <span
                  className={cn(
                    status.state === 'ready' && 'text-emerald-300',
                    status.state === 'error' && 'text-rose-300',
                  )}
                >
                  {describeRuntimeStatus(status)}
                </span>
              </>
            )}
          </div>
          {compatibility && compatibility.warnings.length > 0 && (
            <ul className="mt-1.5 space-y-1">
              {compatibility.warnings.slice(0, 2).map((warning) => (
                <li
                  key={warning}
                  className="flex items-start gap-1 text-[10px] leading-relaxed text-amber-300/90"
                >
                  <Icon name="alert" size={10} className="mt-0.5 shrink-0" />
                  {warning}
                </li>
              ))}
            </ul>
          )}
          {downloading && (
            <div className="mt-2">
              <ProgressBar
                value={status?.progress ?? 0}
                detail={`${Math.round((status?.progress ?? 0) * 100)}%`}
                tone="warning"
              />
            </div>
          )}
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm shrink-0"
          onClick={onDownload}
          disabled={
            downloading ||
            compatibility?.compatible === false ||
            status?.state === 'ready'
          }
          title={
            status?.state === 'ready'
              ? 'Already loaded'
              : 'Download and load this model'
          }
        >
          <Icon
            name={status?.state === 'ready' ? 'check' : 'download'}
            size={13}
          />
          {status?.state === 'ready'
            ? 'Ready'
            : downloading
              ? 'Loading'
              : 'Load'}
        </button>
      </div>
    </div>
  )
}

export function SettingsModal({
  open,
  onClose,
  settings,
  capabilities,
  assessment,
  modelStatuses,
  voices,
  persistenceWarning,
  onUpdate,
  onSetMode,
  onDownloadModel,
  onTestVoice,
  onClearConversations,
  onClearModelCache,
  onResetSettings,
  onOpenSetup,
}: SettingsModalProps) {
  const [tab, setTab] = useState<Tab>('general')
  const [confirmAction, setConfirmAction] = useState<
    'conversations' | 'cache' | 'reset' | null
  >(null)

  const englishVoices = useMemo(() => {
    const english = voices.filter((voice) => /^en/i.test(voice.lang))
    return english.length > 0 ? english : voices
  }, [voices])

  const ttsModel = TTS_MODELS[0]

  const runConfirmed = () => {
    if (confirmAction === 'conversations') onClearConversations()
    if (confirmAction === 'cache') onClearModelCache()
    if (confirmAction === 'reset') onResetSettings()
    setConfirmAction(null)
  }

  const confirmCopy = {
    conversations: {
      title: 'Delete every conversation?',
      description:
        'All chat history stored in this browser will be removed permanently. Settings and downloaded models stay.',
      label: 'Delete conversations',
    },
    cache: {
      title: 'Clear cached models?',
      description:
        'Downloaded model files will be removed from the browser cache. They will download again the next time you use them.',
      label: 'Clear model cache',
    },
    reset: {
      title: 'Reset all app data?',
      description:
        'Conversations, settings and onboarding progress will be erased. Downloaded model files may remain in the browser cache.',
      label: 'Reset everything',
    },
  } as const

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Settings"
        subtitle={
          capabilities
            ? `${capabilities.browserName} on ${capabilities.osName} · ${assessment?.profile ?? 'unknown'} profile`
            : 'Local, private, and fully in your control'
        }
        size="lg"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onOpenSetup}
            >
              <Icon name="sparkles" size={14} />
              Re-run setup
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
              Done
            </button>
          </div>
        }
      >
        <div className="flex gap-1 border-b border-[var(--border-subtle)] px-3 pt-3 sm:px-5">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-xs font-semibold transition',
                tab === item.id
                  ? 'border-[var(--accent)] text-[var(--text)]'
                  : 'border-transparent text-[var(--text-subtle)] hover:text-[var(--text)]',
              )}
              aria-current={tab === item.id ? 'page' : undefined}
            >
              <Icon name={item.icon} size={14} />
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'general' && (
          <div>
            <Section
              title="Performance mode"
              description="A starting point for model size and memory use. You can still change individual models."
            >
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(['potato', 'balanced', 'quality', 'custom'] as OperatingMode[]).map(
                  (mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onSetMode(mode)}
                      aria-pressed={settings.mode === mode}
                      className={cn(
                        'rounded-xl border px-2 py-2 text-xs font-semibold capitalize transition',
                        settings.mode === mode
                          ? 'border-[var(--border-strong)] bg-[var(--accent-soft)] text-[var(--text)]'
                          : 'border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)]',
                      )}
                    >
                      {mode}
                      {assessment?.recommendedMode === mode && (
                        <span className="mt-0.5 block text-[9px] font-medium normal-case text-[var(--accent)]">
                          suggested
                        </span>
                      )}
                    </button>
                  ),
                )}
              </div>
            </Section>

            <Section title="Companion">
              <AvatarPicker
                value={settings.avatar}
                onChange={(avatar) => onUpdate({ avatar })}
                compact
              />
            </Section>

            <Section title="Appearance">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  Theme
                </span>
                <SegmentedControl
                  label="Theme"
                  className="w-44"
                  value={settings.theme}
                  onChange={(theme) => onUpdate({ theme })}
                  options={[
                    { value: 'dark', label: 'Dark' },
                    { value: 'light', label: 'Light' },
                    { value: 'system', label: 'System' },
                  ]}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3">
                <div>
                  <p className="text-xs font-medium text-[var(--text-secondary)]">
                    Reduce motion
                  </p>
                  <p className="text-[10px] text-[var(--text-subtle)]">
                    Calms avatar animation and transitions.
                  </p>
                </div>
                <Switch
                  checked={settings.reduceMotion}
                  onChange={(reduceMotion) => onUpdate({ reduceMotion })}
                  label="Reduce motion"
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3">
                <div>
                  <p className="text-xs font-medium text-[var(--text-secondary)]">
                    Voice waveform
                  </p>
                  <p className="text-[10px] text-[var(--text-subtle)]">
                    Show level bars while listening or speaking.
                  </p>
                </div>
                <Switch
                  checked={settings.showWaveform}
                  onChange={(showWaveform) => onUpdate({ showWaveform })}
                  label="Show waveform"
                />
              </div>
            </Section>

            <Section
              title="Generation"
              description="Shorter replies are faster and use less memory on small devices."
            >
              <Slider
                label="Typing speed"
                value={settings.typingSpeed}
                min={0}
                max={300}
                step={10}
                onChange={(typingSpeed) => onUpdate({ typingSpeed })}
                display={
                  settings.typingSpeed === 0
                    ? 'Instant'
                    : `${settings.typingSpeed} chars/s`
                }
              />
              <Slider
                label="Maximum reply length"
                value={settings.maxNewTokens}
                min={64}
                max={768}
                step={32}
                onChange={(maxNewTokens) => onUpdate({ maxNewTokens })}
                display={`${settings.maxNewTokens} tokens`}
              />
              <Slider
                label="Conversation memory"
                value={settings.contextTurns}
                min={1}
                max={10}
                step={1}
                onChange={(contextTurns) => onUpdate({ contextTurns })}
                display={`${settings.contextTurns} turns`}
              />
              <p className="mt-1 text-[10px] leading-relaxed text-[var(--text-subtle)]">
                Small models lose track of long conversations. Older messages
                stay saved in history but may be left out of the prompt.
              </p>
            </Section>
          </div>
        )}

        {tab === 'models' && (
          <div>
            <Section
              title="Execution backend"
              description="Auto picks WebGPU when your browser supports it, otherwise CPU/WASM."
            >
              <SegmentedControl
                label="Backend"
                value={settings.backend}
                onChange={(backend) => onUpdate({ backend })}
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'webgpu', label: 'WebGPU' },
                  { value: 'wasm', label: 'CPU' },
                ]}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-subtle)]">
                <span className="chip">
                  <Icon
                    name={capabilities?.webgpu ? 'zap' : 'cpu'}
                    size={11}
                  />
                  {capabilities?.webgpu
                    ? 'WebGPU available'
                    : 'CPU / WASM only'}
                </span>
                {capabilities?.storageQuotaMB && (
                  <span className="chip">
                    <Icon name="download" size={11} />
                    {capabilities.storageQuotaMB} MB storage quota
                  </span>
                )}
                {capabilities?.crossOriginIsolated ? (
                  <span className="chip">Threads enabled</span>
                ) : (
                  <span className="chip">Single-threaded</span>
                )}
              </div>
            </Section>

            <Section
              title="Text model"
              description="Only one large model is loaded at a time in low-memory modes."
            >
              <div
                role="radiogroup"
                aria-label="Text model"
                className="space-y-2"
              >
                {TEXT_MODELS.map((model) => (
                  <ModelOption
                    key={model.id}
                    model={model}
                    selected={settings.textModelId === model.id}
                    status={statusFor(modelStatuses, model.id)}
                    capabilities={capabilities}
                    settings={settings}
                    onSelect={() => onUpdate({ textModelId: model.id })}
                    onDownload={() => onDownloadModel('text')}
                  />
                ))}
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-subtle)]">
                LaMini models use the CC-BY-NC-4.0 license and may not be used
                commercially. SmolLM2 and Qwen2.5 are Apache-2.0.
              </p>
            </Section>

            <Section
              title="Speech recognition"
              description="Whisper runs locally and only loads when you use voice input."
            >
              <div
                role="radiogroup"
                aria-label="Speech recognition model"
                className="space-y-2"
              >
                {ASR_MODELS.map((model) => (
                  <ModelOption
                    key={model.id}
                    model={model}
                    selected={settings.asrModelId === model.id}
                    status={statusFor(modelStatuses, model.id)}
                    capabilities={capabilities}
                    settings={settings}
                    onSelect={() => onUpdate({ asrModelId: model.id })}
                    onDownload={() => onDownloadModel('asr')}
                  />
                ))}
              </div>
            </Section>

            <Section
              title="Neural voice"
              description="Optional. The app always falls back to your browser voice if this fails."
            >
              <div
                role="radiogroup"
                aria-label="Text to speech model"
                className="space-y-2"
              >
                {TTS_MODELS.map((model) => (
                  <ModelOption
                    key={model.id}
                    model={model}
                    selected={settings.ttsEngine === 'kokoro'}
                    status={statusFor(modelStatuses, model.id)}
                    capabilities={capabilities}
                    settings={settings}
                    onSelect={() => onUpdate({ ttsEngine: 'kokoro' })}
                    onDownload={() => onDownloadModel('tts')}
                  />
                ))}
              </div>
              <p className="mt-2 text-[10px] text-[var(--text-subtle)]">
                Kokoro supports English. Hindi replies use browser speech
                synthesis. {ttsModel ? `Approx. ${formatModelSize(ttsModel.approxSizeMB)}.` : ''}
              </p>
            </Section>
          </div>
        )}

        {tab === 'voice' && (
          <div>
            <Section
              title="Conversation style"
              description="Microphone audio is processed in this tab and never uploaded."
            >
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  ['text', 'Text only', 'No microphone'],
                  ['push-to-talk', 'Push to talk', 'Hold the mic button'],
                  ['auto', 'Auto conversation', 'Speak, pause, listen again'],
                ].map(([value, title, detail]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      const voiceMode = value as AppSettings['voiceMode']
                      onUpdate({
                        voiceMode,
                        autoSpeak: voiceMode === 'auto' ? true : settings.autoSpeak,
                        autoSubmitTranscript:
                          voiceMode === 'auto'
                            ? true
                            : settings.autoSubmitTranscript,
                      })
                    }}
                    aria-pressed={settings.voiceMode === value}
                    className={cn(
                      'rounded-xl border p-3 text-left transition',
                      settings.voiceMode === value
                        ? 'border-[var(--border-strong)] bg-[var(--accent-soft)]'
                        : 'border-[var(--border-subtle)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)]',
                    )}
                  >
                    <p className="text-xs font-semibold text-[var(--text)]">
                      {title}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[var(--text-subtle)]">
                      {detail}
                    </p>
                  </button>
                ))}
              </div>

              <div className="mt-2 space-y-0.5 border-t border-[var(--border-subtle)] pt-2">
                <label className="flex items-center justify-between gap-3 py-2">
                  <span>
                    <span className="block text-xs font-medium text-[var(--text-secondary)]">
                      Speak replies automatically
                    </span>
                    <span className="block text-[10px] text-[var(--text-subtle)]">
                      Read each completed answer aloud.
                    </span>
                  </span>
                  <Switch
                    checked={settings.autoSpeak}
                    onChange={(autoSpeak) => onUpdate({ autoSpeak })}
                    label="Speak replies automatically"
                    disabled={settings.voiceMode === 'text'}
                  />
                </label>
                <label className="flex items-center justify-between gap-3 py-2">
                  <span>
                    <span className="block text-xs font-medium text-[var(--text-secondary)]">
                      Send transcripts automatically
                    </span>
                    <span className="block text-[10px] text-[var(--text-subtle)]">
                      Skip the edit step after voice input.
                    </span>
                  </span>
                  <Switch
                    checked={settings.autoSubmitTranscript}
                    onChange={(autoSubmitTranscript) =>
                      onUpdate({ autoSubmitTranscript })
                    }
                    label="Send transcripts automatically"
                    disabled={settings.voiceMode === 'text'}
                  />
                </label>
              </div>
            </Section>

            <Section title="Voice engine">
              <SegmentedControl
                label="Voice engine"
                value={settings.ttsEngine}
                onChange={(ttsEngine) => onUpdate({ ttsEngine })}
                options={[
                  { value: 'browser', label: 'Browser voice' },
                  { value: 'kokoro', label: 'Kokoro (neural)' },
                ]}
              />
              <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--text-subtle)]">
                {settings.ttsEngine === 'browser'
                  ? 'Uses the voices already installed in your operating system or browser. No download.'
                  : 'Downloads about 92 MB on first use. Falls back to the browser voice automatically.'}
              </p>

              {settings.ttsEngine === 'browser' ? (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-[var(--text-secondary)]">
                    Browser voice
                  </label>
                  <select
                    className="select mt-1"
                    value={settings.browserVoiceURI}
                    onChange={(event) => {
                      const selected = voices.find(
                        (voice) => voice.uri === event.target.value,
                      )
                      onUpdate({
                        browserVoiceURI: event.target.value,
                        browserVoiceLang: selected?.lang ?? '',
                      })
                    }}
                  >
                    <option value="">Automatic (best available)</option>
                    {englishVoices.map((voice) => (
                      <option key={voice.uri} value={voice.uri}>
                        {voice.name} — {voice.lang}
                        {voice.localService ? '' : ' (network)'}
                      </option>
                    ))}
                  </select>
                  {voices.length === 0 && (
                    <p className="mt-1 text-[10px] text-amber-300">
                      No speech voices are available yet. Some browsers load
                      them lazily after the page settles.
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-[var(--text-secondary)]">
                    Kokoro voice
                  </label>
                  <select
                    className="select mt-1"
                    value={settings.kokoroVoice}
                    onChange={(event) =>
                      onUpdate({ kokoroVoice: event.target.value })
                    }
                  >
                    {KOKORO_VOICES.map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="button"
                className="btn btn-secondary btn-sm mt-3"
                onClick={onTestVoice}
              >
                <Icon name="volume" size={14} />
                Test voice
              </button>
            </Section>

            <Section title="Speech details">
              <Slider
                label="Speaking rate"
                value={settings.voiceRate}
                min={0.5}
                max={2}
                step={0.05}
                onChange={(voiceRate) => onUpdate({ voiceRate })}
                display={`${settings.voiceRate.toFixed(2)}×`}
              />
              <Slider
                label="Pitch"
                value={settings.voicePitch}
                min={0}
                max={2}
                step={0.05}
                onChange={(voicePitch) => onUpdate({ voicePitch })}
                display={settings.voicePitch.toFixed(2)}
              />
              <Slider
                label="Volume"
                value={settings.voiceVolume}
                min={0}
                max={1}
                step={0.05}
                onChange={(voiceVolume) => onUpdate({ voiceVolume })}
                display={`${Math.round(settings.voiceVolume * 100)}%`}
              />
              <label className="mt-2 block border-t border-[var(--border-subtle)] pt-3">
                <span className="block text-xs font-medium text-[var(--text-secondary)]">
                  Recognition language
                </span>
                <select
                  className="select mt-1"
                  value={settings.language}
                  onChange={(event) =>
                    onUpdate({
                      language: event.target.value as AppSettings['language'],
                    })
                  }
                >
                  <option value="auto">Detect automatically</option>
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                </select>
                <span className="mt-1 block text-[10px] text-[var(--text-subtle)]">
                  Whisper can auto-detect, but naming the language improves
                  accuracy.
                </span>
              </label>
            </Section>
          </div>
        )}

        {tab === 'privacy' && (
          <div>
            <Section
              title="Where your data lives"
              description="This app has no backend. Everything is stored by your browser on this device."
            >
              <ul className="space-y-2">
                {[
                  [
                    'shield',
                    'Conversations',
                    'IndexedDB in this browser profile.',
                  ],
                  [
                    'settings',
                    'Settings',
                    'Local storage for this site.',
                  ],
                  [
                    'download',
                    'Model files',
                    'Browser cache (Cache Storage), managed by Transformers.js.',
                  ],
                  [
                    'mic',
                    'Voice audio',
                    'Held in memory only, then discarded after transcription.',
                  ],
                ].map(([icon, title, detail]) => (
                  <li key={title} className="flex items-start gap-2.5">
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                      <Icon name={icon as 'shield'} size={14} />
                    </span>
                    <div>
                      <p className="text-xs font-medium text-[var(--text)]">
                        {title}
                      </p>
                      <p className="text-[10px] leading-relaxed text-[var(--text-subtle)]">
                        {detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              {persistenceWarning && (
                <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
                  IndexedDB is unavailable, so conversations are kept in memory
                  for this tab only and will be lost on reload.
                </p>
              )}
            </Section>

            <Section title="Storage">
              {capabilities ? (
                <div className="space-y-2 text-[11px] text-[var(--text-subtle)]">
                  <div className="flex justify-between gap-3">
                    <span>Reported quota</span>
                    <span className="font-medium text-[var(--text-secondary)]">
                      {capabilities.storageQuotaMB !== null
                        ? `${capabilities.storageQuotaMB} MB`
                        : 'Not reported'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Currently used</span>
                    <span className="font-medium text-[var(--text-secondary)]">
                      {capabilities.storageUsageMB !== null
                        ? formatBytes(capabilities.storageUsageMB * 1024 * 1024)
                        : 'Not reported'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Persistence</span>
                    <span className="font-medium text-[var(--text-secondary)]">
                      {capabilities.indexedDB ? 'Available' : 'Unavailable'}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-[var(--text-subtle)]">
                  Storage information is not available.
                </p>
              )}
            </Section>

            <Section title="Danger zone">
              <div className="grid gap-2">
                <button
                  type="button"
                  className="btn btn-secondary justify-start"
                  onClick={() => setConfirmAction('conversations')}
                >
                  <Icon name="trash" size={15} />
                  Delete all conversations
                </button>
                <button
                  type="button"
                  className="btn btn-secondary justify-start"
                  onClick={() => setConfirmAction('cache')}
                >
                  <Icon name="download" size={15} />
                  Clear downloaded model cache
                </button>
                <button
                  type="button"
                  className="btn btn-danger justify-start"
                  onClick={() => setConfirmAction('reset')}
                >
                  <Icon name="refresh" size={15} />
                  Reset app settings and data
                </button>
              </div>
            </Section>

            <Section title="About & disclaimer">
              <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                Browser AI runs small open models through Transformers.js. It is
                a demonstration of local inference, not a substitute for a
                search engine or a professional. Answers can be incomplete,
                biased or simply wrong. Do not rely on them for medical, legal,
                financial or safety-critical decisions.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="chip">Transformers.js</span>
                <span className="chip">Whisper · Apache-2.0</span>
                <span className="chip">Kokoro · Apache-2.0</span>
                <span className="chip">SmolLM2 · Apache-2.0</span>
                <span className="chip">Qwen2.5 · Apache-2.0</span>
                <span className="chip">LaMini · CC-BY-NC-4.0</span>
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-[var(--text-subtle)]">
                Model weights are downloaded directly from Hugging Face the first
                time you use them. This app stores no analytics and makes no
                other network requests.
              </p>
            </Section>
          </div>
        )}
      </Modal>

      {confirmAction && (
        <div className="fixed inset-0 z-[85] grid place-items-center p-4">
          <button
            type="button"
            aria-label="Cancel"
            className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
            onClick={() => setConfirmAction(null)}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            className="relative w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-6 shadow-2xl animate-modal-in"
          >
            <h3 className="text-base font-semibold text-[var(--text)]">
              {confirmCopy[confirmAction].title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
              {confirmCopy[confirmAction].description}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirmAction(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={runConfirmed}
              >
                {confirmCopy[confirmAction].label}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
