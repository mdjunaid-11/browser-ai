import type { DeviceCapabilities } from '../../types'

interface NavigatorWithHints extends Navigator {
  deviceMemory?: number
  userAgentData?: {
    brands?: Array<{ brand: string; version: string }>
    platform?: string
    mobile?: boolean
  }
  connection?: {
    effectiveType?: string
    saveData?: boolean
  }
}

interface GPUAdapterLike {
  info?: {
    vendor?: string
    architecture?: string
    device?: string
    description?: string
  }
  requestAdapterInfo?: () => Promise<{
    vendor?: string
    architecture?: string
    device?: string
    description?: string
  }>
}

const SIMD_TEST = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10,
  1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
])

function safeWasmSupport(): boolean {
  try {
    return (
      typeof WebAssembly === 'object' &&
      typeof WebAssembly.instantiate === 'function' &&
      WebAssembly.validate(
        new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]),
      )
    )
  } catch {
    return false
  }
}

function safeWasmSimdSupport(): boolean {
  try {
    return typeof WebAssembly === 'object' && WebAssembly.validate(SIMD_TEST)
  } catch {
    return false
  }
}

function detectBrowser(): { name: string; version: string | null } {
  if (typeof navigator === 'undefined') return { name: 'Unknown', version: null }

  const nav = navigator as NavigatorWithHints
  const ua = nav.userAgent

  const brands = nav.userAgentData?.brands ?? []
  const meaningful = brands.filter(
    (brand) =>
      !/Not.?A.?Brand|Chromium/i.test(brand.brand) || brand.brand === 'Chromium',
  )
  const brand = meaningful[0]
  if (brand) {
    const version = brand.version?.split('.')[0] ?? null
    return { name: brand.brand, version }
  }

  const patterns: Array<[RegExp, string]> = [
    [/Edg\/([\d.]+)/, 'Edge'],
    [/OPR\/([\d.]+)/, 'Opera'],
    [/Firefox\/([\d.]+)/, 'Firefox'],
    [/Chrome\/([\d.]+)/, 'Chrome'],
    [/Version\/([\d.]+).*Safari/, 'Safari'],
    [/Safari\/([\d.]+)/, 'Safari'],
  ]

  for (const [pattern, name] of patterns) {
    const match = ua.match(pattern)
    if (match) return { name, version: match[1]?.split('.')[0] ?? null }
  }

  return { name: 'Unknown browser', version: null }
}

function detectOs(): string {
  if (typeof navigator === 'undefined') return 'Unknown'
  const nav = navigator as NavigatorWithHints
  const platform = nav.userAgentData?.platform || nav.platform || ''
  const ua = nav.userAgent

  if (/Android/i.test(ua)) return 'Android'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS / iPadOS'
  if (/Win/i.test(platform)) return 'Windows'
  if (/Mac/i.test(platform)) return 'macOS'
  if (/Linux/i.test(platform)) return 'Linux'
  if (/CrOS/i.test(ua)) return 'ChromeOS'
  return platform || 'Unknown'
}

async function detectWebGpu(): Promise<{
  available: boolean
  adapter: string | null
}> {
  if (typeof navigator === 'undefined') {
    return { available: false, adapter: null }
  }

  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu
  if (!gpu || typeof gpu.requestAdapter !== 'function') {
    return { available: false, adapter: null }
  }

  try {
    const adapter = (await Promise.race([
      gpu.requestAdapter(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
    ])) as GPUAdapterLike | null

    if (!adapter) return { available: false, adapter: null }

    let info = adapter.info
    if (!info && adapter.requestAdapterInfo) {
      try {
        info = await adapter.requestAdapterInfo()
      } catch {
        info = undefined
      }
    }

    const description = [info?.vendor, info?.architecture, info?.device]
      .filter(Boolean)
      .join(' · ')

    return {
      available: true,
      adapter: description || info?.description || 'Adapter available',
    }
  } catch {
    return { available: false, adapter: null }
  }
}

async function detectStorage(): Promise<{
  quotaMB: number | null
  usageMB: number | null
}> {
  try {
    if (!navigator.storage?.estimate) {
      return { quotaMB: null, usageMB: null }
    }
    const estimate = await navigator.storage.estimate()
    return {
      quotaMB:
        typeof estimate.quota === 'number'
          ? Math.round(estimate.quota / (1024 * 1024))
          : null,
      usageMB:
        typeof estimate.usage === 'number'
          ? Math.round(estimate.usage / (1024 * 1024))
          : null,
    }
  } catch {
    return { quotaMB: null, usageMB: null }
  }
}

export async function detectDeviceCapabilities(): Promise<DeviceCapabilities> {
  if (typeof window === 'undefined') {
    throw new Error('Device detection must run in a browser.')
  }

  const nav = navigator as NavigatorWithHints
  const { name, version } = detectBrowser()
  const [gpu, storage] = await Promise.all([detectWebGpu(), detectStorage()])

  return {
    hardwareConcurrency:
      typeof nav.hardwareConcurrency === 'number'
        ? nav.hardwareConcurrency
        : null,
    deviceMemoryGB:
      typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    webgpu: gpu.available,
    webgpuAdapter: gpu.adapter,
    wasm: safeWasmSupport(),
    wasmSimd: safeWasmSimdSupport(),
    worker: typeof Worker !== 'undefined',
    indexedDB: (() => {
      try {
        return 'indexedDB' in window && window.indexedDB !== null
      } catch {
        return false
      }
    })(),
    storageQuotaMB: storage.quotaMB,
    storageUsageMB: storage.usageMB,
    crossOriginIsolated:
      typeof globalThis.crossOriginIsolated === 'boolean'
        ? globalThis.crossOriginIsolated
        : false,
    online: typeof nav.onLine === 'boolean' ? nav.onLine : true,
    connectionType: nav.connection?.effectiveType ?? null,
    browserName: name,
    browserVersion: version,
    osName: detectOs(),
    secureContext:
      typeof window.isSecureContext === 'boolean'
        ? window.isSecureContext
        : false,
    touch: typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0,
    screenWidth: typeof window.screen?.width === 'number' ? window.screen.width : null,
    screenHeight:
      typeof window.screen?.height === 'number' ? window.screen.height : null,
    languages: Array.isArray(nav.languages) ? [...nav.languages] : [],
    checkedAt: Date.now(),
  }
}

export async function refreshStorageEstimate(): Promise<{
  quotaMB: number | null
  usageMB: number | null
}> {
  return detectStorage()
}

export function describeDevice(caps: DeviceCapabilities): string {
  const parts = [
    caps.browserName,
    caps.osName,
    caps.deviceMemoryGB ? `${caps.deviceMemoryGB} GB memory` : null,
    caps.hardwareConcurrency ? `${caps.hardwareConcurrency} cores` : null,
    caps.webgpu ? 'WebGPU' : 'CPU/WASM',
  ].filter(Boolean)
  return parts.join(' · ')
}
