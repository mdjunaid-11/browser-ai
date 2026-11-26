/** Pure helpers for combining overlapping Whisper window hypotheses. */

function words(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean)
}

/**
 * Merge a new partial hypothesis into the previous preview.
 *
 * Overlapping windows commonly repeat the last few words of the previous
 * window. This keeps the longest non-duplicating suffix/prefix overlap instead
 * of appending duplicate text or replacing the whole preview with a shorter
 * hypothesis.
 */
export function mergeTranscriptHypotheses(previous: string, next: string): string {
  const a = words(previous)
  const b = words(next)
  if (a.length === 0) return b.join(' ')
  if (b.length === 0) return a.join(' ')

  if (b.length <= a.length && a.join(' ').includes(b.join(' '))) return a.join(' ')
  if (a.length <= b.length && b.join(' ').includes(a.join(' '))) return b.join(' ')

  const maxOverlap = Math.min(a.length, b.length, 24)
  for (let size = maxOverlap; size > 0; size -= 1) {
    const suffix = a.slice(a.length - size).join(' ')
    const prefix = b.slice(0, size).join(' ')
    if (suffix === prefix) {
      return [...a, ...b.slice(size)].join(' ')
    }
  }

  return [...a, ...b].join(' ')
}

/** A short, bounded window ending at `endMs`, used for local partial hypotheses. */
export function windowForPartial(
  durationMs: number,
  windowMs = 8000,
  overlapMs = 2000,
): { startMs: number; endMs: number } {
  const endMs = Math.max(0, durationMs)
  const startMs = Math.max(0, endMs - Math.max(windowMs, overlapMs))
  return { startMs, endMs }
}
