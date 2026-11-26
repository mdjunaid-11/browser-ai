import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AppSettings,
  AsrEngine,
  DeviceCapabilities,
  VoiceRecognitionMetrics,
} from '../types'
import { checkModelCompatibility } from '../ai/models/modelCompatibility'
import { modelManager } from '../ai/models/modelManager'
import { getModelById } from '../ai/models/modelRegistry'
import {
  describeMicrophoneError,
  isMicrophoneSupported,
  MicRecorder,
} from '../services/audio/micRecorder'
import {
  mergeTranscriptHypotheses,
  windowForPartial,
} from '../services/audio/transcriptMerge'
import {
  isWebSpeechSupported,
  WebSpeechRecognition,
} from '../services/audio/webSpeechRecognition'

export type VoiceInputState =
  | 'idle'
  | 'requesting'
  | 'recording'
  | 'transcribing'
  | 'error'

export interface VoiceInputError {
  message: string
  fallbackEngine: AsrEngine | null
}

type Engine = Exclude<AsrEngine, 'auto'>

interface UseVoiceInputOptions {
  settings: AppSettings
  capabilities: DeviceCapabilities | null
  onTranscript: (text: string) => void
  onError?: (message: string) => void
}

const emptyMetrics = (engine: Engine): VoiceRecognitionMetrics => ({
  micStartMs: 0,
  modelInitMs: null,
  timeToFirstPartialMs: null,
  finalLatencyMs: null,
  audioDurationMs: 0,
  processingMs: null,
  engine,
  partialCount: 0,
})

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export function useVoiceInput(options: UseVoiceInputOptions) {
  const [state, setState] = useState<VoiceInputState>('idle')
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<VoiceInputError | null>(null)
  const [preview, setPreview] = useState('')
  const [hasRetainedAudio, setHasRetainedAudio] = useState(false)
  const [previewKind, setPreviewKind] = useState<'partial' | 'final' | null>(null)
  const [metrics, setMetrics] = useState<VoiceRecognitionMetrics | null>(null)
  const [activeEngine, setActiveEngine] = useState<Engine>('private')

  const recorderRef = useRef<MicRecorder | null>(null)
  const webSpeechRef = useRef<WebSpeechRecognition | null>(null)
  const optionsRef = useRef(options)
  const stateRef = useRef<VoiceInputState>('idle')
  const finalizingRef = useRef(false)
  const committedRef = useRef(false)
  const lastLevelUpdate = useRef(0)
  const engineOverride = useRef<Engine | null>(null)
  const metricsRef = useRef<VoiceRecognitionMetrics>(emptyMetrics('private'))
  const sessionStartedAt = useRef(0)
  const firstPartialAt = useRef<number | null>(null)
  const modelInitMs = useRef<number | null>(null)
  const partialCount = useRef(0)
  const partialAbort = useRef<AbortController | null>(null)
  const partialLoopToken = useRef(0)
  const asrReady = useRef<Promise<void> | null>(null)
  const previewRef = useRef('')
  const lastAudio = useRef<Float32Array | null>(null)
  const lastAudioDuration = useRef(0)

  useEffect(() => {
    optionsRef.current = options
  })

  const setVoiceState = useCallback((next: VoiceInputState) => {
    stateRef.current = next
    setState(next)
  }, [])

  const privateModelCompatible = useCallback((): boolean => {
    const { settings, capabilities } = optionsRef.current
    const model = getModelById(settings.asrModelId)
    if (!model || model.kind !== 'asr' || !capabilities) return true
    return checkModelCompatibility(
      model,
      capabilities,
      settings.backend,
      settings.mode,
    ).compatible
  }, [])

  const resolveEngine = useCallback((): Engine => {
    if (engineOverride.current) return engineOverride.current
    const { settings } = optionsRef.current
    if (settings.asrEngine === 'fast') {
      if (!isWebSpeechSupported()) return 'private'
      if (!settings.fastRecognitionAccepted) {
        throw new Error(
          'Fast recognition may send audio to your browser vendor. Accept that privacy note in Voice settings before using it.',
        )
      }
      return 'fast'
    }
    if (settings.asrEngine === 'auto') {
      // Automatic mode prefers private recognition. Fast recognition is only
      // chosen with explicit consent and when the local model cannot run here.
      if (
        isWebSpeechSupported() &&
        settings.fastRecognitionAccepted &&
        !privateModelCompatible()
      ) {
        return 'fast'
      }
      return 'private'
    }
    return 'private'
  }, [privateModelCompatible])

  const ensurePrivateAsr = useCallback(async (): Promise<void> => {
    if (asrReady.current) return asrReady.current
    const { settings, capabilities } = optionsRef.current
    const model = getModelById(settings.asrModelId)
    if (!model || model.kind !== 'asr') {
      throw new Error('The selected speech recognition model is unavailable.')
    }

    let backend: 'wasm' | 'webgpu' = 'wasm'
    if (capabilities) {
      const compatibility = checkModelCompatibility(
        model,
        capabilities,
        settings.backend,
        settings.mode,
      )
      if (!compatibility.compatible) {
        throw new Error(
          compatibility.warnings[0] ??
            'Speech recognition is not compatible with this browser.',
        )
      }
      backend = compatibility.backend
    }

    const started = performance.now()
    const promise = modelManager.isReady(model.id)
      ? Promise.resolve()
      : modelManager.loadAsr(model.id, backend)
    asrReady.current = promise
      .then(() => {
        modelInitMs.current = Math.max(0, Math.round(performance.now() - started))
        metricsRef.current.modelInitMs = modelInitMs.current
      })
      .catch((caught) => {
        asrReady.current = null
        throw caught
      })
    return asrReady.current
  }, [])

  const reportError = useCallback(
    (message: string, fallbackEngine: AsrEngine | null) => {
      setError({ message, fallbackEngine })
      setVoiceState('error')
      optionsRef.current.onError?.(message)
    },
    [setVoiceState],
  )

  const commitTranscript = useCallback(
    (text: string) => {
      if (committedRef.current) return
      const clean = text.trim()
      if (!clean) return
      committedRef.current = true
      const finished = performance.now()
      metricsRef.current.finalLatencyMs = Math.max(
        0,
        Math.round(finished - sessionStartedAt.current),
      )
      metricsRef.current.timeToFirstPartialMs = firstPartialAt.current
      metricsRef.current.partialCount = partialCount.current
      setMetrics({ ...metricsRef.current })
      previewRef.current = clean
      setPreview(clean)
      setPreviewKind('final')
      setError(null)
      setLevel(0)
      setVoiceState('idle')
      optionsRef.current.onTranscript(clean)
    },
    [setVoiceState],
  )

  const transcribeAudio = useCallback(
    async (audio: Float32Array): Promise<void> => {
      if (finalizingRef.current || committedRef.current) return
      finalizingRef.current = true
      partialAbort.current?.abort()
      setVoiceState('transcribing')

      const started = performance.now()
      try {
        lastAudio.current = audio
        setHasRetainedAudio(true)
        const durationMs = Math.round((audio.length / 16000) * 1000)
        lastAudioDuration.current = durationMs
        metricsRef.current.audioDurationMs = durationMs

        if (audio.length === 0) {
          throw new Error('Nothing was recorded. Hold the mic button and speak.')
        }
        if (durationMs < 250) {
          throw new Error(
            'That recording was too short. Hold the mic button a little longer and speak clearly.',
          )
        }

        await ensurePrivateAsr()
        const { settings } = optionsRef.current
        const language =
          settings.language === 'auto' ? undefined : settings.language
        const text = await modelManager.transcribe(
          settings.asrModelId,
          modelManager.getStatus(settings.asrModelId)?.device ?? 'wasm',
          audio,
          language,
        )
        metricsRef.current.processingMs = Math.max(
          0,
          Math.round(performance.now() - started),
        )
        const merged = previewRef.current
          ? mergeTranscriptHypotheses(previewRef.current, text)
          : text
        commitTranscript(merged || previewRef.current)
      } catch (caught) {
        // The full recording is kept so the user can retry without re-recording.
        const message = describeMicrophoneError(caught)
        const fallbackEngine: AsrEngine | null =
          isWebSpeechSupported() &&
          optionsRef.current.settings.fastRecognitionAccepted
            ? 'fast'
            : null
        reportError(message, fallbackEngine)
      } finally {
        finalizingRef.current = false
      }
    },
    [commitTranscript, ensurePrivateAsr, reportError, setVoiceState],
  )

  const finalizeRecording = useCallback(async (): Promise<void> => {
    if (!recorderRef.current || finalizingRef.current || committedRef.current) return
    const audio = await recorderRef.current.stop()
    setLevel(0)
    await transcribeAudio(audio)
  }, [transcribeAudio])

  const runPartialLoop = useCallback(
    async (token: number): Promise<void> => {
      const recorder = recorderRef.current
      if (!recorder) return
      while (
        token === partialLoopToken.current &&
        stateRef.current === 'recording' &&
        !committedRef.current
      ) {
        try {
          await ensurePrivateAsr()
        } catch {
          return
        }
        if (token !== partialLoopToken.current || stateRef.current !== 'recording') return
        if (recorder.getDurationMs() < 1200) {
          await wait(600)
          continue
        }

        const controller = new AbortController()
        partialAbort.current = controller
        const full = recorder.snapshot()
        const { startMs } = windowForPartial(recorder.getDurationMs())
        const startSample = Math.min(full.length, Math.floor((startMs / 1000) * 16000))
        const window = full.subarray(startSample)
        // Copy into a standalone buffer: the worker receives it transferred.
        const chunk = new Float32Array(window)
        const { settings } = optionsRef.current
        const language = settings.language === 'auto' ? undefined : settings.language
        try {
          const text = await modelManager.transcribe(
            settings.asrModelId,
            modelManager.getStatus(settings.asrModelId)?.device ?? 'wasm',
            chunk,
            language,
            { signal: controller.signal },
            true,
          )
          if (token !== partialLoopToken.current || stateRef.current !== 'recording') break
          if (text.trim()) {
            if (firstPartialAt.current === null) {
              firstPartialAt.current = Math.round(
                performance.now() - sessionStartedAt.current,
              )
            }
            partialCount.current += 1
            const merged = mergeTranscriptHypotheses(previewRef.current, text)
            if (merged !== previewRef.current) {
              previewRef.current = merged
              setPreview(merged)
              setPreviewKind('partial')
            }
          }
        } catch {
          // Partial windows are advisory; a failed window must not end the session.
        }
        if (token !== partialLoopToken.current) break
        await wait(2200)
      }
    },
    [ensurePrivateAsr],
  )

  const startListening = useCallback(async (): Promise<void> => {
    if (
      stateRef.current === 'recording' ||
      stateRef.current === 'requesting' ||
      stateRef.current === 'transcribing'
    ) {
      return
    }
    if (!isMicrophoneSupported()) {
      reportError(
        'Microphone recording is not supported in this browser. Try a current version of Chrome, Edge, Firefox or Safari.',
        null,
      )
      return
    }

    let engine: Engine
    try {
      engine = resolveEngine()
    } catch (caught) {
      reportError(
        caught instanceof Error ? caught.message : 'Recognition could not start.',
        null,
      )
      return
    }

    committedRef.current = false
    finalizingRef.current = false
    partialCount.current = 0
    firstPartialAt.current = null
    modelInitMs.current = null
    sessionStartedAt.current = performance.now()
    metricsRef.current = emptyMetrics(engine)
    setMetrics(null)
    setError(null)
    previewRef.current = ''
    setPreview('')
    setPreviewKind(null)
    setLevel(0)
    setActiveEngine(engine)
    setVoiceState('requesting')

    if (engine === 'fast') {
      const recognition = new WebSpeechRecognition()
      webSpeechRef.current = recognition
      const lang =
        optionsRef.current.settings.language === 'auto'
          ? navigator.language || 'en-US'
          : optionsRef.current.settings.language === 'hi'
            ? 'hi-IN'
            : 'en-US'
      recognition.start({
        lang,
        onPartial: (text) => {
          if (committedRef.current) return
          if (firstPartialAt.current === null) {
            firstPartialAt.current = Math.round(
              performance.now() - sessionStartedAt.current,
            )
          }
          partialCount.current += 1
          previewRef.current = text
          setPreview(text)
          setPreviewKind('partial')
        },
        onFinal: (text) => {
          commitTranscript(text)
        },
        onError: (message) => {
          reportError(
            message,
            privateModelCompatible() ? 'private' : null,
          )
        },
        onEnd: () => {
          if (stateRef.current === 'recording') setVoiceState('idle')
        },
      })
      if (recognition.isActive()) {
        metricsRef.current.micStartMs = Math.round(
          performance.now() - sessionStartedAt.current,
        )
        setVoiceState('recording')
      }
      return
    }

    try {
      if (!recorderRef.current) recorderRef.current = new MicRecorder()
      const recorder = recorderRef.current
      await recorder.start({
        autoStop:
          optionsRef.current.settings.voiceMode === 'auto' ||
          optionsRef.current.settings.autoSubmitTranscript,
        silenceMs: optionsRef.current.settings.voiceSilenceMs,
        maxDurationMs: optionsRef.current.settings.voiceMaxDurationMs,
        onLevel: (nextLevel) => {
          const now = performance.now()
          if (now - lastLevelUpdate.current < 90) return
          lastLevelUpdate.current = now
          setLevel(nextLevel)
        },
        onAutoStop: () => {
          void finalizeRecording()
        },
      })
      metricsRef.current.micStartMs = Math.round(
        performance.now() - sessionStartedAt.current,
      )
      setVoiceState('recording')
      // Start the model load in the background; the microphone is already live.
      void ensurePrivateAsr().catch(() => {})
      partialLoopToken.current += 1
      void runPartialLoop(partialLoopToken.current)
    } catch (caught) {
      reportError(describeMicrophoneError(caught), null)
    }
  }, [
    commitTranscript,
    ensurePrivateAsr,
    finalizeRecording,
    privateModelCompatible,
    reportError,
    resolveEngine,
    runPartialLoop,
    setVoiceState,
  ])

  const stopListening = useCallback(async (): Promise<void> => {
    if (stateRef.current === 'recording') {
      if (webSpeechRef.current?.isActive()) {
        webSpeechRef.current.stop()
        return
      }
      await finalizeRecording()
    }
  }, [finalizeRecording])

  const cancelListening = useCallback(async (): Promise<void> => {
    partialLoopToken.current += 1
    partialAbort.current?.abort()
    webSpeechRef.current?.cancel()
    webSpeechRef.current = null
    if (recorderRef.current) await recorderRef.current.cancel()
    committedRef.current = true
    finalizingRef.current = false
    setLevel(0)
    previewRef.current = ''
    setPreview('')
    setPreviewKind(null)
    setError(null)
    setHasRetainedAudio(false)
    setVoiceState('idle')
  }, [setVoiceState])

  const retryTranscription = useCallback(async (): Promise<void> => {
    if (error?.fallbackEngine) {
      engineOverride.current = error.fallbackEngine as Engine
      await cancelListening()
      await startListening()
      return
    }
    if (!lastAudio.current) {
      await startListening()
      return
    }
    committedRef.current = false
    finalizingRef.current = false
    sessionStartedAt.current = performance.now()
    await transcribeAudio(lastAudio.current)
  }, [cancelListening, error, startListening, transcribeAudio])

  useEffect(() => {
    return () => {
      partialLoopToken.current += 1
      partialAbort.current?.abort()
      webSpeechRef.current?.cancel()
      void recorderRef.current?.cancel()
    }
  }, [])

  return {
    state,
    level,
    error,
    preview,
    previewKind,
    metrics,
    activeEngine,
    canRetryAudio: hasRetainedAudio,
    startListening,
    stopListening,
    cancelListening,
    retryTranscription,
    isRecording: state === 'recording',
    isBusy: state === 'requesting' || state === 'transcribing',
    isSupported: isMicrophoneSupported() || isWebSpeechSupported(),
  }
}
