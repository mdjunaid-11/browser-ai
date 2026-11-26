import type {
  AppSettings,
  Backend,
  DeviceCapabilities,
  GenerationResult,
  ModelKind,
  ModelRuntimeStatus,
  TextModelSession,
} from '../../types'
import { checkModelCompatibility } from './modelCompatibility'
import { isTextSessionReady } from './textModelGate'
import type { ModelMessage } from '../worker/protocol'
import type {
  WorkerProgressResponse,
  WorkerRequest,
  WorkerResponse,
} from '../worker/protocol'
import { getModelById } from './modelRegistry'

export class CancelledError extends Error {
  code = 'CANCELLED'

  constructor(message = 'The request was cancelled.') {
    super(message)
    this.name = 'CancelledError'
  }
}

export class ModelManagerError extends Error {
  code: string

  constructor(message: string, code = 'MODEL_MANAGER_ERROR') {
    super(message)
    this.name = 'ModelManagerError'
    this.code = code
  }
}

export interface ManagerNotice {
  code: string
  message: string
}

type StatusListener = (status: ModelRuntimeStatus) => void
type NoticeListener = (notice: ManagerNotice) => void

interface PendingRequest {
  requestId: string
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  onToken?: (text: string) => void
  onPartial?: (text: string) => void
}

interface GenerateHandlers {
  onToken?: (text: string) => void
  signal?: AbortSignal
}

const DEFAULT_STATUS = (
  modelId: string,
  kind: ModelKind,
): ModelRuntimeStatus => ({
  modelId,
  kind,
  state: 'idle',
  progress: 0,
  loadedBytes: 0,
  totalBytes: 0,
})

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function maxLoadedForMode(mode: AppSettings['mode']): number {
  if (mode === 'potato') return 1
  if (mode === 'quality') return 3
  return 2
}

class ModelManager {
  private worker: Worker | null = null
  private statuses = new Map<string, ModelRuntimeStatus>()
  private statusListeners = new Set<StatusListener>()
  private noticeListeners = new Set<NoticeListener>()
  private textSessionListeners = new Set<() => void>()
  private pending = new Map<string, PendingRequest>()
  private loadPromises = new Map<string, Promise<void>>()
  private loadRequestKeys = new Map<string, string>()
  private unloadResolvers = new Map<ModelKind, () => void>()
  private configured = false
  private generationBusy = false
  private config: {
    maxLoadedPipelines: number
    numThreads: number
    allowWebGpu: boolean
  } = {
    maxLoadedPipelines: 2,
    numThreads: 1,
    allowWebGpu: true,
  }
  private selectedTextModelId: string | null = null
  private backendPreference: AppSettings['backend'] = 'auto'
  private lastCapabilities: DeviceCapabilities | null = null
  private mode: AppSettings['mode'] = 'balanced'
  private textSession: TextModelSession = {
    state: 'uninitialized',
    modelId: null,
    backend: null,
    progress: 0,
    error: null,
    previousModelId: null,
    attempt: 0,
  }
  private sessionLoadId = 0

  configure(
    settings: AppSettings,
    capabilities: DeviceCapabilities | null,
  ): void {
    const allowWebGpu =
      Boolean(capabilities?.webgpu) &&
      (settings.backend === 'auto' || settings.backend === 'webgpu')

    this.lastCapabilities = capabilities
    this.mode = settings.mode

    const previousModel = this.selectedTextModelId
    const modelChanged =
      previousModel !== null && previousModel !== settings.textModelId
    const backendChanged = this.backendPreference !== settings.backend
    this.selectedTextModelId = settings.textModelId
    this.backendPreference = settings.backend

    // Switching the text model or its backend invalidates readiness even when
    // the old pipeline is still cached. Chat stays locked until re-initialised.
    if (
      (modelChanged || backendChanged) &&
      this.textSession.state !== 'uninitialized'
    ) {
      this.sessionLoadId += 1
      this.setTextSession({
        state: 'uninitialized',
        modelId: null,
        backend: null,
        progress: 0,
        error: null,
        previousModelId: modelChanged ? previousModel : this.textSession.previousModelId,
      })
    }

    const cores = capabilities?.hardwareConcurrency ?? 2
    const numThreads =
      capabilities?.crossOriginIsolated === true
        ? Math.max(1, Math.min(4, Math.floor(cores / 2)))
        : 1

    this.config = {
      maxLoadedPipelines: maxLoadedForMode(settings.mode),
      numThreads,
      allowWebGpu,
    }

    if (this.worker) {
      this.post({
        type: 'configure',
        config: {
          ...this.config,
          wasmPaths: this.wasmPaths(),
        },
      })
    }
  }

