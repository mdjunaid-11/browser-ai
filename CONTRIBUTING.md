# Contributing

Thanks for taking a look at Browser AI.

## Development setup

```bash
npm install
npm run dev
```

Before opening a pull request, run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Guidelines

- Keep the app fully client-side. Do not add an application backend, paid API, or mandatory external service.
- Do not commit model weights, `public/ort`, build output, or secrets.
- Keep model metadata accurate. Only add ONNX checkpoints published for Transformers.js, and record the license and approximate size.
- Keep heavy inference inside `src/ai/worker/aiWorker.ts`. The main thread should stay responsive.
- Preserve cancellation and race-condition guards when changing streaming or speech code.
- Respect reduced-motion and keyboard accessibility.
- Add unit tests for new pure logic where practical.

## Model additions

When adding a model:

1. Verify the repository exists and contains Transformers.js-compatible ONNX weights.
2. Record the task, architecture, dtype per backend, approximate size, and license.
3. Add compatibility guidance, including a conservative memory suggestion.
4. Update the README model tables.
5. Test the model in a real browser, including the WebGPU-to-WASM fallback path.

## Reporting bugs

Include your browser and version, operating system, selected mode and model, whether WebGPU is available, the exact error message, and steps to reproduce. Never include private conversation content.
