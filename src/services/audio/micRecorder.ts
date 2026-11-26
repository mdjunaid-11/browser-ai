export class MicrophoneError extends Error {
  code: string

  constructor(message: string, code = 'MICROPHONE_ERROR') {
    super(message)
    this.name = 'MicrophoneError'
    this.code = code
  }
}

export interface MicRecorderOptions {
  /** Automatically stop after a period of silence (voice conversation mode). */
  autoStop?: boolean
  silenceMs?: number
  maxDurationMs?: number
  onLevel?: (level: number, speaking: boolean) => void
  onAutoStop?: () => void
}

export function isMicrophoneSupported(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    return false
  }
  const mediaDevices = navigator.mediaDevices as
    | { getUserMedia?: unknown }
    | undefined
  return Boolean(
    typeof mediaDevices?.getUserMedia === 'function' &&
      (window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext),
  )
}

export function describeMicrophoneError(error: unknown): string {
  if (error instanceof MicrophoneError) return error.message
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return 'Microphone permission was denied. Allow microphone access in your browser settings and try again.'
    }
    if (error.name === 'NotFoundError') {
      return 'No microphone was found. Connect a microphone and try again.'
    }
    if (error.name === 'NotReadableError') {
      return 'The microphone is already in use by another application.'
    }
  }
  if (error instanceof Error) return error.message
  return 'The microphone could not be started.'
}

function mergeChunks(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const merged = new Float32Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }
  return merged
}

export function downsampleTo16k(
  input: Float32Array,
  inputRate: number,
): Float32Array {
  const targetRate = 16000
  if (inputRate === targetRate) return input
  if (input.length === 0) return input

  const ratio = inputRate / targetRate
  const outputLength = Math.max(1, Math.floor(input.length / ratio))
  const output = new Float32Array(outputLength)

  for (let i = 0; i < outputLength; i += 1) {
    const position = i * ratio
    const index = Math.floor(position)
    const fraction = position - index
    const next = Math.min(input.length - 1, index + 1)
    output[i] = input[index] * (1 - fraction) + input[next] * fraction
  }

  return output
}

/**
 * Records raw PCM through the Web Audio API so audio never leaves the browser.
 * The deprecated ScriptProcessorNode is used deliberately: it is supported by
 * every current browser and avoids requiring a separate worklet asset.
 */
export class MicRecorder {
  private stream: MediaStream | null = null
  private context: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private processor: ScriptProcessorNode | null = null
  private silentGain: GainNode | null = null
  private chunks: Float32Array[] = []
  private inputSampleRate = 48000
  private recording = false
  private stopping = false
  private lastVoiceAt = 0
  private voiceFrames = 0
  private speechDetected = false
  private totalSamples = 0
  private lastLevel = 0
  private options: MicRecorderOptions = {}
  private autoStopTimer: number | null = null
  private autoStopRequested = false

  isRecording(): boolean {
    return this.recording
  }

  getLevel(): number {
    return this.lastLevel
  }

