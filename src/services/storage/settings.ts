import type {
  AnimalId,
  AppSettings,
  DeviceCapabilities,
  OperatingMode,
} from '../../types'
import { ANIMAL_IDS } from '../../types'
import {
  getDefaultAsrModelId,
  getDefaultTextModelId,
  getDefaultTtsEngine,
  getModelById,
} from '../../ai/models/modelRegistry'

const STORAGE_KEY = 'browser-ai:settings:v2'

export function randomAnimal(): AnimalId {
  return ANIMAL_IDS[Math.floor(Math.random() * ANIMAL_IDS.length)]
}

export function createDefaultSettings(): AppSettings {
  return {
    version: 2,
    onboarded: false,
    mode: 'balanced',
    textModelId: getDefaultTextModelId('balanced'),
    asrModelId: getDefaultAsrModelId(),
    ttsEngine: 'browser',
    backend: 'auto',
    maxNewTokens: 256,
    typingSpeed: 90,
    contextTurns: 4,
    autoSpeak: false,
    autoSubmitTranscript: false,
    voiceMode: 'push-to-talk',
    // Private local recognition is the default; network-backed recognition is
    // opt-in only and must never be selected silently.
    asrEngine: 'private',
    fastRecognitionAccepted: false,
    voiceSilenceMs: 1600,
    voiceMaxDurationMs: 60000,
    language: 'auto',
    browserVoiceURI: '',
    browserVoiceLang: '',
    voiceRate: 1,
    voicePitch: 1,
    voiceVolume: 1,
    kokoroVoice: 'af_heart',
    avatar: randomAnimal(),
    theme: 'dark',
    reduceMotion: false,
    showWaveform: true,
  }
}

