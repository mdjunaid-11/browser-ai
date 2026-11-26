/**
 * A tiny, render-free bridge between speech playback and the avatar.
 *
 * The avatar polls `getLevel()` inside requestAnimationFrame and updates SVG
 * attributes directly. This avoids 60 React renders per second.
 */
class SpeechLevelBus {
  private speaking = false
  private externalLevel = 0
  private lastBoundary = 0
  private boundaryDuration = 110

  setSpeaking(value: boolean): void {
    this.speaking = value
    if (!value) {
      this.externalLevel = 0
      this.lastBoundary = 0
    }
  }

  isSpeaking(): boolean {
    return this.speaking
  }

  setExternalLevel(level: number): void {
    this.externalLevel = Math.max(0, Math.min(1, level))
  }

  /**
   * Browser speech synthesis exposes word boundaries on most browsers. We use
   * them as an estimated mouth pulse — not as phoneme-accurate lip sync.
   */
  markBoundary(wordLength = 5): void {
    this.lastBoundary = performance.now()
    this.boundaryDuration = Math.max(70, Math.min(260, wordLength * 28))
  }

  getLevel(): number {
    if (!this.speaking) return 0

    const now = performance.now()
    const since = now - this.lastBoundary
    let boundaryLevel = 0
    if (this.lastBoundary > 0 && since < this.boundaryDuration) {
      boundaryLevel =
        Math.sin((since / this.boundaryDuration) * Math.PI) * 0.75
    }

    // A gentle fallback motion when boundary events are unavailable.
    const ambient = 0.1 + 0.07 * Math.abs(Math.sin(now / 95))
    return Math.max(0, Math.min(1, Math.max(this.externalLevel, boundaryLevel, ambient)))
  }

  reset(): void {
    this.speaking = false
    this.externalLevel = 0
    this.lastBoundary = 0
  }
}

export const speechLevel = new SpeechLevelBus()
