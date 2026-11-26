import { describe, expect, it } from 'vitest'
import type { DeviceCapabilities } from '../../types'
import { getModelById } from './modelRegistry'
import {
  assessDevice,
  canRunLocalModels,
  checkModelCompatibility,
  resolveBackend,
} from './modelCompatibility'

function caps(overrides: Partial<DeviceCapabilities> = {}): DeviceCapabilities {
  return {
    hardwareConcurrency: 8,
    deviceMemoryGB: 8,
    webgpu: true,
    webgpuAdapter: 'Test adapter',
    wasm: true,
    wasmSimd: true,
    worker: true,
    indexedDB: true,
    storageQuotaMB: 4096,
    storageUsageMB: 100,
    crossOriginIsolated: false,
    online: true,
    connectionType: '4g',
    browserName: 'Chrome',
    browserVersion: '130',
    osName: 'Linux',
    secureContext: true,
    touch: false,
    screenWidth: 1920,
    screenHeight: 1080,
    languages: ['en-US'],
    checkedAt: 0,
    ...overrides,
  }
}

describe('assessDevice', () => {
  it('recommends quality for a capable WebGPU device', () => {
    const result = assessDevice(caps())
    expect(result.profile).toBe('high')
    expect(result.recommendedMode).toBe('quality')
    expect(result.score).toBeGreaterThanOrEqual(65)
  })

  it('recommends potato for a weak CPU-only device', () => {
    const result = assessDevice(
      caps({
        hardwareConcurrency: 1,
        deviceMemoryGB: 2,
        webgpu: false,
        wasmSimd: false,
        storageQuotaMB: 200,
      }),
    )
    expect(result.profile).toBe('low')
    expect(result.recommendedMode).toBe('potato')
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('marks devices without WebAssembly as unsupported', () => {
    const result = assessDevice(caps({ wasm: false }))
    expect(result.profile).toBe('unsupported')
    expect(result.score).toBe(0)
    expect(canRunLocalModels(caps({ wasm: false }))).toBe(false)
  })
})

describe('resolveBackend', () => {
  it('honours an explicit WASM preference', () => {
    expect(resolveBackend('wasm', caps())).toBe('wasm')
  })

  it('falls back to WASM when WebGPU is requested but missing', () => {
    expect(resolveBackend('webgpu', caps({ webgpu: false }))).toBe('wasm')
  })

  it('uses WebGPU for auto when available', () => {
    expect(resolveBackend('auto', caps())).toBe('webgpu')
  })
})

describe('checkModelCompatibility', () => {
  it('selects the WebGPU dtype and backend for a compatible model', () => {
    const model = getModelById('HuggingFaceTB/SmolLM2-360M-Instruct')
    expect(model).toBeDefined()
    const result = checkModelCompatibility(model!, caps(), 'auto', 'quality')
    expect(result.compatible).toBe(true)
    expect(result.backend).toBe('webgpu')
    expect(result.dtype).toBe('q4f16')
  })

  it('falls back to WASM for a WASM-only model', () => {
    const model = getModelById('Xenova/LaMini-Flan-T5-77M')
    expect(model).toBeDefined()
    const result = checkModelCompatibility(model!, caps(), 'auto', 'potato')
    expect(result.compatible).toBe(true)
    expect(result.backend).toBe('wasm')
    expect(result.dtype).toBe('q8')
  })

  it('warns when memory is below the suggested requirement', () => {
    const model = getModelById('onnx-community/Qwen2.5-0.5B-Instruct')
    expect(model).toBeDefined()
    const result = checkModelCompatibility(
      model!,
      caps({ deviceMemoryGB: 2 }),
      'auto',
      'quality',
    )
    expect(result.compatible).toBe(true)
    expect(result.warnings.some((warning) => /memory/i.test(warning))).toBe(true)
    expect(result.recommended).toBe(false)
  })

  it('reports an incompatible browser when WebAssembly is missing', () => {
    const model = getModelById('Xenova/LaMini-Flan-T5-248M')
    const result = checkModelCompatibility(
      model!,
      caps({ wasm: false }),
      'auto',
      'balanced',
    )
    expect(result.compatible).toBe(false)
  })
})
