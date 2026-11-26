/// <reference lib="webworker" />

import {
  AutoTokenizer,
  env,
  InterruptableStoppingCriteria,
  pipeline,
  StyleTextToSpeech2Model,
  Tensor,
  TextStreamer,
} from '@huggingface/transformers'

import type { Backend, ModelKind } from '../../types'
import {
  buildCausalMessages,
  buildFallbackChatPrompt,
  buildSeq2SeqPrompt,
  cleanModelOutput,
} from '../generation/promptBuilder'
import {
  getModelById,
  KOKORO_VOICES,
} from '../models/modelRegistry'
import type { WorkerRequest, WorkerResponse } from './protocol'

type WorkerContext = {
  postMessage: (message: WorkerResponse, transfer?: Transferable[]) => void
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
}

const ctx = self as unknown as WorkerContext

interface RuntimeModel {
  kind: ModelKind
  modelId: string
  backend: Backend
  dtype: string
  instance: any
  tokenizer: any
  lastUsed: number
}

interface ActiveRequest {
  aborted: boolean
  criteria?: InterruptableStoppingCriteria
}

const loaded = new Map<ModelKind, RuntimeModel>()
const loadPromises = new Map<string, Promise<RuntimeModel>>()
const activeRequests = new Map<string, ActiveRequest>()
const busyKinds = new Set<ModelKind>()

let config = {
  maxLoadedPipelines: 2,
  numThreads: 1,
  wasmPaths: null as { mjs: string; wasm: string } | null,
  allowWebGpu: true,
}

env.allowLocalModels = false
env.allowRemoteModels = true
env.useBrowserCache = true

function post(message: WorkerResponse, transfer?: Transferable[]): void {
  if (transfer && transfer.length > 0) {
    ctx.postMessage(message, transfer)
  } else {
    ctx.postMessage(message)
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return 'Unknown error'
  }
}

function errorCode(error: unknown, fallback: string): string {
  const candidate = (error as { code?: unknown })?.code
  return typeof candidate === 'string' && candidate.length > 0
    ? candidate
    : fallback
}

function modelLabel(modelId: string): string {
  return getModelById(modelId)?.label ?? modelId
}

function applyConfig(): void {
  const wasm = env.backends.onnx.wasm
  if (!wasm) return
  if (config.wasmPaths) {
    wasm.wasmPaths = config.wasmPaths
  }
  wasm.numThreads = config.numThreads
  wasm.proxy = false
}

function resolveDtype(
  modelId: string,
  backend: Backend,
): { dtype: string; task: string } {
  const info = getModelById(modelId)
  if (!info) {
    throw new Error(`Unknown model: ${modelId}`)
  }
  const dtype =
    backend === 'webgpu'
      ? info.dtype.webgpu ?? info.dtype.wasm
      : info.dtype.wasm
  return { dtype, task: info.task }
}

function createProgressReporter(kind: ModelKind, modelId: string) {
  const files = new Map<string, { loaded: number; total: number }>()
  let lastPost = 0
  let lastProgress = 0

  return {
    callback: (data: any) => {
      try {
        if (data?.status === 'progress' || data?.status === 'done') {
          const file = typeof data.file === 'string' ? data.file : 'model'
          const total = Number(data.total) || 0
          const loadedBytes =
            Number(data.loaded) ||
            (data.status === 'done' && total > 0 ? total : 0)
          if (total > 0 || loadedBytes > 0) {
            files.set(file, { loaded: loadedBytes, total })
          }
        }

        let loadedBytes = 0
        let totalBytes = 0
        for (const entry of files.values()) {
          loadedBytes += entry.loaded
          totalBytes += entry.total
        }

        const progress =
          totalBytes > 0
            ? Math.min(1, Math.max(0, loadedBytes / totalBytes))
            : lastProgress
        lastProgress = Math.max(lastProgress, progress)

        const now = Date.now()
        const isFinal = progress >= 1
        if (!isFinal && now - lastPost < 120) return
        lastPost = now

        post({
          type: 'progress',
          kind,
          modelId,
          progress: lastProgress,
          loadedBytes,
          totalBytes,
          file: typeof data?.file === 'string' ? data.file : undefined,
          status: typeof data?.status === 'string' ? data.status : undefined,
        })
      } catch {
        // Progress reporting must never break model loading.
      }
    },
    complete: () => {
      post({
        type: 'progress',
        kind,
        modelId,
        progress: 1,
        loadedBytes: 0,
        totalBytes: 0,
        status: 'ready',
      })
    },
  }
}

