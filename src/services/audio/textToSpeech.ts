import type { Backend, SpeechVoiceInfo, TTSEngine } from '../../types'
import { modelManager } from '../../ai/models/modelManager'
import { speechLevel } from './speechLevel'

export class SpeechCancelledError extends Error {
  code = 'CANCELLED'

  constructor() {
    super('Speech was stopped.')
    this.name = 'SpeechCancelledError'
  }
}

export function splitSpeech(text: string, maxChars = 220, maxChunks = 14): string[] {
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
    } else {
      if (current) chunks.push(current)
      if (piece.length <= maxChars) {
        current = piece
      } else {
        let rest = piece
        while (rest.length > maxChars && chunks.length < maxChunks) {
          const cut = rest.lastIndexOf(' ', maxChars)
          const index = cut > maxChars * 0.5 ? cut : maxChars
          chunks.push(rest.slice(0, index).trim())
          rest = rest.slice(index).trim()
        }
        current = rest
      }
    }
    if (chunks.length >= maxChunks) break
  }

  if (current && chunks.length < maxChunks) chunks.push(current)
  return chunks.slice(0, maxChunks)
}

export interface BrowserSpeakOptions {
  voiceURI?: string
  lang?: string
  rate?: number
  pitch?: number
  volume?: number
  onStart?: () => void
  onEnd?: () => void
  onError?: (error: Error) => void
}

export class BrowserSpeech {
  private generation = 0
  private finishCurrent: (() => void) | null = null
  private voicesListener: (() => void) | null = null

  isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
  }

  getVoices(): SpeechVoiceInfo[] {
    if (!this.isSupported()) return []
    try {
      return window.speechSynthesis
        .getVoices()
        .map((voice) => ({
          uri: voice.voiceURI,
          name: voice.name,
          lang: voice.lang,
          localService: voice.localService,
          default: voice.default,
        }))
        .sort((a, b) => {
          if (a.localService !== b.localService) return a.localService ? -1 : 1
          if (a.lang !== b.lang) return a.lang.localeCompare(b.lang)
          return a.name.localeCompare(b.name)
        })
    } catch {
      return []
    }
  }

  onVoicesChanged(listener: () => void): () => void {
    if (!this.isSupported()) return () => {}
    if (this.voicesListener) {
      window.speechSynthesis.removeEventListener('voiceschanged', this.voicesListener)
    }
    this.voicesListener = listener
    window.speechSynthesis.addEventListener('voiceschanged', listener)
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', listener)
      if (this.voicesListener === listener) this.voicesListener = null
    }
  }

  private resolveVoice(voiceURI?: string, lang?: string): SpeechSynthesisVoice | null {
    const voices = window.speechSynthesis.getVoices()
    if (voices.length === 0) return null

    if (voiceURI) {
      const exact = voices.find((voice) => voice.voiceURI === voiceURI)
      if (exact) return exact
    }

    if (lang) {
      const normalized = lang.toLowerCase()
      const byLang = voices.find(
        (voice) =>
          voice.lang.toLowerCase() === normalized ||
          voice.lang.toLowerCase().startsWith(normalized.split('-')[0]),
      )
      if (byLang) return byLang
    }

    return voices.find((voice) => voice.default) ?? voices[0] ?? null
  }

  async speak(text: string, options: BrowserSpeakOptions = {}): Promise<void> {
    if (!this.isSupported()) {
      throw new Error('Browser speech synthesis is not supported in this browser.')
    }

    const chunks = splitSpeech(text)
    if (chunks.length === 0) return

    this.stop()
    const generation = ++this.generation
    const synth = window.speechSynthesis
    const voice = this.resolveVoice(options.voiceURI, options.lang)

    try {
      synth.cancel()
      synth.resume()
    } catch {
      // ignore
    }

    return new Promise<void>((resolve, reject) => {
      let index = 0
      let started = false
      let finished = false

      const finish = (error?: Error) => {
        if (finished) return
        finished = true
        this.finishCurrent = null
        if (generation !== this.generation) {
          resolve()
          return
        }
        if (error) {
          options.onError?.(error)
          reject(error)
        } else {
          options.onEnd?.()
          resolve()
        }
      }

      this.finishCurrent = () => finish()

      const speakNext = () => {
        if (generation !== this.generation || finished) {
          finish()
          return
        }

        if (index >= chunks.length) {
          finish()
          return
        }

        const chunk = chunks[index]
        index += 1
        const utterance = new SpeechSynthesisUtterance(chunk)
        if (voice) utterance.voice = voice
        utterance.lang =
          voice?.lang ||
          options.lang ||
          document.documentElement.lang ||
          'en-US'
        utterance.rate = Math.min(2, Math.max(0.5, options.rate ?? 1))
        utterance.pitch = Math.min(2, Math.max(0, options.pitch ?? 1))
        utterance.volume = Math.min(1, Math.max(0, options.volume ?? 1))

        utterance.onstart = () => {
          if (!started) {
            started = true
            options.onStart?.()
          }
        }

        utterance.onboundary = (event) => {
          const length =
            typeof event.charLength === 'number' && event.charLength > 0
              ? event.charLength
              : 5
          speechLevel.markBoundary(length)
        }

        utterance.onend = () => {
          if (generation !== this.generation) {
            finish()
            return
          }
          speakNext()
        }

        utterance.onerror = (event) => {
          if (
            event.error === 'interrupted' ||
            event.error === 'canceled' ||
            generation !== this.generation
          ) {
            finish()
            return
          }
          finish(
            new Error(
              `Browser speech synthesis failed (${event.error || 'unknown error'}).`,
            ),
          )
        }

        try {
          synth.speak(utterance)
        } catch (error) {
          finish(
            error instanceof Error
              ? error
              : new Error('Browser speech synthesis could not start.'),
          )
        }
      }

      speakNext()
    })
  }

  stop(): void {
    this.generation += 1
    try {
      window.speechSynthesis?.cancel()
    } catch {
      // ignore
    }
    this.finishCurrent?.()
    this.finishCurrent = null
  }

  pause(): boolean {
    if (!this.isSupported()) return false
    try {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause()
        return true
      }
    } catch {
      // ignore
    }
    return false
  }

  resume(): boolean {
    if (!this.isSupported()) return false
    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume()
        return true
      }
    } catch {
      // ignore
    }
    return false
  }

  isSpeaking(): boolean {
    if (!this.isSupported()) return false
    try {
      return window.speechSynthesis.speaking
    } catch {
      return false
    }
  }
}