export function settingsForMode(
  mode: OperatingMode,
  capabilities?: DeviceCapabilities | null,
  base?: AppSettings,
): AppSettings {
  const current = base ?? createDefaultSettings()
  const memory = capabilities?.deviceMemoryGB ?? null
  const hasWebGpu = Boolean(capabilities?.webgpu)

  if (mode === 'potato') {
    return {
      ...current,
      mode,
      textModelId: getDefaultTextModelId('potato'),
      asrModelId: 'Xenova/whisper-tiny',
      ttsEngine: 'browser',
      backend: 'wasm',
      maxNewTokens: 160,
      typingSpeed: 120,
      contextTurns: 2,
      autoSpeak: false,
      reduceMotion: true,
      asrEngine: 'private',
      fastRecognitionAccepted: false,
      voiceSilenceMs: 2000,
      voiceMaxDurationMs: 30000,
    }
  }

  if (mode === 'balanced') {
    return {
      ...current,
      mode,
      textModelId: getDefaultTextModelId('balanced'),
      asrModelId: 'Xenova/whisper-tiny',
      ttsEngine: 'browser',
      backend: 'auto',
      maxNewTokens: 256,
      typingSpeed: 90,
      contextTurns: 4,
      autoSpeak: false,
      reduceMotion: memory !== null && memory <= 2,
    }
  }

  if (mode === 'quality') {
    return {
      ...current,
      mode,
      textModelId:
        hasWebGpu && (memory === null || memory >= 4)
          ? 'HuggingFaceTB/SmolLM2-360M-Instruct'
          : 'Xenova/LaMini-Flan-T5-248M',
      asrModelId: 'Xenova/whisper-tiny',
      ttsEngine: getDefaultTtsEngine('quality'),
      backend: 'auto',
      maxNewTokens: 384,
      typingSpeed: 70,
      contextTurns: 6,
      autoSpeak: true,
      reduceMotion: false,
    }
  }

  return { ...current, mode: 'custom' }
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function validAnimal(value: unknown): value is AnimalId {
  return typeof value === 'string' && (ANIMAL_IDS as readonly string[]).includes(value)
}

export function normalizeSettings(input: unknown): AppSettings {
  const defaults = createDefaultSettings()
  if (!input || typeof input !== 'object') return defaults

  const raw = input as Partial<AppSettings> & Record<string, unknown>
  const mode: OperatingMode =
    raw.mode === 'potato' ||
    raw.mode === 'balanced' ||
    raw.mode === 'quality' ||
    raw.mode === 'custom'
      ? raw.mode
      : defaults.mode

  const textModel = getModelById(String(raw.textModelId ?? ''))
  const asrModel = getModelById(String(raw.asrModelId ?? ''))

  return {
    ...defaults,
    ...raw,
    version: 2,
    onboarded: Boolean(raw.onboarded),
    mode,
    textModelId:
      textModel?.kind === 'text'
        ? textModel.id
        : getDefaultTextModelId(mode),
    asrModelId:
      asrModel?.kind === 'asr' ? asrModel.id : getDefaultAsrModelId(),
    ttsEngine: raw.ttsEngine === 'kokoro' ? 'kokoro' : 'browser',
    backend:
      raw.backend === 'wasm' || raw.backend === 'webgpu'
        ? raw.backend
        : 'auto',
    maxNewTokens: Math.round(
      clamp(Number(raw.maxNewTokens), 32, 1024, defaults.maxNewTokens),
    ),
    typingSpeed: Math.round(
      clamp(Number(raw.typingSpeed), 0, 400, defaults.typingSpeed),
    ),
    contextTurns: Math.round(
      clamp(Number(raw.contextTurns), 1, 12, defaults.contextTurns),
    ),
    autoSpeak: Boolean(raw.autoSpeak),
    autoSubmitTranscript: Boolean(raw.autoSubmitTranscript),
    voiceMode:
      raw.voiceMode === 'auto' || raw.voiceMode === 'text'
        ? raw.voiceMode
        : 'push-to-talk',
    asrEngine:
      raw.asrEngine === 'fast' || raw.asrEngine === 'auto'
        ? raw.asrEngine
        : 'private',
    fastRecognitionAccepted: Boolean(raw.fastRecognitionAccepted),
    voiceSilenceMs: Math.round(
      clamp(Number(raw.voiceSilenceMs), 800, 5000, defaults.voiceSilenceMs),
    ),
    voiceMaxDurationMs: Math.round(
      clamp(
        Number(raw.voiceMaxDurationMs),
        15000,
        180000,
        defaults.voiceMaxDurationMs,
      ),
    ),
    language:
      raw.language === 'en' || raw.language === 'hi' ? raw.language : 'auto',
    browserVoiceURI:
      typeof raw.browserVoiceURI === 'string' ? raw.browserVoiceURI : '',
    browserVoiceLang:
      typeof raw.browserVoiceLang === 'string' ? raw.browserVoiceLang : '',
    voiceRate: clamp(Number(raw.voiceRate), 0.5, 2, defaults.voiceRate),
    voicePitch: clamp(Number(raw.voicePitch), 0, 2, defaults.voicePitch),
    voiceVolume: clamp(Number(raw.voiceVolume), 0, 1, defaults.voiceVolume),
    kokoroVoice:
      typeof raw.kokoroVoice === 'string' ? raw.kokoroVoice : defaults.kokoroVoice,
    avatar: validAnimal(raw.avatar) ? raw.avatar : randomAnimal(),
    theme:
      raw.theme === 'light' || raw.theme === 'system'
        ? raw.theme
        : 'dark',
    reduceMotion: Boolean(raw.reduceMotion),
    showWaveform: raw.showWaveform !== false,
  }
}

export function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return createDefaultSettings()
    return normalizeSettings(JSON.parse(stored))
  } catch {
    return createDefaultSettings()
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Storage can be unavailable in private mode or when the quota is full.
  }
}

export function clearSettings(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function resolveTheme(theme: AppSettings['theme']): 'dark' | 'light' {
  if (theme === 'system') {
    try {
      return window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
    } catch {
      return 'dark'
    }
  }
  return theme
}

export function applyTheme(theme: AppSettings['theme']): void {
  const resolved = resolveTheme(theme)
  document.documentElement.dataset.theme = resolved
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', resolved === 'light' ? '#f4f1ff' : '#0b0918')
  }
}