async function disposeModel(model: RuntimeModel): Promise<void> {
  try {
    await model.instance?.dispose?.()
  } catch {
    // ignore disposal errors
  }
  try {
    await model.instance?.model?.dispose?.()
  } catch {
    // ignore disposal errors
  }
  loaded.delete(model.kind)
}

async function ensureCapacity(neededKind: ModelKind): Promise<void> {
  if (loaded.has(neededKind)) return

  let guard = 0
  while (loaded.size >= config.maxLoadedPipelines && guard < 8) {
    guard += 1
    const candidates = [...loaded.values()]
      .filter((model) => !busyKinds.has(model.kind))
      .sort((a, b) => a.lastUsed - b.lastUsed)

    if (candidates.length === 0) {
      throw new Error(
        'Not enough memory to load another model while inference is running. Stop the current task and try again.',
      )
    }

    const victim = candidates[0]
    post({
      type: 'notice',
      code: 'model_evicted',
      message: `Unloaded ${modelLabel(victim.modelId)} to free memory. It will reload from the browser cache when needed.`,
    })
    await disposeModel(victim)
  }
}

async function loadPipelineModel(
  kind: ModelKind,
  modelId: string,
  requestedBackend: Backend,
): Promise<RuntimeModel> {
  const key = `${kind}:${modelId}:${requestedBackend}`
  const existing = loaded.get(kind)
  if (
    existing &&
    existing.modelId === modelId &&
    existing.backend === requestedBackend
  ) {
    existing.lastUsed = Date.now()
    return existing
  }

  const pending = loadPromises.get(key)
  if (pending) return pending

  const promise = (async () => {
    applyConfig()
    await ensureCapacity(kind)

    const previous = loaded.get(kind)
    if (previous && previous.modelId !== modelId) {
      await disposeModel(previous)
    }

    const { dtype, task } = resolveDtype(modelId, requestedBackend)
    const reporter = createProgressReporter(kind, modelId)

    const tryLoad = async (backend: Backend) => {
      const createPipeline = pipeline as unknown as (
        taskName: string,
        id: string,
        options: Record<string, unknown>,
      ) => Promise<any>

      return createPipeline(task, modelId, {
        device: backend,
        dtype:
          backend === 'webgpu'
            ? getModelById(modelId)?.dtype.webgpu ?? dtype
            : getModelById(modelId)?.dtype.wasm ?? dtype,
        progress_callback: reporter.callback,
      })
    }

    let backend = requestedBackend
    let instance: any

    try {
      instance = await tryLoad(backend)
    } catch (error) {
      if (backend === 'webgpu' && config.allowWebGpu) {
        post({
          type: 'notice',
          code: 'webgpu_fallback',
          message: `WebGPU could not load ${modelLabel(modelId)}. Retrying on CPU/WASM.`,
        })
        backend = 'wasm'
        instance = await tryLoad(backend)
      } else {
        throw error
      }
    }

    const runtime: RuntimeModel = {
      kind,
      modelId,
      backend,
      dtype:
        backend === 'webgpu'
          ? getModelById(modelId)?.dtype.webgpu ?? dtype
          : getModelById(modelId)?.dtype.wasm ?? dtype,
      instance,
      tokenizer: instance?.tokenizer,
      lastUsed: Date.now(),
    }

    loaded.set(kind, runtime)
    reporter.complete()
    post({
      type: 'loaded',
      kind,
      modelId,
      backend,
      dtype: runtime.dtype,
    })
    return runtime
  })()

  loadPromises.set(key, promise)
  try {
    return await promise
  } finally {
    loadPromises.delete(key)
  }
}

