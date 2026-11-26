import type { TextModelSession } from '../../types'

/**
 * Single pure definition of the readiness gate. UI state, worker status and
 * ASR/TTS readiness are deliberately not consulted.
 */
export function isTextSessionReady(
  session: TextModelSession,
  selectedModelId: string | null,
  pipelineReady: (modelId: string) => boolean,
): boolean {
  return Boolean(
    session.state === 'ready' &&
      session.modelId &&
      session.modelId === selectedModelId &&
      pipelineReady(session.modelId),
  )
}
