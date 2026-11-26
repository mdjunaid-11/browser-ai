import { describe, expect, it } from 'vitest'
import { mergeTranscriptHypotheses, windowForPartial } from './transcriptMerge'

describe('mergeTranscriptHypotheses', () => {
  it('keeps the longer text when one hypothesis contains the other', () => {
    expect(mergeTranscriptHypotheses('hello there', 'hello')).toBe('hello there')
    expect(mergeTranscriptHypotheses('hello', 'hello there')).toBe('hello there')
  })

  it('removes duplicated overlap from adjacent Whisper windows', () => {
    expect(
      mergeTranscriptHypotheses(
        'please turn on the kitchen light',
        'the kitchen light and close the door',
      ),
    ).toBe('please turn on the kitchen light and close the door')
  })

  it('appends unrelated hypotheses without dropping either', () => {
    expect(mergeTranscriptHypotheses('first sentence', 'second sentence')).toBe(
      'first sentence second sentence',
    )
  })
})

describe('windowForPartial', () => {
  it('bounds a window and preserves overlap', () => {
    expect(windowForPartial(20000, 8000, 2000)).toEqual({
      startMs: 12000,
      endMs: 20000,
    })
  })
})