async function loadTtsModel(
  modelId: string,
  requestedBackend: Backend,
): Promise<RuntimeModel> {
  const key = `tts:${modelId}:${requestedBackend}`
  const existing = loaded.get('tts')
  if (
    existing &&
    existing.modelId === modelId &&
    existing.backend === requestedBackend
  ) {
    existing.lastUsed = Date.now()
    return existing
  }

  const pending = loadPromises.get(key)
  if (pending) return pending

  const promise = (async () => {
    applyConfig()
    await ensureCapacity('tts')

    const previous = loaded.get('tts')
    if (previous && previous.modelId !== modelId) {
      await disposeModel(previous)
    }

    const info = getModelById(modelId)
    if (!info) throw new Error(`Unknown TTS model: ${modelId}`)

    const reporter = createProgressReporter('tts', modelId)

    const tryLoad = async (backend: Backend) => {
      const dtype =
        backend === 'webgpu'
          ? info.dtype.webgpu ?? info.dtype.wasm
          : info.dtype.wasm

      const tokenizer = await AutoTokenizer.from_pretrained(modelId, {
        progress_callback: reporter.callback,
      })
      const model = await StyleTextToSpeech2Model.from_pretrained(modelId, {
        device: backend,
        dtype: dtype as 'q8' | 'fp16',
        progress_callback: reporter.callback,
      })
      return { tokenizer, model, dtype }
    }

    let backend = requestedBackend
    let result: { tokenizer: any; model: any; dtype: string }

    try {
      result = await tryLoad(backend)
    } catch (error) {
      if (backend === 'webgpu' && config.allowWebGpu) {
        post({
          type: 'notice',
          code: 'webgpu_fallback',
          message: `WebGPU could not load ${info.label}. Retrying on CPU/WASM.`,
        })
        backend = 'wasm'
        result = await tryLoad(backend)
      } else {
        throw error
      }
    }

    const runtime: RuntimeModel = {
      kind: 'tts',
      modelId,
      backend,
      dtype: result.dtype,
      instance: { tokenizer: result.tokenizer, model: result.model },
      tokenizer: result.tokenizer,
      lastUsed: Date.now(),
    }

    loaded.set('tts', runtime)
    reporter.complete()
    post({
      type: 'loaded',
      kind: 'tts',
      modelId,
      backend,
      dtype: runtime.dtype,
    })
    return runtime
  })()

  loadPromises.set(key, promise)
  try {
    return await promise
  } finally {
    loadPromises.delete(key)
  }
}

