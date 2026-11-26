import type { Backend, ModelKind } from '../../types'

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface WorkerConfig {
  maxLoadedPipelines: number
  numThreads: number
  wasmPaths: { mjs: string; wasm: string }
  allowWebGpu: boolean
}

export interface LoadTextRequest {
  type: 'load-text'
  requestId: string
  modelId: string
  backend: Backend
}

export interface LoadAsrRequest {
  type: 'load-asr'
  requestId: string
  modelId: string
  backend: Backend
}

export interface LoadTtsRequest {
  type: 'load-tts'
  requestId: string
  modelId: string
  backend: Backend
}

export interface GenerateRequest {
  type: 'generate'
  requestId: string
  modelId: string
  backend: Backend
  messages: ModelMessage[]
  options: {
    maxNewTokens: number
    temperature: number
    topP: number
    contextTurns: number
  }
}

export interface TranscribeRequest {
  type: 'transcribe'
  requestId: string
  modelId: string
  backend: Backend
  audio: Float32Array
  language?: string
  /** A bounded audio window used only for a partial hypothesis. */
  partial?: boolean
}

export interface SynthesizeRequest {
  type: 'synthesize'
  requestId: string
  modelId: string
  backend: Backend
  text: string
  voice: string
  speed: number
}

export interface CancelRequest {
  type: 'cancel'
  requestId: string
}

export interface UnloadRequest {
  type: 'unload'
  kind: ModelKind
}

export interface ConfigureRequest {
  type: 'configure'
  config: WorkerConfig
}

export type WorkerRequest =
  | ConfigureRequest
  | LoadTextRequest
  | LoadAsrRequest
  | LoadTtsRequest
  | GenerateRequest
  | TranscribeRequest
  | SynthesizeRequest
  | CancelRequest
  | UnloadRequest

export interface WorkerProgressResponse {
  type: 'progress'
  kind: ModelKind
  modelId: string
  progress: number
  loadedBytes: number
  totalBytes: number
  file?: string
  status?: string
}

export interface WorkerLoadedResponse {
  type: 'loaded'
  kind: ModelKind
  modelId: string
  backend: Backend
  dtype: string
}

export interface WorkerTokenResponse {
  type: 'token'
  requestId: string
  text: string
}

export interface WorkerDoneResponse {
  type: 'done'
  requestId: string
  text: string
  durationMs: number
  tokensPerSecond: number
  backend: Backend
}

export interface WorkerTranscribedResponse {
  type: 'transcribed'
  requestId: string
  text: string
}

/** A lower-confidence hypothesis from a bounded audio window, not final text. */
export interface WorkerPartialTranscriptResponse {
  type: 'transcript-partial'
  requestId: string
  text: string
}

export interface WorkerAudioResponse {
  type: 'audio'
  requestId: string
  audio: Float32Array
  samplingRate: number
}

export interface WorkerCancelledResponse {
  type: 'cancelled'
  requestId: string
}

export interface WorkerErrorResponse {
  type: 'error'
  requestId?: string
  kind?: ModelKind
  modelId?: string
  message: string
  code: string
  recoverable?: boolean
}

export interface WorkerNoticeResponse {
  type: 'notice'
  message: string
  code: string
}

export interface WorkerUnloadedResponse {
  type: 'unloaded'
  kind: ModelKind
}

export interface WorkerStatusResponse {
  type: 'status'
  loaded: Array<{ kind: ModelKind; modelId: string; backend: Backend }>
}

export type WorkerResponse =
  | WorkerProgressResponse
  | WorkerLoadedResponse
  | WorkerTokenResponse
  | WorkerDoneResponse
  | WorkerTranscribedResponse
  | WorkerPartialTranscriptResponse
  | WorkerAudioResponse
  | WorkerCancelledResponse
  | WorkerErrorResponse
  | WorkerNoticeResponse
  | WorkerUnloadedResponse
  | WorkerStatusResponse
