import type {
  Backend,
  ModelInfo,
  ModelKind,
  OperatingMode,
} from '../../types'

/**
 * Central registry of verified Transformers.js models.
 *
 * Only models with ONNX weights published for Transformers.js are listed.
 * Sizes are approximate quantized download sizes, measured from the public
 * Hugging Face repositories. They can change when a repository is updated.
 */
export const TEXT_MODELS: ModelInfo[] = [
  {
    id: 'Xenova/LaMini-Flan-T5-77M',
    kind: 'text',
    label: 'LaMini-Flan-T5 77M',
    family: 'LaMini · T5',
    description:
      'The smallest option. Fast on modest CPUs and useful for short, simple answers. Expect limited reasoning and context retention.',
    approxSizeMB: 96,
    dtype: { wasm: 'q8' },
    backends: ['wasm'],
    modes: ['potato', 'balanced', 'custom'],
    quality: 'basic',
    minMemoryGB: 2,
    minCores: 1,
    license: 'CC-BY-NC-4.0',
    task: 'text2text-generation',
    architecture: 'seq2seq',
    multilingual: false,
    languages: ['en'],
    notes:
      'Non-commercial license. Encoder–decoder model: the app constructs an instruction-style prompt instead of using a chat template.',
  },
  {
    id: 'Xenova/LaMini-Flan-T5-248M',
    kind: 'text',
    label: 'LaMini-Flan-T5 248M',
    family: 'LaMini · T5',
    description:
      'The balanced default. Better writing quality than the 77M build while remaining usable with CPU inference on many laptops.',
    approxSizeMB: 276,
    approxWebGpuSizeMB: 225,
    dtype: { wasm: 'q8', webgpu: 'q4f16' },
    backends: ['wasm', 'webgpu'],
    modes: ['balanced', 'quality', 'custom'],
    quality: 'balanced',
    minMemoryGB: 3,
    minCores: 2,
    license: 'CC-BY-NC-4.0',
    task: 'text2text-generation',
    architecture: 'seq2seq',
    multilingual: false,
    languages: ['en'],
    recommended: true,
    notes:
      'Non-commercial license. Small encoder–decoder models can repeat themselves and usually remember only a few recent turns.',
  },
  {
    id: 'HuggingFaceTB/SmolLM2-360M-Instruct',
    kind: 'text',
    label: 'SmolLM2 360M Instruct',
    family: 'SmolLM2',
    description:
      'A chat-tuned 360M model with better multi-turn behaviour than LaMini. English-focused and best suited to modern devices.',
    approxSizeMB: 365,
    approxWebGpuSizeMB: 273,
    dtype: { wasm: 'q8', webgpu: 'q4f16' },
    backends: ['wasm', 'webgpu'],
    modes: ['balanced', 'quality', 'custom'],
    quality: 'high',
    minMemoryGB: 4,
    minCores: 2,
    license: 'Apache-2.0',
    task: 'text-generation',
    architecture: 'causal',
    multilingual: false,
    languages: ['en'],
    notes:
      'Uses the model chat template. WebGPU makes a noticeable difference on supported browsers.',
  },
  {
    id: 'onnx-community/Qwen2.5-0.5B-Instruct',
    kind: 'text',
    label: 'Qwen2.5 0.5B Instruct',
    family: 'Qwen2.5',
    description:
      'The largest text option here. Stronger reasoning and multilingual support (including Hindi), at the cost of a larger download and more memory.',
    approxSizeMB: 512,
    approxWebGpuSizeMB: 483,
    dtype: { wasm: 'q8', webgpu: 'q4f16' },
    backends: ['wasm', 'webgpu'],
    modes: ['quality', 'custom'],
    quality: 'high',
    minMemoryGB: 6,
    minCores: 4,
    license: 'Apache-2.0',
    task: 'text-generation',
    architecture: 'causal',
    multilingual: true,
    languages: ['en', 'hi', 'multilingual'],
    notes:
      'Recommended for WebGPU or a capable CPU. On low-memory devices the browser may terminate the tab while loading it.',
  },
]