async function generate(
  requestId: string,
  modelId: string,
  backend: Backend,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: {
    maxNewTokens: number
    temperature: number
    topP: number
    contextTurns: number
  },
): Promise<void> {
  const started = performance.now()
  const active: ActiveRequest = { aborted: false }
  activeRequests.set(requestId, active)
  busyKinds.add('text')

  try {
    const runtime = await loadPipelineModel('text', modelId, backend)
    const info = getModelById(modelId)
    if (!info) throw new Error(`Unknown text model: ${modelId}`)

    if (active.aborted) {
      post({ type: 'cancelled', requestId })
      return
    }

    const tokenizer = runtime.tokenizer
    let prompt: string

    if (info.architecture === 'causal') {
      const chatMessages = buildCausalMessages(messages, options.contextTurns)
      if (typeof tokenizer?.apply_chat_template === 'function') {
        try {
          prompt = tokenizer.apply_chat_template(chatMessages, {
            tokenize: false,
            add_generation_prompt: true,
          })
        } catch {
          prompt = buildFallbackChatPrompt(chatMessages)
        }
      } else {
        prompt = buildFallbackChatPrompt(chatMessages)
      }
    } else {
      prompt = buildSeq2SeqPrompt(messages, options.contextTurns)
    }

    const criteria = new InterruptableStoppingCriteria()
    active.criteria = criteria

    let streamed = ''
    let tokenCount = 0
    let lastTokenPost = 0
    let pendingTokenText = ''

    const flushTokens = (force = false) => {
      if (!pendingTokenText) return
      const now = Date.now()
      if (!force && now - lastTokenPost < 32) return
      lastTokenPost = now
      post({ type: 'token', requestId, text: pendingTokenText })
      pendingTokenText = ''
    }

    const streamer = new TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      token_callback_function: () => {
        tokenCount += 1
      },
      callback_function: (token: string) => {
        if (active.aborted) return
        streamed += token
        pendingTokenText += token
        flushTokens()
      },
    })

    const generator = runtime.instance
    const maxNewTokens = Math.max(16, Math.min(1024, options.maxNewTokens))

    const output = await generator(prompt, {
      max_new_tokens: maxNewTokens,
      temperature: Math.max(0.05, options.temperature),
      top_p: Math.max(0.1, Math.min(1, options.topP)),
      do_sample: options.temperature > 0.15,
      repetition_penalty: 1.08,
      no_repeat_ngram_size: 3,
      streamer,
      stopping_criteria: [criteria],
    })

    flushTokens(true)

    if (active.aborted) {
      post({ type: 'cancelled', requestId })
      return
    }

    let finalText = streamed
    if (!finalText.trim()) {
      const raw = Array.isArray(output) ? output[0] : output
      const generated =
        raw?.generated_text ?? raw?.translation_text ?? raw?.text ?? ''
      if (typeof generated === 'string') {
        finalText =
          info.architecture === 'causal' && generated.startsWith(prompt)
            ? generated.slice(prompt.length)
            : generated
      }
    }

    finalText = cleanModelOutput(finalText)

    if (!finalText.trim()) {
      throw new Error(
        'The model returned an empty response. Try rephrasing your message or a different model.',
      )
    }

    const durationMs = performance.now() - started
    const seconds = Math.max(0.001, durationMs / 1000)
    const tokensPerSecond = tokenCount > 0 ? tokenCount / seconds : 0

    post({
      type: 'done',
      requestId,
      text: finalText,
      durationMs,
      tokensPerSecond,
      backend: runtime.backend,
    })
  } catch (error) {
    if (active.aborted) {
      post({ type: 'cancelled', requestId })
      return
    }
    post({
      type: 'error',
      requestId,
      kind: 'text',
      modelId,
      code: errorCode(error, 'GENERATION_FAILED'),
      message: errorMessage(error),
      recoverable: true,
    })
  } finally {
    activeRequests.delete(requestId)
    busyKinds.delete('text')
  }
}

async function transcribe(
  requestId: string,
  modelId: string,
  backend: Backend,
  audio: Float32Array,
  language?: string,
): Promise<void> {
  const active: ActiveRequest = { aborted: false }
  activeRequests.set(requestId, active)
  busyKinds.add('asr')

  try {
    const runtime = await loadPipelineModel('asr', modelId, backend)
    if (active.aborted) {
      post({ type: 'cancelled', requestId })
      return
    }

    const info = getModelById(modelId)
    const options: Record<string, unknown> = {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: false,
    }

    if (info?.multilingual && language) {
      options.language = language
      options.task = 'transcribe'
    }

    const result = await runtime.instance(audio, options)
    if (active.aborted) {
      post({ type: 'cancelled', requestId })
      return
    }

    const text =
      typeof result?.text === 'string'
        ? result.text.trim()
        : Array.isArray(result)
          ? result.map((item: any) => item?.text ?? '').join(' ').trim()
          : ''

    if (!text) {
      throw new Error(
        'No speech was recognised. Try speaking closer to the microphone in a quieter room.',
      )
    }

    post({ type: 'transcribed', requestId, text })
  } catch (error) {
    if (active.aborted) {
      post({ type: 'cancelled', requestId })
      return
    }
    post({
      type: 'error',
      requestId,
      kind: 'asr',
      modelId,
      code: errorCode(error, 'TRANSCRIPTION_FAILED'),
      message: errorMessage(error),
      recoverable: true,
    })
  } finally {
    activeRequests.delete(requestId)
    busyKinds.delete('asr')
  }
}

