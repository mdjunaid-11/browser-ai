export type OperatingMode = 'potato' | 'balanced' | 'quality' | 'custom'

export type Backend = 'wasm' | 'webgpu'
export type BackendPreference = 'auto' | Backend
export type ThemePreference = 'dark' | 'light' | 'system'

export type ModelKind = 'text' | 'asr' | 'tts'
export type ModelQuality = 'basic' | 'balanced' | 'high'
export type TextModelArchitecture = 'seq2seq' | 'causal'
export type TTSEngine = 'browser' | 'kokoro'
export type VoiceMode = 'text' | 'push-to-talk' | 'auto'

export const ANIMAL_IDS = [
  'cat',
  'fox',
  'panda',
  'rabbit',
  'dog',
  'bear',
  'penguin',
  'owl',
  'hamster',
] as const

export type AnimalId = (typeof ANIMAL_IDS)[number]

export type AvatarState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'happy'
  | 'error'

export interface ModelInfo {
  id: string
  kind: ModelKind
  label: string
  family: string
  description: string
  /** Approximate quantized download size for the CPU/WASM build. */
  approxSizeMB: number
  /** Approximate download size for the WebGPU build, when different. */
  approxWebGpuSizeMB?: number
  /** Transformers.js dtype used for each backend. */
  dtype: { wasm: string; webgpu?: string }
  backends: Backend[]
  modes: OperatingMode[]
  quality: ModelQuality
  /** Conservative guidance, not a hard guarantee. */
  minMemoryGB: number
  minCores?: number
  license: string
  task: string
  architecture?: TextModelArchitecture
  multilingual?: boolean
  languages?: string[]
  recommended?: boolean
  notes?: string
}

export interface ModelRuntimeStatus {
  modelId: string
  kind: ModelKind
  state: 'idle' | 'downloading' | 'loading' | 'ready' | 'error' | 'unloaded'
  progress: number
  loadedBytes: number
  totalBytes: number
  device?: Backend
  dtype?: string
  error?: string
  startedAt?: number
  finishedAt?: number
}

export interface DeviceCapabilities {
  hardwareConcurrency: number | null
  deviceMemoryGB: number | null
  webgpu: boolean
  webgpuAdapter: string | null
  wasm: boolean
  wasmSimd: boolean
  worker: boolean
  indexedDB: boolean
  storageQuotaMB: number | null
  storageUsageMB: number | null
  crossOriginIsolated: boolean
  online: boolean
  connectionType: string | null
  browserName: string
  browserVersion: string | null
  osName: string
  secureContext: boolean
  touch: boolean
  screenWidth: number | null
  screenHeight: number | null
  languages: string[]
  checkedAt: number
}

export type DeviceProfile = 'unsupported' | 'low' | 'standard' | 'high'

export interface DeviceAssessment {
  score: number
  profile: DeviceProfile
  recommendedMode: OperatingMode
  reasons: string[]
  warnings: string[]
}

export interface AppSettings {
  version: 2
  onboarded: boolean
  mode: OperatingMode
  textModelId: string
  asrModelId: string
  ttsEngine: TTSEngine
  backend: BackendPreference
  maxNewTokens: number
  typingSpeed: number
  contextTurns: number
  autoSpeak: boolean
  autoSubmitTranscript: boolean
  voiceMode: VoiceMode
  language: 'auto' | 'en' | 'hi'
  browserVoiceURI: string
  browserVoiceLang: string
  voiceRate: number
  voicePitch: number
  voiceVolume: number
  kokoroVoice: string
  avatar: AnimalId
  theme: ThemePreference
  reduceMotion: boolean
  showWaveform: boolean
}

export type MessageRole = 'user' | 'assistant' | 'system'
export type MessageStatus = 'complete' | 'streaming' | 'error' | 'stopped'

export interface ChatMessage {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  createdAt: number
  updatedAt: number
  status: MessageStatus
  modelId?: string
  error?: string
  durationMs?: number
  tokensPerSecond?: number
}

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  preview: string
  messageCount: number
}

export type ToastKind = 'info' | 'success' | 'warning' | 'error'

export interface ToastMessage {
  id: string
  kind: ToastKind
  title: string
  description?: string
  duration?: number
}

export interface GenerationOptions {
  maxNewTokens: number
  temperature: number
  topP: number
  contextTurns: number
}

export interface GenerationResult {
  text: string
  durationMs: number
  tokensPerSecond: number
}

export interface SpeechVoiceInfo {
  uri: string
  name: string
  lang: string
  localService: boolean
  default: boolean
}

export interface SpeechSynthesisSnapshot {
  speaking: boolean
  paused: boolean
  text: string | null
  engine: TTSEngine | null
}