export const ASR_MODELS: ModelInfo[] = [
  {
    id: 'Xenova/whisper-tiny',
    kind: 'asr',
    label: 'Whisper Tiny (multilingual)',
    family: 'Whisper',
    description:
      'Local multilingual speech recognition for English, Hindi and many other languages. Runs only when you activate voice input.',
    approxSizeMB: 41,
    approxWebGpuSizeMB: 52,
    dtype: { wasm: 'q8', webgpu: 'q4f16' },
    backends: ['wasm', 'webgpu'],
    modes: ['potato', 'balanced', 'quality', 'custom'],
    quality: 'balanced',
    minMemoryGB: 2,
    minCores: 1,
    license: 'Apache-2.0',
    task: 'automatic-speech-recognition',
    multilingual: true,
    languages: ['en', 'hi', 'multilingual'],
    recommended: true,
    notes:
      'Audio is processed in the browser and is not uploaded. Accuracy drops with background noise and strong accents.',
  },
  {
    id: 'Xenova/whisper-tiny.en',
    kind: 'asr',
    label: 'Whisper Tiny English',
    family: 'Whisper',
    description:
      'English-only variant with the same footprint as multilingual Tiny. Use it if you only speak English.',
    approxSizeMB: 41,
    approxWebGpuSizeMB: 52,
    dtype: { wasm: 'q8', webgpu: 'q4f16' },
    backends: ['wasm', 'webgpu'],
    modes: ['potato', 'balanced', 'quality', 'custom'],
    quality: 'balanced',
    minMemoryGB: 2,
    minCores: 1,
    license: 'Apache-2.0',
    task: 'automatic-speech-recognition',
    multilingual: false,
    languages: ['en'],
  },
  {
    id: 'Xenova/whisper-base',
    kind: 'asr',
    label: 'Whisper Base (multilingual)',
    family: 'Whisper',
    description:
      'More accurate multilingual transcription, roughly twice the size of Tiny. Best on standard or high-resource devices.',
    approxSizeMB: 77,
    approxWebGpuSizeMB: 83,
    dtype: { wasm: 'q8', webgpu: 'q4f16' },
    backends: ['wasm', 'webgpu'],
    modes: ['balanced', 'quality', 'custom'],
    quality: 'high',
    minMemoryGB: 4,
    minCores: 2,
    license: 'Apache-2.0',
    task: 'automatic-speech-recognition',
    multilingual: true,
    languages: ['en', 'hi', 'multilingual'],
    notes: 'Slower than Tiny, especially on CPU.',
  },
]

export const TTS_MODELS: ModelInfo[] = [
  {
    id: 'onnx-community/Kokoro-82M-v1.0-ONNX',
    kind: 'tts',
    label: 'Kokoro 82M',
    family: 'Kokoro',
    description:
      'A compact neural text-to-speech model with natural English voices. Optional: the app falls back to your browser voices if loading or synthesis fails.',
    approxSizeMB: 92,
    approxWebGpuSizeMB: 163,
    dtype: { wasm: 'q8', webgpu: 'fp16' },
    backends: ['wasm', 'webgpu'],
    modes: ['balanced', 'quality', 'custom'],
    quality: 'high',
    minMemoryGB: 3,
    minCores: 2,
    license: 'Apache-2.0',
    task: 'text-to-speech',
    multilingual: false,
    languages: ['en'],
    notes:
      'English phonemization is performed locally. Hindi responses use browser speech synthesis instead.',
  },
]

export const ALL_MODELS: ModelInfo[] = [
  ...TEXT_MODELS,
  ...ASR_MODELS,
  ...TTS_MODELS,
]

export const KOKORO_VOICES = [
  { id: 'af_heart', label: 'Heart · US English · female' },
  { id: 'af_bella', label: 'Bella · US English · female' },
  { id: 'af_nicole', label: 'Nicole · US English · female' },
  { id: 'am_michael', label: 'Michael · US English · male' },
  { id: 'am_fenrir', label: 'Fenrir · US English · male' },
  { id: 'bf_emma', label: 'Emma · British English · female' },
  { id: 'bm_george', label: 'George · British English · male' },
] as const

export function getModelById(id: string): ModelInfo | undefined {
  return ALL_MODELS.find((model) => model.id === id)
}

export function getModelsByKind(kind: ModelKind): ModelInfo[] {
  return ALL_MODELS.filter((model) => model.kind === kind)
}

export function getDefaultTextModelId(mode: OperatingMode): string {
  switch (mode) {
    case 'potato':
      return 'Xenova/LaMini-Flan-T5-77M'
    case 'balanced':
      return 'Xenova/LaMini-Flan-T5-248M'
    case 'quality':
      return 'HuggingFaceTB/SmolLM2-360M-Instruct'
    case 'custom':
    default:
      return 'Xenova/LaMini-Flan-T5-248M'
  }
}

export function getDefaultAsrModelId(): string {
  return 'Xenova/whisper-tiny'
}

export function getDefaultTtsEngine(mode: OperatingMode): 'browser' | 'kokoro' {
  return mode === 'quality' ? 'kokoro' : 'browser'
}

export function estimateModelSizeMB(
  model: ModelInfo,
  backend: Backend,
): number {
  if (backend === 'webgpu' && model.approxWebGpuSizeMB) {
    return model.approxWebGpuSizeMB
  }
  return model.approxSizeMB
}

export function formatModelSize(mb: number): string {
  if (mb >= 1024) {
    return `~${(mb / 1024).toFixed(1)} GB`
  }
  return `~${Math.round(mb)} MB`
}
