import type {
  Backend,
  BackendPreference,
  DeviceAssessment,
  DeviceCapabilities,
  ModelInfo,
  OperatingMode,
} from '../../types'

/**
 * Browser capability detection is approximate. This scoring is intentionally
 * conservative and is only used to suggest a starting point — never to make
 * irreversible decisions for the user.
 */
export function assessDevice(caps: DeviceCapabilities): DeviceAssessment {
  const reasons: string[] = []
  const warnings: string[] = []

  if (!caps.wasm) {
    return {
      score: 0,
      profile: 'unsupported',
      recommendedMode: 'potato',
      reasons: ['WebAssembly is not available, so local inference cannot run.'],
      warnings: [
        'Use a current version of Chrome, Edge, Firefox or Safari to run models locally.',
      ],
    }
  }

  let score = 0

  if (caps.deviceMemoryGB === null) {
    score += 10
    warnings.push(
      'Exact memory is not exposed by this browser; the estimate assumes a modest device.',
    )
  } else if (caps.deviceMemoryGB >= 16) {
    score += 30
    reasons.push('16 GB or more of device memory reported.')
  } else if (caps.deviceMemoryGB >= 8) {
    score += 24
    reasons.push('8 GB or more of device memory reported.')
  } else if (caps.deviceMemoryGB >= 4) {
    score += 14
    reasons.push('4 GB or more of device memory reported.')
  } else if (caps.deviceMemoryGB >= 2) {
    score += 6
    warnings.push('2 GB of device memory reported. Prefer the smallest models.')
  } else {
    warnings.push('Very low device memory reported. Expect slow inference.')
  }

  const cores = caps.hardwareConcurrency
  if (cores === null) {
    warnings.push('Logical CPU core count is unavailable.')
  } else if (cores >= 8) {
    score += 20
    reasons.push(`${cores} logical CPU cores detected.`)
  } else if (cores >= 4) {
    score += 14
    reasons.push(`${cores} logical CPU cores detected.`)
  } else if (cores >= 2) {
    score += 8
    reasons.push(`${cores} logical CPU cores detected.`)
  } else {
    score += 2
    warnings.push('A single logical CPU core was detected. CPU inference will be slow.')
  }

  if (caps.webgpu) {
    score += 15
    reasons.push(
      caps.webgpuAdapter
        ? `WebGPU is available (${caps.webgpuAdapter}).`
        : 'WebGPU is available.',
    )
  } else {
    warnings.push('WebGPU is unavailable; the app will use CPU/WASM inference.')
  }

  if (caps.wasmSimd) {
    score += 5
  }

  if (caps.storageQuotaMB !== null) {
    if (caps.storageQuotaMB >= 2048) {
      score += 8
      reasons.push('Storage quota can comfortably hold a cached model.')
    } else if (caps.storageQuotaMB >= 500) {
      score += 4
      warnings.push('Storage quota is limited. A large model may not fit in the cache.')
    } else {
      warnings.push('Very little storage is available for model caching.')
    }
  } else {
    warnings.push('The browser does not report a storage quota.')
  }

  if (caps.crossOriginIsolated) {
    score += 3
    reasons.push('Cross-origin isolation is enabled; multithreaded WASM may be available.')
  } else {
    warnings.push(
      'Multithreaded WASM is unavailable without cross-origin isolation headers. Single-thread inference is used.',
    )
  }

  if (!caps.online) {
    warnings.push('The device appears offline. A first-time model download will fail.')
  }

  score = Math.max(0, Math.min(100, score))

  let profile: DeviceAssessment['profile'] = 'low'
  if (score >= 65) profile = 'high'
  else if (score >= 35) profile = 'standard'

  let recommendedMode: OperatingMode = 'potato'
  if (profile === 'high') recommendedMode = caps.webgpu ? 'quality' : 'balanced'
  else if (profile === 'standard') recommendedMode = 'balanced'

  return { score, profile, recommendedMode, reasons, warnings }
}

export function resolveBackend(
  preference: BackendPreference,
  caps: DeviceCapabilities,
): Backend {
  if (preference === 'wasm') return 'wasm'
  if (preference === 'webgpu') return caps.webgpu ? 'webgpu' : 'wasm'
  return caps.webgpu ? 'webgpu' : 'wasm'
}

export interface ModelCompatibility {
  compatible: boolean
  recommended: boolean
  backend: Backend
  dtype: string
  warnings: string[]
  reasons: string[]
}

export function checkModelCompatibility(
  model: ModelInfo,
  caps: DeviceCapabilities,
  preference: BackendPreference,
  mode: OperatingMode,
): ModelCompatibility {
  const warnings: string[] = []
  const reasons: string[] = []

  if (!caps.wasm) {
    return {
      compatible: false,
      recommended: false,
      backend: 'wasm',
      dtype: model.dtype.wasm,
      warnings: ['WebAssembly is unavailable in this browser.'],
      reasons,
    }
  }

  let backend = resolveBackend(preference, caps)

  if (!model.backends.includes(backend)) {
    if (model.backends.includes('wasm')) {
      warnings.push(
        `${backend === 'webgpu' ? 'WebGPU' : 'WASM'} is not supported by this model; using WASM instead.`,
      )
      backend = 'wasm'
    } else {
      return {
        compatible: false,
        recommended: false,
        backend,
        dtype: model.dtype.wasm,
        warnings: [
          `${model.label} has no compatible execution backend for this browser.`,
        ],
        reasons,
      }
    }
  }

  if (preference === 'webgpu' && !caps.webgpu) {
    warnings.push('WebGPU was requested but is unavailable; using CPU/WASM.')
  }

  if (!model.modes.includes(mode) && mode !== 'custom') {
    warnings.push(`This model is not tuned for ${mode} mode, but it can still be loaded.`)
  }

  if (caps.deviceMemoryGB !== null) {
    if (caps.deviceMemoryGB < model.minMemoryGB) {
      warnings.push(
        `About ${model.minMemoryGB} GB of memory is suggested; this device reports ${caps.deviceMemoryGB} GB. Loading may fail or be very slow.`,
      )
    } else {
      reasons.push('Reported memory meets the suggested requirement.')
    }
  }

  if (
    model.minCores &&
    caps.hardwareConcurrency !== null &&
    caps.hardwareConcurrency < model.minCores
  ) {
    warnings.push(
      `This model suggests at least ${model.minCores} logical cores; ${caps.hardwareConcurrency} detected.`,
    )
  }

  if (
    caps.storageQuotaMB !== null &&
    caps.storageQuotaMB < model.approxSizeMB * 1.2
  ) {
    warnings.push(
      'Available storage may be too small to cache this model. It may need to download again after a reload.',
    )
  }

  const recommended =
    warnings.length === 0 &&
    model.modes.includes(mode) &&
    (caps.deviceMemoryGB === null || caps.deviceMemoryGB >= model.minMemoryGB)

  const dtype =
    backend === 'webgpu'
      ? model.dtype.webgpu ?? model.dtype.wasm
      : model.dtype.wasm

  return {
    compatible: true,
    recommended,
    backend,
    dtype,
    warnings,
    reasons,
  }
}

export function canRunLocalModels(caps: DeviceCapabilities): boolean {
  return caps.wasm && caps.worker
}
