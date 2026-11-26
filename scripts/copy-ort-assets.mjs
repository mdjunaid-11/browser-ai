
/**
 * Copies ONNX Runtime WebAssembly assets into public/ort.
 * Supports packages that restrict package.json through exports.
 */

import { createRequire } from 'node:module'
import {
  copyFile,
  mkdir,
  stat,
  readFile,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const outDir = join(root, 'public', 'ort')

async function findPackageRoot(entryPath) {
  let current = dirname(entryPath)

  while (true) {
    try {
      const packageJson = JSON.parse(
        await readFile(join(current, 'package.json'), 'utf8')
      )

      if (packageJson.name === 'onnxruntime-web') {
        return current
      }
    } catch {
      // Continue searching parent directories.
    }

    const parent = dirname(current)

    if (parent === current) {
      return null
    }

    current = parent
  }
}

const candidates = [
  () => require.resolve('onnxruntime-web'),
  () => require.resolve('onnxruntime-web', {
    paths: [
      dirname(require.resolve('@huggingface/transformers')),
    ],
  }),
]

let packageRoot = null

for (const resolve of candidates) {
  try {
    const entryPath = resolve()
    packageRoot = await findPackageRoot(entryPath)

    if (packageRoot) break
  } catch (error) {
    console.warn('[copy-ort-assets] Resolution attempt failed:', error.message)
  }
}

if (!packageRoot) {
  console.error('[copy-ort-assets] Could not locate onnxruntime-web.')
  process.exit(1)
}

const distDir = join(packageRoot, 'dist')

const files = [
  'ort-wasm-simd-threaded.jsep.mjs',
  'ort-wasm-simd-threaded.jsep.wasm',
]

await mkdir(outDir, { recursive: true })

for (const file of files) {
  const source = join(distDir, file)
  const target = join(outDir, file)

  try {
    await stat(source)
    await copyFile(source, target)
    console.log(`[copy-ort-assets] Copied ${file}`)
  } catch {
    console.error(`[copy-ort-assets] Missing runtime asset: ${source}`)
    console.error('[copy-ort-assets] Check the installed ONNX Runtime package version.')
    process.exit(1)
  }
}

console.log('[copy-ort-assets] Runtime assets ready in public/ort')
