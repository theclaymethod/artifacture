# Artifacture v2

Slide-first, GPU-capable authoring toolkit for explainers, slides, and deterministic video built on stock [`@open-slide/core`](https://github.com/open-slide/open-slide) and [`vgpu`](https://github.com/vercel-labs/vgpu).

> Legacy v1 (`0.10.x`) is preserved at git tag `v1-archive` (`0f04efe`).

## Packages

- **`@artifacture/gpu`** ([packages/gpu](packages/gpu)): `GpuCanvas`, `GpuMorphCanvas`, shared browser stage state, `vgpu/node` (Dawn) PNG still and sequence renderers, and `.wgsl` -> `.wgsl.ts` build helpers.
- **`@artifacture/kit`** ([packages/kit](packages/kit)): Curated core blocks (`LieflatChart`, `DiagramCanvas`, `DagCanvas`, `CodeBlock`, `DiffBlock`, `DecisionMatrix`, `Pipeline`, `DrillCard`/`DrillSheet`, `SemanticSlide`, `validateSlideSpec`) plus `@artifacture/kit/highlight` (`shiki`) and bundled styles (`@artifacture/kit/styles.css`).
- **`@artifacture/themes`** ([packages/themes](packages/themes)): Design tokens (`tokens.css`) and open-slide themes (`iso`, `function`, `function-intelligence`, `3b1b`, `algebrica`, `mono-color`).
- **`@artifacture/verify`** ([packages/verify](packages/verify)): Chromium WebGPU launcher (`--enable-unsafe-webgpu`), stage-scaled geometry auditor, Dawn WGSL validator, `pixelmatch` rewind diffing, and single-pass `runReview`.
- **`artifacture`** ([packages/cli](packages/cli)): CLI (`init`, `list`, `info`, `docs`, `shaders`, `stills`, `check`, `review`, `playground status`, `skills`) and skill router ([skills/artifacture/SKILL.md](skills/artifacture/SKILL.md)).

## Templates

- **Slides** ([templates/slides](templates/slides)): Stock `open-slide dev` and `open-slide build` with `GpuMorphCanvas` stage transitions, Dawn `stillSrc` fallbacks, `LieflatChart`, `DiagramCanvas`, `DrillCard`/`DrillSheet`, and `ComparisonSlide`.
- **Explainer** ([templates/explainer](templates/explainer)): Vite 8 + MDX + Tailwind v4 loading `.wgsl` directly via `wgslVitePlugin()`, plus `SINGLEFILE=1 vite build` single-HTML output.
- **Video** ([templates/video](templates/video)): Seek-deterministic (`window.__seek(seconds)`) `GpuCanvas` + `LieflatChart` composition with Dawn PNG sequence rendering (`render-dawn.mjs`) and FFmpeg MP4 export (`encode-mp4.sh`), plus Rust FFrames handoff notes (`FFRAMES.md`).

## Workspace Commands

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @artifacture/gpu run test:wgsl
```

CLI discovery and checks:

```bash
node packages/cli/dist/bin.js list
node packages/cli/dist/bin.js docs overview
node packages/cli/dist/bin.js check templates/slides
node packages/cli/dist/bin.js review http://127.0.0.1:4173 --surface slides --all
```

## Playground Separation

Experimental visual studies (`ascii-art`, VHS, `glass-intro`, Effects Lab, kinetic typography) live in `clayton-portfolio`, governed by [docs/playground-blocks-contract.md](docs/playground-blocks-contract.md). Inspect alignment via:

```bash
node packages/cli/dist/bin.js playground status
```
