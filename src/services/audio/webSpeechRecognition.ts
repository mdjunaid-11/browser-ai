/**
 * Thin wrapper around the Web Speech API. This engine is fast and often uses
 * the browser vendor's online recognition service, so it is opt-in and is
 * never presented as private or offline.
 */

interface SpeechAlternative {
  transcript: string
}

interface SpeechResult {
  isFinal: boolean
  0: SpeechAlternative
}

interface SpeechResultEvent {
  resultIndex: number
  results: ArrayLike<SpeechResult>
}

interface SpeechErrorEvent {
  error: string
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechResultEvent) => void) | null
  onerror: ((event: SpeechErrorEvent) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

interface WindowWithSpeech extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

export interface WebSpeechOptions {
  lang: string
  onPartial: (text: string) => void
  onFinal: (text: string) => void
  onError: (message: string) => void
  onEnd?: () => void
}

function constructorFor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const target = window as WindowWithSpeech
  return target.SpeechRecognition ?? target.webkitSpeechRecognition ?? null
}

export function isWebSpeechSupported(): boolean {
  return constructorFor() !== null
}

export function webSpeechPrivacyNote(): string {
  return 'Fast recognition uses your browser’s speech service. It can be more responsive, but audio may be sent to your browser vendor. Use Private Local Recognition to keep audio on this device.'
}

export class WebSpeechRecognition {
  private recognition: SpeechRecognitionLike | null = null
  private finalText = ''
  private active = false
  private stopping = false

  isActive(): boolean {
    return this.active
  }

  start(options: WebSpeechOptions): void {
    if (this.active) return
    const Constructor = constructorFor()
    if (!Constructor) {
      options.onError('Fast recognition is not supported in this browser.')
      return
    }

    this.finalText = ''
    this.stopping = false

    try {
      const recognition = new Constructor()
      recognition.lang = options.lang
      recognition.continuous = true
      recognition.interimResults = true
      recognition.maxAlternatives = 1

      recognition.onresult = (event) => {
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i]
          const text = result?.[0]?.transcript?.trim() ?? ''
          if (!text) continue
          if (result.isFinal) {
            this.finalText = this.finalText
              ? `${this.finalText} ${text}`
              : text
          } else {
            interim = interim ? `${interim} ${text}` : text
          }
        }
        const preview = [this.finalText, interim].filter(Boolean).join(' ')
        options.onPartial(preview)
      }

      recognition.onerror = (event) => {
        const messages: Record<string, string> = {
          'not-allowed':
            'Microphone or speech recognition permission was denied. Allow access in your browser settings.',
          'service-not-allowed':
            'This browser blocked its speech recognition service. Check site permissions.',
          'no-speech':
            'No speech was detected. Move closer to the microphone and try again.',
          network:
            'The browser speech service could not be reached. Use Private Local Recognition instead.',
          aborted: 'Recognition was cancelled.',
        }
        options.onError(
          messages[event.error] ??
            `Speech recognition failed (${event.error || 'unknown error'}).`,
        )
      }

      recognition.onend = () => {
        const final = this.finalText.trim()
        this.active = false
        this.recognition = null
        if (final && !this.stopping) options.onFinal(final)
        options.onEnd?.()
      }

      this.recognition = recognition
      this.active = true
      recognition.start()
    } catch (error) {
      this.active = false
      this.recognition = null
      options.onError(
        error instanceof Error
          ? error.message
          : 'Fast recognition could not be started.',
      )
    }
  }

  stop(): void {
    if (!this.recognition) return
    this.stopping = true
    try {
      this.recognition.stop()
    } catch {
      // Recognition may already have ended.
    }
  }

  cancel(): void {
    this.stopping = true
    this.finalText = ''
    if (!this.recognition) return
    try {
      this.recognition.abort()
    } catch {
      // Recognition may already have ended.
    }
    this.recognition = null
    this.active = false
  }
}