  private wasmPaths(): { mjs: string; wasm: string } {
    const base = new URL(import.meta.env.BASE_URL, window.location.href)
    return {
      mjs: new URL('ort/ort-wasm-simd-threaded.jsep.mjs', base).href,
      wasm: new URL('ort/ort-wasm-simd-threaded.jsep.wasm', base).href,
    }
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker

    const worker = new Worker(new URL('../worker/aiWorker.ts', import.meta.url), {
      type: 'module',
      name: 'browser-ai-inference',
    })

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      this.handleMessage(event.data)
    }

    worker.onerror = (event) => {
      const message =
        event.message ||
        'The inference worker stopped unexpectedly. Reload the page and try again.'
      this.failAll(new ModelManagerError(message, 'WORKER_ERROR'))
    }

    worker.onmessageerror = () => {
      this.failAll(
        new ModelManagerError(
          'The inference worker sent an unreadable message.',
          'WORKER_MESSAGE_ERROR',
        ),
      )
    }

    this.worker = worker
    this.configured = false
    this.post({
      type: 'configure',
      config: {
        ...this.config,
        wasmPaths: this.wasmPaths(),
      },
    })
    this.configured = true
    return worker
  }

  private post(message: WorkerRequest, transfer?: Transferable[]): void {
    if (transfer && transfer.length > 0) {
      this.ensureWorker().postMessage(message, transfer)
    } else {
      this.ensureWorker().postMessage(message)
    }
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error)
    }
    this.pending.clear()
    this.loadPromises.clear()
    this.loadRequestKeys.clear()
    this.generationBusy = false
  }

  private handleMessage(message: WorkerResponse): void {
    switch (message.type) {
      case 'progress':
        this.handleProgress(message)
        break

      case 'loaded': {
        const key = `${message.kind}:${message.modelId}`
        const requestId = this.loadRequestKeys.get(key)
        const status = this.statuses.get(key) ?? DEFAULT_STATUS(message.modelId, message.kind)
        const updated: ModelRuntimeStatus = {
          ...status,
          state: 'ready',
          progress: 1,
          device: message.backend,
          dtype: message.dtype,
          finishedAt: Date.now(),
        }
        this.setStatus(updated)

        if (requestId) {
          const pending = this.pending.get(requestId)
          if (pending) {
            this.pending.delete(requestId)
            pending.resolve(undefined)
          }
          this.loadRequestKeys.delete(key)
        }
        break
      }

      case 'token': {
        const pending = this.pending.get(message.requestId)
        pending?.onToken?.(message.text)
        break
      }

      case 'transcript-partial': {
        const pending = this.pending.get(message.requestId)
        pending?.onPartial?.(message.text)
        break
      }

      case 'done': {
        const pending = this.pending.get(message.requestId)
        if (pending) {
          this.pending.delete(message.requestId)
          pending.resolve({
            text: message.text,
            durationMs: message.durationMs,
            tokensPerSecond: message.tokensPerSecond,
          } satisfies GenerationResult)
        }
        this.generationBusy = false
        break
      }

      case 'transcribed': {
        const pending = this.pending.get(message.requestId)
        if (pending) {
          this.pending.delete(message.requestId)
          pending.resolve(message.text)
        }
        break
      }

      case 'audio': {
        const pending = this.pending.get(message.requestId)
        if (pending) {
          this.pending.delete(message.requestId)
          pending.resolve({
            audio: message.audio,
            samplingRate: message.samplingRate,
          })
        }
        break
      }

      case 'cancelled': {
        const pending = this.pending.get(message.requestId)
        if (pending) {
          this.pending.delete(message.requestId)
          pending.reject(new CancelledError())
        }
        this.generationBusy = false
        break
      }

      case 'error': {
        if (message.requestId) {
          const pending = this.pending.get(message.requestId)
          if (pending) {
            this.pending.delete(message.requestId)
            pending.reject(
              new ModelManagerError(message.message, message.code),
            )
          }
        }

        if (message.kind && message.modelId) {
          const key = `${message.kind}:${message.modelId}`
          const status = this.statuses.get(key)
          if (status) {
            this.setStatus({
              ...status,
              state: 'error',
              error: message.message,
              finishedAt: Date.now(),
            })
            if (
              message.kind === 'text' &&
              this.textSession.modelId === message.modelId &&
              this.textSession.state !== 'error'
            ) {
              this.setTextSession({
                state: 'error',
                error: message.message,
              })
            }
          }
          const requestId = this.loadRequestKeys.get(key)
          if (requestId) {
            const pending = this.pending.get(requestId)
            if (pending) {
              this.pending.delete(requestId)
              pending.reject(new ModelManagerError(message.message, message.code))
            }
            this.loadRequestKeys.delete(key)
          }
        }

        this.generationBusy = false
        break
      }

      case 'notice': {
        if (message.code === 'webgpu_fallback') {
          for (const status of this.statuses.values()) {
            if (status.state === 'downloading' || status.state === 'loading') {
              this.setStatus({ ...status, device: 'wasm' })
            }
          }
        }
        this.emitNotice({ code: message.code, message: message.message })
        break
      }

      case 'unloaded': {
        for (const status of this.statuses.values()) {
          if (status.kind === message.kind) {
            this.setStatus({
              ...status,
              state: 'unloaded',
              progress: 0,
              device: undefined,
              dtype: undefined,
            })
            if (
              message.kind === 'text' &&
              this.textSession.state === 'ready' &&
              this.textSession.modelId === status.modelId
            ) {
              this.setTextSession({
                state: 'uninitialized',
                progress: 0,
                previousModelId: status.modelId,
              })
            }
          }
        }
        const resolve = this.unloadResolvers.get(message.kind)
        if (resolve) {
          this.unloadResolvers.delete(message.kind)
          resolve()
        }
        break
      }

      case 'status':
        break

      default:
        break
    }
  }

  private handleProgress(message: WorkerProgressResponse): void {
    const key = `${message.kind}:${message.modelId}`
    const status = this.statuses.get(key) ?? DEFAULT_STATUS(message.modelId, message.kind)
    const state =
      message.progress >= 1
        ? 'loading'
        : status.state === 'ready'
          ? 'ready'
          : 'downloading'
    this.setStatus({
      ...status,
      state,
      progress: Math.max(status.progress, message.progress),
      loadedBytes: message.loadedBytes,
      totalBytes: message.totalBytes,
    })
  }

  private setStatus(status: ModelRuntimeStatus): void {
    const key = `${status.kind}:${status.modelId}`
    this.statuses.set(key, status)
    for (const listener of this.statusListeners) listener(status)
  }

  private emitNotice(notice: ManagerNotice): void {
    for (const listener of this.noticeListeners) listener(notice)
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  onNotice(listener: NoticeListener): () => void {
    this.noticeListeners.add(listener)
    return () => this.noticeListeners.delete(listener)
  }

  onTextSession(listener: () => void): () => void {
    this.textSessionListeners.add(listener)
    return () => this.textSessionListeners.delete(listener)
  }

  getTextSession(): TextModelSession {
    // Stable identity is required by useSyncExternalStore; state is replaced
    // immutably in setTextSession().
    return this.textSession
  }

  private setTextSession(patch: Partial<TextModelSession>): void {
    this.textSession = { ...this.textSession, ...patch }
    for (const listener of this.textSessionListeners) listener()
  }

  /** The only readiness check callers need. ASR/TTS status never affects it. */
  isTextModelReady(): boolean {
    return isTextSessionReady(
      this.textSession,
      this.selectedTextModelId,
      (modelId) => this.isReady(modelId),
    )
  }

  /**
   * Runs the guaranteed state sequence CONFIGURING -> DOWNLOADING ->
   * INITIALIZING -> READY. Any failure lands in ERROR and never in READY.
   */
  async initializeTextModel(modelId?: string): Promise<void> {
    const target = modelId ?? this.selectedTextModelId
    if (!target) {
      this.setTextSession({
        state: 'error',
        error: 'No text model is selected.',
      })
      throw new ModelManagerError('No text model is selected.', 'NO_MODEL')
    }

    const token = ++this.sessionLoadId
    const previousModelId =
      this.textSession.state === 'ready'
        ? this.textSession.modelId
        : this.textSession.previousModelId

    this.setTextSession({
      state: 'configuring',
      modelId: target,
      backend: null,
      progress: 0,
      error: null,
      previousModelId,
      attempt: this.textSession.attempt + 1,
    })

    const model = getModelById(target)
    if (!model || model.kind !== 'text') {
      this.setTextSession({
        state: 'error',
        error: 'The selected text model is not in the registry.',
      })
      throw new ModelManagerError('The selected text model is not available.')
    }

    try {
      let backend: Backend =
        this.backendPreference === 'wasm' ||
        (this.backendPreference === 'webgpu' && !this.lastCapabilities?.webgpu)
          ? 'wasm'
          : 'webgpu'
      if (model.backends.includes(backend) === false) backend = 'wasm'
      if (this.lastCapabilities) {
        const compatibility = checkModelCompatibility(
          model,
          this.lastCapabilities,
          this.backendPreference,
          this.mode,
        )
        if (!compatibility.compatible) {
          throw new ModelManagerError(
            compatibility.warnings[0] ??
              'This model is not compatible with this browser.',
            'INCOMPATIBLE_MODEL',
          )
        }
        backend = compatibility.backend
      }
      this.ensureWorker()
      this.setTextSession({ state: 'downloading', backend, progress: 0 })

      const unsubscribe = this.onStatus((status) => {
        if (
          token !== this.sessionLoadId ||
          status.kind !== 'text' ||
          status.modelId !== target
        ) {
          return
        }
        if (status.state === 'downloading') {
          this.setTextSession({
            state: 'downloading',
            progress: status.progress,
          })
        } else if (status.state === 'loading') {
          this.setTextSession({ state: 'initializing', progress: 1 })
        }
      })

      try {
        await this.loadText(target, backend)
      } finally {
        unsubscribe()
      }

      if (token !== this.sessionLoadId) return
      this.setTextSession({
        state: 'ready',
        progress: 1,
        error: null,
        previousModelId: null,
      })
    } catch (error) {
      if (token !== this.sessionLoadId) return
      this.setTextSession({
        state: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  retryTextModel(): Promise<void> {
    const session = this.textSession
    return this.initializeTextModel(
      session.modelId ?? session.previousModelId ?? undefined,
    )
  }

  /**
   * After a failed model switch, put the last working model back in charge.
   * Returns its id so the caller can persist the matching setting.
   */
  async restorePreviousTextModel(): Promise<string | null> {
    const previous = this.textSession.previousModelId
    if (!previous || !this.isReady(previous)) return null
    this.sessionLoadId += 1
    this.selectedTextModelId = previous
    this.setTextSession({
      state: 'ready',
      modelId: previous,
      backend: this.getStatus(previous)?.device ?? null,
      progress: 1,
      error: null,
      previousModelId: null,
    })
    // The caller updates AppSettings; configure() must not invalidate this.
    return previous
  }

  getStatus(modelId: string): ModelRuntimeStatus | undefined {
    for (const status of this.statuses.values()) {
      if (status.modelId === modelId) return status
    }
    return undefined
  }

  getStatuses(): ModelRuntimeStatus[] {
    return [...this.statuses.values()]
  }

  isReady(modelId: string): boolean {
    return this.getStatus(modelId)?.state === 'ready'
  }

  private load(
    kind: ModelKind,
    modelId: string,
    backend: Backend,
  ): Promise<void> {
    const key = `${kind}:${modelId}`
    const existing = this.loadPromises.get(key)
    if (existing) return existing

    const ready = this.statuses.get(key)
    if (ready?.state === 'ready' && ready.device === backend) {
      return Promise.resolve()
    }

    const requestId = createRequestId()
    this.loadRequestKeys.set(key, requestId)

    const previous = this.statuses.get(key)
    this.setStatus({
      ...(previous ?? DEFAULT_STATUS(modelId, kind)),
      state: 'downloading',
      progress: 0,
      loadedBytes: 0,
      totalBytes: 0,
      error: undefined,
      device: backend,
      startedAt: Date.now(),
      finishedAt: undefined,
    })

    const promise = new Promise<void>((resolve, reject) => {
      this.pending.set(requestId, {
        requestId,
        resolve: () => resolve(),
        reject,
      })

      const type =
        kind === 'text'
          ? 'load-text'
          : kind === 'asr'
            ? 'load-asr'
            : 'load-tts'

      this.post({
        type,
        requestId,
        modelId,
        backend,
      } as WorkerRequest)
    }).finally(() => {
      this.loadPromises.delete(key)
      if (this.loadRequestKeys.get(key) === requestId) {
        this.loadRequestKeys.delete(key)
      }
    })

    this.loadPromises.set(key, promise)
    return promise
  }

  loadText(modelId: string, backend: Backend): Promise<void> {
    return this.load('text', modelId, backend)
  }

  loadAsr(modelId: string, backend: Backend): Promise<void> {
    return this.load('asr', modelId, backend)
  }

  loadTts(modelId: string, backend: Backend): Promise<void> {
    return this.load('tts', modelId, backend)
  }

  async generate(
    modelId: string,
    backend: Backend,
    messages: ModelMessage[],
    options: {
      maxNewTokens: number
      temperature: number
      topP: number
      contextTurns: number
    },
    handlers: GenerateHandlers = {},
  ): Promise<GenerationResult> {
    if (this.generationBusy) {
      throw new ModelManagerError(
        'Another response is still being generated. Stop it before sending a new message.',
        'BUSY',
      )
    }

    this.generationBusy = true
    const requestId = createRequestId()

    try {
      return (await new Promise<GenerationResult>((resolve, reject) => {
        this.pending.set(requestId, {
          requestId,
          resolve: (value) => resolve(value as GenerationResult),
          reject,
          onToken: handlers.onToken,
        })

        if (handlers.signal) {
          if (handlers.signal.aborted) {
            this.pending.delete(requestId)
            reject(new CancelledError())
            return
          }
          handlers.signal.addEventListener(
            'abort',
            () => {
              this.cancel(requestId)
            },
            { once: true },
          )
        }

        this.post({
          type: 'generate',
          requestId,
          modelId,
          backend,
          messages,
          options,
        })
      })) as GenerationResult
    } finally {
      this.generationBusy = false
    }
  }

  async transcribe(
    modelId: string,
    backend: Backend,
    audio: Float32Array,
    language?: string,
    handlers: { onPartial?: (text: string) => void; signal?: AbortSignal } = {},
    partial = false,
  ): Promise<string> {
    const requestId = createRequestId()
    return (await new Promise<string>((resolve, reject) => {
      this.pending.set(requestId, {
        requestId,
        resolve: (value) => resolve(value as string),
        reject,
        onPartial: handlers.onPartial,
      })
      if (handlers.signal) {
        if (handlers.signal.aborted) {
          this.pending.delete(requestId)
          reject(new CancelledError())
          return
        }
        handlers.signal.addEventListener(
          'abort',
          () => this.cancel(requestId),
          { once: true },
        )
      }
      this.post(
        {
          type: 'transcribe',
          requestId,
          modelId,
          backend,
          audio,
          language,
          partial,
        },
        [audio.buffer],
      )
    })) as string
  }

  async synthesize(
    modelId: string,
    backend: Backend,
    text: string,
    voice: string,
    speed: number,
  ): Promise<{ audio: Float32Array; samplingRate: number }> {
    const requestId = createRequestId()
    return (await new Promise<{ audio: Float32Array; samplingRate: number }>(
      (resolve, reject) => {
        this.pending.set(requestId, {
          requestId,
          resolve: (value) =>
            resolve(value as { audio: Float32Array; samplingRate: number }),
          reject,
        })
        this.post({
          type: 'synthesize',
          requestId,
          modelId,
          backend,
          text,
          voice,
          speed,
        })
      },
    )) as { audio: Float32Array; samplingRate: number }
  }

  cancel(requestId: string): void {
    if (!this.worker) return
    this.post({ type: 'cancel', requestId })
  }

  async unload(kind: ModelKind): Promise<void> {
    await new Promise<void>((resolve) => {
      this.unloadResolvers.set(kind, resolve)
      this.post({ type: 'unload', kind })
      setTimeout(() => {
        if (this.unloadResolvers.get(kind) === resolve) {
          this.unloadResolvers.delete(kind)
          resolve()
        }
      }, 4000)
    })
  }

  reset(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    this.failAll(new ModelManagerError('The AI engine was reset.', 'RESET'))
    this.statuses.clear()
    this.configured = false
    this.sessionLoadId += 1
    this.setTextSession({
      state: 'uninitialized',
      modelId: null,
      backend: null,
      progress: 0,
      error: null,
    })
  }

  isConfigured(): boolean {
    return this.configured
  }
}

export const modelManager = new ModelManager()

// Keep a named export for callers that prefer a class instance.
export { ModelManager }

export function describeRuntimeStatus(status: ModelRuntimeStatus | undefined): string {
  if (!status) return 'Not loaded'
  if (status.state === 'downloading') {
    return `Downloading ${Math.round(status.progress * 100)}%`
  }
  if (status.state === 'loading') return 'Loading into memory…'
  if (status.state === 'ready') {
    return `Ready · ${status.device === 'webgpu' ? 'WebGPU' : 'CPU'}`
  }
  if (status.state === 'error') return 'Failed to load'
  if (status.state === 'unloaded') return 'Unloaded'
  return 'Not loaded'
}

export function modelStatusLabel(modelId: string): string {
  return getModelById(modelId)?.label ?? modelId
}