  async start(options: MicRecorderOptions = {}): Promise<void> {
    if (this.recording) return
    if (!isMicrophoneSupported()) {
      throw new MicrophoneError(
        'Microphone recording is not supported in this browser. Try a current version of Chrome, Edge, Firefox or Safari.',
        'MIC_UNSUPPORTED',
      )
    }

    this.options = options
    this.chunks = []
    this.totalSamples = 0
    this.speechDetected = false
    this.voiceFrames = 0
    this.lastLevel = 0
    this.stopping = false
    this.autoStopRequested = false

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      })
    } catch (error) {
      throw new MicrophoneError(describeMicrophoneError(error), 'MIC_PERMISSION')
    }

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext

    if (!AudioContextClass) {
      stream.getTracks().forEach((track) => track.stop())
      throw new MicrophoneError(
        'The Web Audio API is unavailable in this browser.',
        'AUDIO_UNSUPPORTED',
      )
    }

    try {
      const context = new AudioContextClass()
      if (context.state === 'suspended') {
        await context.resume()
      }

      const source = context.createMediaStreamSource(stream)
      const processor = context.createScriptProcessor(4096, 1, 1)
      const silentGain = context.createGain()
      silentGain.gain.value = 0

      this.stream = stream
      this.context = context
      this.source = source
      this.processor = processor
      this.silentGain = silentGain
      this.inputSampleRate = context.sampleRate

      processor.onaudioprocess = (event) => this.handleAudio(event)
      source.connect(processor)
      processor.connect(silentGain)
      silentGain.connect(context.destination)

      this.recording = true
      this.lastVoiceAt = performance.now()

      const maxMs = options.maxDurationMs ?? 30000
      this.autoStopTimer = window.setTimeout(() => {
        if (this.recording) this.requestAutoStop()
      }, maxMs)
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop())
      await this.teardown()
      throw new MicrophoneError(
        describeMicrophoneError(error),
        'AUDIO_START_FAILED',
      )
    }
  }

  private handleAudio(event: AudioProcessingEvent): void {
    // Auto-stop only asks the caller to finalise. Keep buffering until stop()
    // is actually called: model loading must never truncate the recording.
    if (!this.recording) return

    const input = event.inputBuffer.getChannelData(0)
    if (!input || input.length === 0) return

    const copy = new Float32Array(input.length)
    copy.set(input)
    this.chunks.push(copy)
    this.totalSamples += copy.length

    let sumSquares = 0
    for (let i = 0; i < copy.length; i += 1) {
      sumSquares += copy[i] * copy[i]
    }
    const rms = Math.sqrt(sumSquares / copy.length)
    const level = Math.min(1, rms * 7)
    this.lastLevel = this.lastLevel * 0.6 + level * 0.4

    const now = performance.now()
    const isVoice = rms > 0.022
    if (isVoice) {
      this.voiceFrames += 1
      this.lastVoiceAt = now
      if (this.voiceFrames >= 2) this.speechDetected = true
    } else {
      this.voiceFrames = Math.max(0, this.voiceFrames - 1)
    }

    this.options.onLevel?.(this.lastLevel, this.speechDetected)

    const maxSamples = this.inputSampleRate * 30
    if (this.totalSamples >= maxSamples) {
      this.requestAutoStop()
      return
    }

    if (
      this.options.autoStop &&
      this.speechDetected &&
      now - this.lastVoiceAt > (this.options.silenceMs ?? 1100)
    ) {
      this.requestAutoStop()
    }
  }

  private requestAutoStop(): void {
    if (this.stopping || this.autoStopRequested) return
    this.autoStopRequested = true
    if (this.autoStopTimer !== null) {
      window.clearTimeout(this.autoStopTimer)
      this.autoStopTimer = null
    }
    this.options.onAutoStop?.()
  }

  /** Current 16 kHz audio without releasing the microphone. */
  snapshot(): Float32Array {
    return downsampleTo16k(mergeChunks(this.chunks), this.inputSampleRate)
  }

  /** Milliseconds of audio captured so far. */
  getDurationMs(): number {
    return (this.totalSamples / this.inputSampleRate) * 1000
  }

  async stop(): Promise<Float32Array> {
    if (!this.recording && this.chunks.length === 0) {
      return new Float32Array(0)
    }

    this.recording = false
    this.stopping = true

    if (this.autoStopTimer !== null) {
      window.clearTimeout(this.autoStopTimer)
      this.autoStopTimer = null
    }

    const chunks = this.chunks
    const inputRate = this.inputSampleRate
    this.chunks = []
    this.totalSamples = 0
    this.lastLevel = 0

    await this.teardown()

    const merged = mergeChunks(chunks)
    // Return even very short recordings. The caller decides how to report
    // them so audio is never silently discarded after a failed load.
    return downsampleTo16k(merged, inputRate)
  }

  async cancel(): Promise<void> {
    this.recording = false
    this.stopping = true
    this.autoStopRequested = false
    this.chunks = []
    this.totalSamples = 0
    this.lastLevel = 0
    if (this.autoStopTimer !== null) {
      window.clearTimeout(this.autoStopTimer)
      this.autoStopTimer = null
    }
    await this.teardown()
  }

  private async teardown(): Promise<void> {
    try {
      if (this.processor) {
        this.processor.onaudioprocess = null
        this.processor.disconnect()
      }
      this.source?.disconnect()
      this.silentGain?.disconnect()
    } catch {
      // ignore disconnection errors
    }

    try {
      this.stream?.getTracks().forEach((track) => track.stop())
    } catch {
      // ignore
    }

    try {
      if (this.context && this.context.state !== 'closed') {
        await this.context.close()
      }
    } catch {
      // ignore
    }

    this.stream = null
    this.context = null
    this.source = null
    this.processor = null
    this.silentGain = null
  }
}
