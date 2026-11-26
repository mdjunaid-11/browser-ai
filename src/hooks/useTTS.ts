import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AppSettings,
  DeviceCapabilities,
  SpeechVoiceInfo,
} from '../types'
import { checkModelCompatibility } from '../ai/models/modelCompatibility'
import { getModelById } from '../ai/models/modelRegistry'
import { voiceManager } from '../services/audio/textToSpeech'
import { buildTtsText } from '../ai/generation/promptBuilder'

interface UseTTSOptions {
  settings: AppSettings
  capabilities: DeviceCapabilities | null
  onNotice?: (notice: { code: string; message: string }) => void
  onError?: (message: string) => void
  onEnd?: () => void
}

export function useTTS(options: UseTTSOptions) {
  const [voices, setVoices] = useState<SpeechVoiceInfo[]>(() =>
    voiceManager.getVoices(),
  )
  const [speaking, setSpeaking] = useState(false)
  const [paused, setPaused] = useState(false)
  const [synthesizing, setSynthesizing] = useState(false)
  const [supported] = useState(() => voiceManager.isBrowserSpeechSupported())
  const optionsRef = useRef(options)
  const mountedRef = useRef(true)

  useEffect(() => {
    optionsRef.current = options
  })

  const refreshVoices = useCallback(() => {
    setVoices(voiceManager.getVoices())
  }, [])

  useEffect(() => {
    mountedRef.current = true
    const unsubscribe = voiceManager.onVoicesChanged(() => refreshVoices())
    // Some browsers populate voices lazily after the first call.
    const timer = window.setTimeout(refreshVoices, 500)
    return () => {
      mountedRef.current = false
      window.clearTimeout(timer)
      unsubscribe()
    }
  }, [refreshVoices])

  const stop = useCallback(() => {
    voiceManager.stop()
    if (mountedRef.current) {
      setSpeaking(false)
      setPaused(false)
      setSynthesizing(false)
    }
  }, [])

  const speak = useCallback(
    async (rawText: string): Promise<void> => {
      const text = buildTtsText(rawText)
      if (!text) return

      const { settings, capabilities } = optionsRef.current
      stop()

      let kokoroBackend: 'wasm' | 'webgpu' = 'wasm'
      const kokoro = getModelById('onnx-community/Kokoro-82M-v1.0-ONNX')
      if (kokoro && capabilities) {
        kokoroBackend = checkModelCompatibility(
          kokoro,
          capabilities,
          settings.backend,
          settings.mode,
        ).backend
      }

      if (settings.ttsEngine === 'kokoro') {
        setSynthesizing(true)
      }

      try {
        await voiceManager.speak({
          engine: settings.ttsEngine,
          text,
          browser: {
            voiceURI: settings.browserVoiceURI,
            lang: settings.browserVoiceLang,
            rate: settings.voiceRate,
            pitch: settings.voicePitch,
            volume: settings.voiceVolume,
          },
          kokoro: {
            modelId: 'onnx-community/Kokoro-82M-v1.0-ONNX',
            voice: settings.kokoroVoice,
            speed: settings.voiceRate,
            volume: settings.voiceVolume,
            backend: kokoroBackend,
          },
          fallbackToBrowser: true,
          onStart: () => {
            if (!mountedRef.current) return
            setSynthesizing(false)
            setSpeaking(true)
            setPaused(false)
          },
          onSynthesizing: () => {
            if (!mountedRef.current) return
            setSynthesizing(true)
          },
          onEnd: () => {
            if (mountedRef.current) {
              setSpeaking(false)
              setPaused(false)
              setSynthesizing(false)
            }
            optionsRef.current.onEnd?.()
          },
          onNotice: (notice) => optionsRef.current.onNotice?.(notice),
          onError: (error) => optionsRef.current.onError?.(error.message),
        })
      } catch (error) {
        if (mountedRef.current) {
          setSpeaking(false)
          setPaused(false)
          setSynthesizing(false)
        }
        optionsRef.current.onError?.(
          error instanceof Error ? error.message : 'Speech synthesis failed.',
        )
      }
    },
    [stop],
  )

  const pause = useCallback(async () => {
    const result = await voiceManager.pause()
    if (mountedRef.current) setPaused(result)
  }, [])

  const resume = useCallback(async () => {
    const result = await voiceManager.resume()
    if (mountedRef.current) setPaused(result ? false : true)
  }, [])

  useEffect(() => {
    return () => {
      voiceManager.stop()
    }
  }, [])

  return {
    voices,
    speaking,
    paused,
    synthesizing,
    supported,
    speak,
    stop,
    pause,
    resume,
    refreshVoices,
  }
}