export class AudioPlayback {
  private context: AudioContext | null = null
  private source: AudioBufferSourceNode | null = null
  private gain: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private raf = 0
  private finish: (() => void) | null = null
  private playing = false

  private ensureContext(): AudioContext {
    if (this.context && this.context.state !== 'closed') return this.context
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!AudioContextClass) {
      throw new Error('The Web Audio API is not supported in this browser.')
    }
    this.context = new AudioContextClass()
    return this.context
  }

  async play(
    audio: Float32Array,
    sampleRate: number,
    volume = 1,
    onStart?: () => void,
  ): Promise<void> {
    this.stop()
    if (audio.length === 0) return

    const context = this.ensureContext()
    if (context.state === 'suspended') {
      await context.resume()
    }

    const buffer = context.createBuffer(1, audio.length, sampleRate)
    buffer.copyToChannel(new Float32Array(audio), 0)

    const source = context.createBufferSource()
    source.buffer = buffer

    const gain = context.createGain()
    gain.gain.value = Math.min(1, Math.max(0, volume))

    const analyser = context.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.6

    source.connect(analyser)
    analyser.connect(gain)
    gain.connect(context.destination)

    this.source = source
    this.gain = gain
    this.analyser = analyser
    this.playing = true

    const data = new Float32Array(analyser.fftSize)
    const updateLevel = () => {
      if (!this.playing) return
      try {
        analyser.getFloatTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i += 1) sum += data[i] * data[i]
        const rms = Math.sqrt(sum / data.length)
        speechLevel.setExternalLevel(Math.min(1, rms * 9))
      } catch {
        // ignore analyser errors
      }
      this.raf = requestAnimationFrame(updateLevel)
    }

    return new Promise<void>((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        this.playing = false
        this.finish = null
        cancelAnimationFrame(this.raf)
        this.raf = 0
        speechLevel.setExternalLevel(0)
        resolve()
      }
      this.finish = finish

      source.onended = finish
      try {
        source.start()
        onStart?.()
        updateLevel()
      } catch (error) {
        finish()
        throw error
      }
    })
  }

  stop(): void {
    this.playing = false
    cancelAnimationFrame(this.raf)
    this.raf = 0
    try {
      this.source?.stop()
    } catch {
      // ignore
    }
    try {
      this.source?.disconnect()
      this.gain?.disconnect()
      this.analyser?.disconnect()
    } catch {
      // ignore
    }
    this.source = null
    this.gain = null
    this.analyser = null
    this.finish?.()
    this.finish = null
    speechLevel.setExternalLevel(0)
  }

  async pause(): Promise<boolean> {
    if (!this.context || !this.playing) return false
    try {
      await this.context.suspend()
      return true
    } catch {
      return false
    }
  }

  async resume(): Promise<boolean> {
    if (!this.context) return false
    try {
      await this.context.resume()
      return true
    } catch {
      return false
    }
  }

  isPlaying(): boolean {
    return this.playing
  }
}

