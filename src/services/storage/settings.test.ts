import { describe, expect, it } from 'vitest'
import { ANIMAL_IDS } from '../../types'
import {
  createDefaultSettings,
  normalizeSettings,
  settingsForMode,
} from './settings'

describe('createDefaultSettings', () => {
  it('creates a complete balanced setup that has not been onboarded', () => {
    const settings = createDefaultSettings()
    expect(settings.version).toBe(2)
    expect(settings.onboarded).toBe(false)
    expect(settings.mode).toBe('balanced')
    expect(settings.textModelId).toBe('Xenova/LaMini-Flan-T5-248M')
    expect(settings.asrModelId).toBe('Xenova/whisper-tiny')
    expect(settings.ttsEngine).toBe('browser')
    expect(ANIMAL_IDS).toContain(settings.avatar)
  })
})

describe('normalizeSettings', () => {
  it('returns defaults for non-object input', () => {
    expect(normalizeSettings(null).mode).toBe('balanced')
    expect(normalizeSettings('nonsense').version).toBe(2)
  })

  it('clamps numeric values into safe ranges', () => {
    const settings = normalizeSettings({
      maxNewTokens: 99999,
      typingSpeed: -40,
      contextTurns: 99,
      voiceRate: 12,
      voicePitch: -3,
      voiceVolume: 5,
    })
    expect(settings.maxNewTokens).toBe(1024)
    expect(settings.typingSpeed).toBe(0)
    expect(settings.contextTurns).toBe(12)
    expect(settings.voiceRate).toBe(2)
    expect(settings.voicePitch).toBe(0)
    expect(settings.voiceVolume).toBe(1)
  })

  it('rejects unknown model ids and invalid enums', () => {
    const settings = normalizeSettings({
      mode: 'turbo',
      textModelId: 'evil/model',
      asrModelId: 'not-a-model',
      ttsEngine: 'magic',
      backend: 'quantum',
      theme: 'neon',
      avatar: 'dragon',
      voiceMode: 'telepathy',
      language: 'klingon',
    })
    expect(settings.mode).toBe('balanced')
    expect(settings.textModelId).toBe('Xenova/LaMini-Flan-T5-248M')
    expect(settings.asrModelId).toBe('Xenova/whisper-tiny')
    expect(settings.ttsEngine).toBe('browser')
    expect(settings.backend).toBe('auto')
    expect(settings.theme).toBe('dark')
    expect(ANIMAL_IDS).toContain(settings.avatar)
    expect(settings.voiceMode).toBe('push-to-talk')
    expect(settings.language).toBe('auto')
  })

  it('preserves valid stored choices', () => {
    const settings = normalizeSettings({
      onboarded: true,
      mode: 'quality',
      textModelId: 'HuggingFaceTB/SmolLM2-360M-Instruct',
      asrModelId: 'Xenova/whisper-base',
      ttsEngine: 'kokoro',
      backend: 'webgpu',
      theme: 'light',
      avatar: 'owl',
      voiceMode: 'auto',
      language: 'hi',
      autoSpeak: true,
    })
    expect(settings.onboarded).toBe(true)
    expect(settings.mode).toBe('quality')
    expect(settings.textModelId).toBe('HuggingFaceTB/SmolLM2-360M-Instruct')
    expect(settings.asrModelId).toBe('Xenova/whisper-base')
    expect(settings.ttsEngine).toBe('kokoro')
    expect(settings.backend).toBe('webgpu')
    expect(settings.theme).toBe('light')
    expect(settings.avatar).toBe('owl')
    expect(settings.voiceMode).toBe('auto')
    expect(settings.language).toBe('hi')
    expect(settings.autoSpeak).toBe(true)
  })
})

describe('settingsForMode', () => {
  it('applies the potato preset', () => {
    const settings = settingsForMode('potato')
    expect(settings.mode).toBe('potato')
    expect(settings.textModelId).toBe('Xenova/LaMini-Flan-T5-77M')
    expect(settings.backend).toBe('wasm')
    expect(settings.ttsEngine).toBe('browser')
    expect(settings.maxNewTokens).toBeLessThanOrEqual(160)
  })

  it('picks Kokoro and a larger model for quality on capable devices', () => {
    const settings = settingsForMode(
      'quality',
      {
        hardwareConcurrency: 8,
        deviceMemoryGB: 8,
        webgpu: true,
        webgpuAdapter: null,
        wasm: true,
        wasmSimd: true,
        worker: true,
        indexedDB: true,
        storageQuotaMB: 4096,
        storageUsageMB: 0,
        crossOriginIsolated: false,
        online: true,
        connectionType: null,
        browserName: 'Chrome',
        browserVersion: null,
        osName: 'Linux',
        secureContext: true,
        touch: false,
        screenWidth: null,
        screenHeight: null,
        languages: ['en'],
        checkedAt: 0,
      },
      undefined,
    )
    expect(settings.textModelId).toBe('HuggingFaceTB/SmolLM2-360M-Instruct')
    expect(settings.ttsEngine).toBe('kokoro')
    expect(settings.autoSpeak).toBe(true)
  })

  it('keeps custom mode from changing the selected model', () => {
    const base = createDefaultSettings()
    const settings = settingsForMode('custom', null, base)
    expect(settings.mode).toBe('custom')
    expect(settings.textModelId).toBe(base.textModelId)
  })
})