const VOICE_CACHE = 'browser-ai-kokoro-voices-v1'

async function loadVoiceData(modelId: string, voice: string): Promise<Float32Array> {
  const valid = KOKORO_VOICES.some((item) => item.id === voice)
  const selected = valid ? voice : 'af_heart'
  const url = `https://huggingface.co/${modelId}/resolve/main/voices/${selected}.bin`

  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(VOICE_CACHE)
      const cached = await cache.match(url)
      if (cached) {
        return new Float32Array(await cached.arrayBuffer())
      }
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Voice download failed (${response.status}).`)
      }
      const buffer = await response.arrayBuffer()
      try {
        await cache.put(url, new Response(buffer.slice(0)))
      } catch {
        // Caching is best-effort.
      }
      return new Float32Array(buffer)
    } catch (error) {
      if (error instanceof Error && error.message.includes('Voice download')) {
        throw error
      }
    }
  }

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Voice download failed (${response.status}).`)
  }
  return new Float32Array(await response.arrayBuffer())
}

function splitForTts(text: string, maxChars = 280, maxChunks = 6): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []

  const sentences = clean.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [clean]
  const chunks: string[] = []
  let current = ''

  for (const sentence of sentences) {
    const piece = sentence.trim()
    if (!piece) continue
    if ((current + ' ' + piece).trim().length <= maxChars) {
      current = `${current} ${piece}`.trim()
      continue
    }
    if (current) chunks.push(current)
    if (piece.length <= maxChars) {
      current = piece
    } else {
      let rest = piece
      while (rest.length > maxChars && chunks.length < maxChunks) {
        chunks.push(rest.slice(0, maxChars))
        rest = rest.slice(maxChars)
      }
      current = rest
    }
    if (chunks.length >= maxChunks) break
  }

  if (current && chunks.length < maxChunks) chunks.push(current)
  return chunks.slice(0, maxChunks)
}

async function synthesize(
  requestId: string,
  modelId: string,
  backend: Backend,
  text: string,
  voice: string,
  speed: number,
): Promise<void> {
  const active: ActiveRequest = { aborted: false }
  activeRequests.set(requestId, active)
  busyKinds.add('tts')

  try {
    const runtime = await loadTtsModel(modelId, backend)
    if (active.aborted) {
      post({ type: 'cancelled', requestId })
      return
    }

    const tokenizer = runtime.instance.tokenizer
    const model = runtime.instance.model
    const { phonemize } = await import('phonemizer')
    const chunks = splitForTts(text)
    if (chunks.length === 0) throw new Error('There is no text to speak.')

    const voiceData = await loadVoiceData(modelId, voice)
    const parts: Float32Array[] = []
    const sampleRate = 24000

    for (const chunk of chunks) {
      if (active.aborted) {
        post({ type: 'cancelled', requestId })
        return
      }

      const phonemeResult = await phonemize(chunk, 'en-us')
      const phonemes = Array.isArray(phonemeResult)
        ? phonemeResult.join(' ')
        : String(phonemeResult)

      if (!phonemes.trim()) continue

      const encoded = tokenizer(phonemes, { truncation: true })
      const tokenLength = Number(encoded.input_ids?.dims?.at(-1) ?? 0)
      const styleOffset =
        256 * Math.min(Math.max(tokenLength - 2, 0), 509)
      const styleSlice = voiceData.slice(styleOffset, styleOffset + 256)
      if (styleSlice.length < 256) {
        throw new Error('The selected voice file is incomplete.')
      }

      const style = new Tensor('float32', styleSlice, [1, 256])
      const speedTensor = new Tensor(
        'float32',
        new Float32Array([Math.max(0.5, Math.min(2, speed))]),
        [1],
      )

      const result = await model({
        input_ids: encoded.input_ids,
        style,
        speed: speedTensor,
      })

      const waveform = result?.waveform
      if (!waveform?.data) throw new Error('The speech model returned no audio.')
      parts.push(new Float32Array(waveform.data))
    }

    if (parts.length === 0) {
      throw new Error('The speech model returned no audio for this text.')
    }

    const gapSamples = Math.round(sampleRate * 0.12)
    const totalLength =
      parts.reduce((sum, part) => sum + part.length, 0) +
      gapSamples * Math.max(0, parts.length - 1)
    const audio = new Float32Array(totalLength)
    let offset = 0
    for (let i = 0; i < parts.length; i += 1) {
      audio.set(parts[i], offset)
      offset += parts[i].length
      if (i < parts.length - 1) offset += gapSamples
    }

    post(
      { type: 'audio', requestId, audio, samplingRate: sampleRate },
      [audio.buffer],
    )
  } catch (error) {
    if (active.aborted) {
      post({ type: 'cancelled', requestId })
      return
    }
    post({
      type: 'error',
      requestId,
      kind: 'tts',
      modelId,
      code: errorCode(error, 'TTS_FAILED'),
      message: errorMessage(error),
      recoverable: true,
    })
  } finally {
    activeRequests.delete(requestId)
    busyKinds.delete('tts')
  }
}

