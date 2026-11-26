import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppSettings, DeviceCapabilities } from '../types'
import { checkModelCompatibility } from '../ai/models/modelCompatibility'
import { modelManager } from '../ai/models/modelManager'
import { getModelById } from '../ai/models/modelRegistry'
import {
  describeMicrophoneError,
  isMicrophoneSupported,
  MicRecorder,
} from '../services/audio/micRecorder'

export type VoiceInputState =
  | 'idle'
  | 'requesting'
  | 'recording'
  | 'transcribing'
  | 'error'

interface UseVoiceInputOptions {
  settings: AppSettings
  capabilities: DeviceCapabilities | null
  onTranscript: (text: string) => void
  onError?: (message: string) => void
}

export function useVoiceInput(options: UseVoiceInputOptions) {
  const [state, setState] = useState<VoiceInputState>('idle')
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const recorderRef = useRef<MicRecorder | null>(null)
  const optionsRef = useRef(options)
  const transcribingRef = useRef(false)
  const stateRef = useRef<VoiceInputState>('idle')
  const lastLevelUpdate = useRef(0)

  useEffect(() => {
    optionsRef.current = options
  })

  const setVoiceState = useCallback((next: VoiceInputState) => {
    stateRef.current = next
    setState(next)
  }, [])

  const ensureAsrModel = useCallback(async (): Promise<{
    modelId: string
    backend: 'wasm' | 'webgpu'
  }> => {
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

    if (!modelManager.isReady(model.id)) {
      await modelManager.loadAsr(model.id, backend)
    }

    return { modelId: model.id, backend }
  }, [])

  const transcribeAudio = useCallback(async (): Promise<void> => {
    if (transcribingRef.current) return
    const recorder = recorderRef.current
    if (!recorder) return

    transcribingRef.current = true
    setVoiceState('transcribing')

    try {
      const audio = await recorder.stop()
      setLevel(0)

      if (audio.length === 0) {
        setVoiceState('idle')
        return
      }

      const { modelId, backend } = await ensureAsrModel()
      const language =
        optionsRef.current.settings.language === 'auto'
          ? undefined
          : optionsRef.current.settings.language

      const text = await modelManager.transcribe(
        modelId,
        backend,
        audio,
        language,
      )

      const clean = text.trim()
      if (clean) {
        optionsRef.current.onTranscript(clean)
      }
      setError(null)
      setVoiceState('idle')
    } catch (caught) {
      const message = describeMicrophoneError(caught)
      setError(message)
      setVoiceState('error')
      optionsRef.current.onError?.(message)
    } finally {
      transcribingRef.current = false
    }
  }, [ensureAsrModel, setVoiceState])

  const startListening = useCallback(async (): Promise<void> => {
    if (
      stateRef.current === 'recording' ||
      stateRef.current === 'requesting' ||
      stateRef.current === 'transcribing'
    ) {
      return
    }

    if (!isMicrophoneSupported()) {
      const message =
        'Microphone recording is not supported in this browser. Try a current version of Chrome, Edge, Firefox or Safari.'
      setError(message)
      setVoiceState('error')
      optionsRef.current.onError?.(message)
      return
    }

    setError(null)
    setVoiceState('requesting')

    try {
      if (!recorderRef.current) {
        recorderRef.current = new MicRecorder()
      }
      const recorder = recorderRef.current

      await recorder.start({
        autoStop: optionsRef.current.settings.voiceMode === 'auto',
        silenceMs: 1100,
        maxDurationMs: 30000,
        onLevel: (nextLevel) => {
          const now = performance.now()
          if (now - lastLevelUpdate.current < 90) return
          lastLevelUpdate.current = now
          setLevel(nextLevel)
        },
        onAutoStop: () => {
          void transcribeAudio()
        },
      })

      setVoiceState('recording')
    } catch (caught) {
      const message = describeMicrophoneError(caught)
      setError(message)
      setVoiceState('error')
      optionsRef.current.onError?.(message)
    }
  }, [setVoiceState, transcribeAudio])

  const stopListening = useCallback(async (): Promise<void> => {
    if (stateRef.current !== 'recording') return
    await transcribeAudio()
  }, [transcribeAudio])

  const cancelListening = useCallback(async (): Promise<void> => {
    const recorder = recorderRef.current
    if (recorder) await recorder.cancel()
    setLevel(0)
    setVoiceState('idle')
  }, [setVoiceState])

  useEffect(() => {
    return () => {
      void recorderRef.current?.cancel()
    }
  }, [])

  return {
    state,
    level,
    error,
    startListening,
    stopListening,
    cancelListening,
    isRecording: state === 'recording',
    isBusy: state === 'requesting' || state === 'transcribing',
    isSupported: isMicrophoneSupported(),
  }
}
