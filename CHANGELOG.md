# Changelog

All notable changes to this project are documented here.

## 1.0.0 — 2026-11-26

### Added

- First-run setup wizard with device detection, performance modes, companion picker, and voice preferences.
- Local text generation through Transformers.js with LaMini-Flan-T5 77M/248M, SmolLM2 360M Instruct, and Qwen2.5 0.5B Instruct.
- Web Worker inference with lazy loading, progress reporting, cancellation, and LRU model eviction.
- True token streaming with a presentation streamer and race-condition guards.
- Local Whisper speech recognition with push-to-talk and auto-conversation modes.
- Browser speech synthesis plus optional Kokoro 82M neural TTS with automatic fallback.
- Nine original animated SVG companions with idle, listening, thinking, speaking, happy, and error states.
- IndexedDB conversation persistence, searchable history, rename, delete, and context management.
- Dark, light, and system themes; reduced-motion support; responsive mobile and desktop layouts.
- Unit tests for prompts, compatibility scoring, and settings normalization.
- GitHub Pages deployment workflow and project documentation with Mermaid diagrams.

### Security and privacy

- No backend, analytics, or telemetry.
- Microphone audio is processed in memory and discarded after transcription.
- Model files are cached by the browser and can be cleared from settings.