function cancel(requestId: string): void {
  const active = activeRequests.get(requestId)
  if (!active) {
    post({ type: 'cancelled', requestId })
    return
  }
  active.aborted = true
  try {
    active.criteria?.interrupt()
  } catch {
    // ignore
  }
  post({ type: 'cancelled', requestId })
}

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data
  if (!message || typeof message !== 'object') return

  switch (message.type) {
    case 'configure':
      config = {
        ...config,
        ...message.config,
      }
      applyConfig()
      break

    case 'load-text':
      void loadPipelineModel('text', message.modelId, message.backend).catch(
        (error) => {
          post({
            type: 'error',
            requestId: message.requestId,
            kind: 'text',
            modelId: message.modelId,
            code: errorCode(error, 'MODEL_LOAD_FAILED'),
            message: errorMessage(error),
            recoverable: true,
          })
        },
      )
      break

    case 'load-asr':
      void loadPipelineModel('asr', message.modelId, message.backend).catch(
        (error) => {
          post({
            type: 'error',
            requestId: message.requestId,
            kind: 'asr',
            modelId: message.modelId,
            code: errorCode(error, 'MODEL_LOAD_FAILED'),
            message: errorMessage(error),
            recoverable: true,
          })
        },
      )
      break

    case 'load-tts':
      void loadTtsModel(message.modelId, message.backend).catch((error) => {
        post({
          type: 'error',
          requestId: message.requestId,
          kind: 'tts',
          modelId: message.modelId,
          code: errorCode(error, 'MODEL_LOAD_FAILED'),
          message: errorMessage(error),
          recoverable: true,
        })
      })
      break

    case 'generate':
      void generate(
        message.requestId,
        message.modelId,
        message.backend,
        message.messages,
        message.options,
      )
      break

    case 'transcribe':
      void transcribe(
        message.requestId,
        message.modelId,
        message.backend,
        message.audio,
        message.language,
      )
      break

    case 'synthesize':
      void synthesize(
        message.requestId,
        message.modelId,
        message.backend,
        message.text,
        message.voice,
        message.speed,
      )
      break

    case 'cancel':
      cancel(message.requestId)
      break

    case 'unload': {
      const model = loaded.get(message.kind)
      if (model) {
        void disposeModel(model).then(() => {
          post({ type: 'unloaded', kind: message.kind })
        })
      } else {
        post({ type: 'unloaded', kind: message.kind })
      }
      break
    }

    default:
      break
  }
}