export interface VoiceSpeakOptions {
  engine: TTSEngine
  text: string
  browser: {
    voiceURI: string
    lang: string
    rate: number
    pitch: number
    volume: number
  }
  kokoro: {
    modelId: string
    voice: string
    speed: number
    volume: number
    backend: Backend
  }
  fallbackToBrowser: boolean
  onStart?: (engine: TTSEngine) => void
  onEnd?: () => void
  onSynthesizing?: () => void
  onNotice?: (notice: { code: string; message: string }) => void
  onError?: (error: Error) => void
}

class VoiceManager {
  private browser = new BrowserSpeech()
  private playback = new AudioPlayback()
  private activeEngine: TTSEngine | null = null
  private generation = 0
  private speaking = false
  private paused = false

  getVoices(): SpeechVoiceInfo[] {
    return this.browser.getVoices()
  }

  onVoicesChanged(listener: () => void): () => void {
    return this.browser.onVoicesChanged(listener)
  }

  isBrowserSpeechSupported(): boolean {
    return this.browser.isSupported()
  }

  isSpeaking(): boolean {
    return this.speaking
  }

  isPaused(): boolean {
    return this.paused
  }

  getActiveEngine(): TTSEngine | null {
    return this.activeEngine
  }

  async speak(options: VoiceSpeakOptions): Promise<void> {
    this.stop()
    const generation = ++this.generation
    const text = options.text.trim()
    if (!text) return

    if (options.engine === 'browser' || !this.browser.isSupported()) {
      if (!this.browser.isSupported()) {
        const error = new Error(
          'This browser does not support speech synthesis. You can still read the response.',
        )
        options.onError?.(error)
        throw error
      }
      await this.speakWithBrowser(text, options, generation)
      return
    }

    // Kokoro
    this.speaking = true
    this.paused = false
    this.activeEngine = 'kokoro'
    speechLevel.setSpeaking(true)
    options.onSynthesizing?.()

    try {
      await modelManager.loadTts(options.kokoro.modelId, options.kokoro.backend)
      if (generation !== this.generation) return

      const result = await modelManager.synthesize(
        options.kokoro.modelId,
        options.kokoro.backend,
        text,
        options.kokoro.voice,
        options.kokoro.speed,
      )

      if (generation !== this.generation) return

      options.onStart?.('kokoro')
      await this.playback.play(
        result.audio,
        result.samplingRate,
        options.kokoro.volume,
      )

      if (generation === this.generation) {
        this.finish()
        options.onEnd?.()
      }
    } catch (error) {
      if (generation !== this.generation) return

      const message =
        error instanceof Error ? error.message : 'Neural speech synthesis failed.'

      if (options.fallbackToBrowser && this.browser.isSupported()) {
        options.onNotice?.({
          code: 'tts_fallback',
          message: `Kokoro could not speak this response (${message}). Falling back to your browser voice.`,
        })
        await this.speakWithBrowser(text, options, generation)
        return
      }

      this.finish()
      const wrapped =
        error instanceof Error ? error : new Error('Speech synthesis failed.')
      options.onError?.(wrapped)
      throw wrapped
    }
  }

  private async speakWithBrowser(
    text: string,
    options: VoiceSpeakOptions,
    generation: number,
  ): Promise<void> {
    this.speaking = true
    this.paused = false
    this.activeEngine = 'browser'
    speechLevel.setSpeaking(true)

    try {
      await this.browser.speak(text, {
        voiceURI: options.browser.voiceURI,
        lang: options.browser.lang,
        rate: options.browser.rate,
        pitch: options.browser.pitch,
        volume: options.browser.volume,
        onStart: () => options.onStart?.('browser'),
        onEnd: () => {
          if (generation === this.generation) {
            this.finish()
            options.onEnd?.()
          }
        },
        onError: (error) => {
          if (generation === this.generation) {
            this.finish()
            options.onError?.(error)
          }
        },
      })
    } catch (error) {
      if (generation === this.generation) this.finish()
      throw error
    }
  }

  private finish(): void {
    this.speaking = false
    this.paused = false
    this.activeEngine = null
    speechLevel.reset()
  }

  stop(): void {
    this.generation += 1
    this.browser.stop()
    this.playback.stop()
    this.finish()
  }

  async pause(): Promise<boolean> {
    if (!this.speaking) return false
    if (this.activeEngine === 'browser') {
      const paused = this.browser.pause()
      this.paused = paused
      return paused
    }
    if (this.activeEngine === 'kokoro') {
      const paused = await this.playback.pause()
      this.paused = paused
      return paused
    }
    return false
  }

  async resume(): Promise<boolean> {
    if (!this.speaking) return false
    if (this.activeEngine === 'browser') {
      const resumed = this.browser.resume()
      this.paused = !resumed
      return resumed
    }
    if (this.activeEngine === 'kokoro') {
      const resumed = await this.playback.resume()
      this.paused = !resumed
      return resumed
    }
    return false
  }
}

export const voiceManager = new VoiceManager()
