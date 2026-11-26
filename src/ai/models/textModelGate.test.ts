import { describe, expect, it } from 'vitest'
import type { TextModelSession, TextModelSessionState } from '../../types'
import { isTextSessionReady } from './textModelGate'

function session(state: TextModelSessionState): TextModelSession {
  return {
    state,
    modelId: state === 'ready' ? 'model-a' : null,
    backend: state === 'ready' ? 'wasm' : null,
    progress: state === 'ready' ? 1 : 0,
    error: state === 'error' ? 'Download failed' : null,
    previousModelId: null,
    attempt: 1,
  }
}

const loaded = (id: string) => id === 'model-a'

describe('text model readiness gate', () => {
  it('only allows READY for the selected, loaded model', () => {
    expect(isTextSessionReady(session('ready'), 'model-a', loaded)).toBe(true)
  })

  it.each<TextModelSessionState>([
    'uninitialized',
    'configuring',
    'downloading',
    'initializing',
    'error',
  ])('blocks chat in %s', (state) => {
    expect(isTextSessionReady(session(state), 'model-a', loaded)).toBe(false)
  })

  it('blocks a stale or mismatched model', () => {
    expect(isTextSessionReady(session('ready'), 'model-b', loaded)).toBe(false)
    expect(
      isTextSessionReady(session('ready'), 'model-a', () => false),
    ).toBe(false)
  })
})
