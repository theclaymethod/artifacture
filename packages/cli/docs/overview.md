# Artifacture v2 Overview

Artifacture v2 provides three surface runtimes over a shared WebGPU and diagram core:

- **Slides** (`templates/slides`): stock `@open-slide/core` decks enhanced with `GpuMorphCanvas`, `DrillCard`/`DrillSheet`, `ComparisonSlide`, `LieflatChart`, and `DiagramCanvas`.
- **Explainers** (`templates/explainer`): standalone Vite 8 + MDX articles loading `.wgsl` directly via `@vgpu/wgsl/loader-vite` and bundling cleanly for web or singlefile HTML.
- **Video** (`templates/video`): deterministic timestamp-driven (`__seek(seconds)` and `vgpu/node` Dawn sequence) compositions ready for FFmpeg or Rust FFrames handoff.

Core packages:
- `@artifacture/gpu` — `GpuCanvas`, `GpuMorphCanvas`, Dawn still/sequence rendering, precompiled WGSL utilities.
- `@artifacture/kit` — curated ~10-block component core (`LieflatChart`, `DiagramCanvas`, `DagCanvas`, `CodeBlock`, `DiffBlock`, `DecisionMatrix`, `Pipeline`, `DrillCard`/`DrillSheet`, `SemanticSlide`, `validateSlideSpec`) plus `@artifacture/kit/highlight` (`shiki`).
- `@artifacture/themes` — CSS tokens (`tokens.css`) and open-slide themes (`iso`, `function`, `function-intelligence`, `3b1b`, `algebrica`, `mono-color`).
- `@artifacture/verify` — Playwright Chromium WebGPU launcher, Dawn WGSL validator, stage geometry auditor, PNG variance analyzer, and single-pass `runReview`.
