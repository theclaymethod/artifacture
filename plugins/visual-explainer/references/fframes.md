# FFrames rendering experiment

Use this opt-in route to try a shared vector sequence on FFrames' native GPU renderer. The existing HTML / HyperFrames route remains available for browser layout, native media clips, effects and narrated delivery. This bridge currently targets macOS Metal and silent vector sequences.

```sh
node "$SKILL_DIR/scripts/artifacture.mjs" fframes /absolute/video-source.tsx --out /absolute/new-native-project --render
```

`--render` reuses a native binary cached by the pinned dependencies, source template and frame configuration. It runs inspection with warnings treated as failures, saves a strip, then writes `out.mp4` and `render.json`. An inspection failure leaves its report and editable project for repair; encoding does not proceed. To export without building or encoding, omit `--render` and use the generated project's CLI:

```sh
cd /absolute/new-native-project
cargo build --release --locked
cargo run --release --locked -- inspect --all-frames --json
cargo run --release --locked -- strip -n 12
cargo run --release --locked -- frame 0s,3.6s,7s
cargo run --release --locked -- render -o out.mp4 --json
```

Require a working Rust toolchain and the native prerequisites in the [upstream guide](https://github.com/dmtrKovalenko/fframes#requirements). On macOS these include FFmpeg, pkg-config and codec libraries; upstream documents nasm/ninja for source-build fallbacks. Reuse an existing managed Rust toolchain where available. Do not change shell profiles or install another toolchain just because it is absent from PATH. A first native dependency build is substantial; subsequent builds reuse Cargo's cache.

The source must export a `sequence` from `sequenceSlides`, as in `examples/visual-explainer-mdx/code-review-diffs-video.tsx`. Resolve that example through the installed runtime's `path` command. A new output directory is required; an existing project is never overwritten. `--fps` accepts an integer from 1 to 120. Frame dimensions must be even integers from 32 to 7680. The experimental in-memory pack is limited to 10,000 frames and 512 MiB of unique SVG text.

## What stays shared

The TypeScript scene, composition and motion owners remain the source of geometry and timing. The exporter samples absolute time at `frame / fps` and calls the existing `GraphicCanvas`. It deduplicates identical sampled states into a vector bank; the native program preloads the bank and frame index before rendering. It does not take browser screenshots or reconstruct the primitives in Rust.

The bridge resolves the four built-in presets from canonical CSS into native presentation attributes, copies fonts with their OFL notices, and converts normalized stroke reveals into measured path units. It pins FFrames at `30b48f3da60040e0fd7c811fdcd5b159e70a5b02` and copies a transitive Cargo lock. The manifest records source, sequence, theme, font, lock and SVG hashes, dimensions, frame count and exact encoded duration. A fractional final frame rounds up; `authoredDuration` and `encodedDuration` report that distinction.

## What needs separate review

Native headers have a small SVG layout adapter. Use explicit newlines in titles/explanations; browser wrapping, CSS layout and font rasterization are not reproduced pixel for pixel. Run `inspect` for overflow and missing fonts, then look at actual frames. A clean diagnostic report does not establish visual or narrative quality.

This route does not ingest arbitrary React/HTML pages, private CSS brands, video/image clips, browser effects, audio or captions. Do not silently substitute it for a narrated/media composition. FFrames itself supports audio, shaders and media; those capabilities are outside this bridge's verified contract. Native Rust authoring can use the [official skill and API guide](https://github.com/dmtrKovalenko/fframes/tree/main/skills/fframes-video) when a separate native source is intended.

Check frame packs for deterministic backward seeking and actual changes at motion phases. Inspect reveals, clipping, math, edit endpoints, full explanatory poses and final frames. Inspect a contact sheet decoded from the MP4 and measure dimensions, frame rate and duration with `ffprobe`. Record export time, first build, incremental build and encode separately when comparing engines. Use matching source and output dimensions; disclose codec/quality and layout differences rather than treating one short clip as a general benchmark.

The October 7 trial and comparison live in [the verification receipt](../../../docs/verification/fframes-2026-10-07.md).
