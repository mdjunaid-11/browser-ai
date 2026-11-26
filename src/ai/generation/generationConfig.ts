export interface ModelGenerationConfig {
  max_new_tokens: number
  min_new_tokens?: number
  temperature: number
  top_p: number
  top_k?: number
  do_sample: boolean
  repetition_penalty: number
  no_repeat_ngram_size: number
  early_stopping?: boolean
}

export function getGenerationConfig(
  modelId: string,
  options: {
    maxNewTokens: number
    temperature: number
    topP: number
  },
): ModelGenerationConfig {
  const id = (modelId ?? '').toLowerCase()
  const isSeq2Seq = id.includes('flan') || id.includes('t5')

  if (isSeq2Seq) {
    return {
      max_new_tokens: Math.max(16, Math.min(128, options.maxNewTokens)),
      min_new_tokens: 1,
      temperature:
        options.temperature > 0.15
          ? Math.min(0.7, Math.max(0.2, options.temperature))
          : 0,
      top_p: Math.max(0.8, Math.min(0.95, options.topP)),
      top_k: 40,
      do_sample: options.temperature > 0.15,
      repetition_penalty: 1.05,
      no_repeat_ngram_size: 3,
      early_stopping: true,
    }
  }

  return {
    max_new_tokens: Math.max(32, Math.min(512, options.maxNewTokens)),
    min_new_tokens: 1,
    temperature: Math.min(0.7, Math.max(0.1, options.temperature)),
    top_p: Math.max(0.85, Math.min(0.95, options.topP)),
    top_k: 50,
    do_sample: options.temperature > 0.05,
    repetition_penalty: 1.05,
    no_repeat_ngram_size: 3,
  }
}
