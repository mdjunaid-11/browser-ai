import { useSyncExternalStore } from 'react'
import type { TextModelSession } from '../types'
import { modelManager } from '../ai/models/modelManager'

/**
 * React view of the text-model readiness state machine. There is intentionally
 * only one instance of this state: the one owned by modelManager.
 */
export function useTextModelSession(): TextModelSession {
  return useSyncExternalStore(
    (listener) => modelManager.onTextSession(listener),
    () => modelManager.getTextSession(),
    () => modelManager.getTextSession(),
  )
}
