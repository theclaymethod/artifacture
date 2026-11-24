# Video Surface (Deterministic Scrubbing + Dawn)

Every video composition must behave as a pure function `render(seconds)`:

1. Browser scrubbing exposes `window.__seek(seconds)` returning a `Promise<void>` resolved after React commit and animation frames settle.
2. `<GpuCanvas seconds={seconds} allowMotionUnderReduced />` disables internal `frameLoop()` clock drift and passes exact timestamps into `buildEffectSetBag`.
3. `scripts/render-dawn.mjs` renders headless frames via `renderSceneSequence` (`@artifacture/gpu/node`) and checks rewind determinism (`t=0 -> 1.5 -> 0` `pixelmatch === 0`).
4. Encode frames into H.264 MP4 with `scripts/encode-mp4.sh`, or port the same WGSL shader and uniform timeline function into Rust FFrames (`FFRAMES.md`).
