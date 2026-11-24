# Playground Blocks & Shader Interop Contract (`v2`)

This contract defines how experimental blocks in `clayton-portfolio` coexist cleanly with **Artifacture v2** (`@artifacture/gpu`, `@artifacture/kit`, `@artifacture/themes`) without coupling `clayton-portfolio` to `@open-slide/core` or bloating the curated v2 core.

## 1. Repository Boundary

| Ownership | Lives in | Scope |
| --- | --- | --- |
| **Core v2 blocks & slide/explainer/video runtimes** | `artifacture` (`v2`) | Curated ~10-block multi-surface core: `LieflatChart`, `DiagramCanvas`, `DagCanvas`, `CodeBlock`, `DiffBlock`, `DecisionMatrix`/`Pipeline`, `DrillCard`/`DrillSheet`, `SemanticSlide`, `GpuCanvas`, `GpuMorphCanvas`. |
| **Experimental & single-purpose visual studies** | `clayton-portfolio` | Effects Lab (`ImageRecipe` v1, `ascii-art`, `grain`), `/experiments`, `/lab`, VHS, `glass-intro`, living forms, procedural props, orbital/kinetic typography, legacy v1 experiments. |

> Note: Uncommitted experimental work currently parked on `/Users/claytonkim/dev/artifacture` (`codex/poppy-protocol`), specifically `glass-intro` and related portfolio treatments, should migrate into `clayton-portfolio` rather than entering Artifacture v2 core.

---

## 2. `PlaygroundBlockManifest` v2 Schema (`playground-blocks.json`)

Replace the currently unreferenced 53-entry `apps/portfolio/src/lib/artifacture-catalog.json` with `apps/portfolio/src/lib/playground-blocks.json` conforming to the following schema:

```json
{
  "$schema": "https://artifacture.dev/schemas/playground-blocks.v2.json",
  "version": 2,
  "updatedAt": "2026-11-23T00:00:00Z",
  "artifactureMinVersion": "2.0.0-alpha.1",
  "blocks": [
    {
      "id": "glass-intro",
      "title": "Fluted Glass Intro",
      "route": "/experiments/glass-intro",
      "sourcePath": "apps/portfolio/src/experiments/glass-intro/index.tsx",
      "renderer": "webgpu-vgpu",
      "surfaces": ["playground"],
      "status": "experimental",
      "gpuSceneExport": "glassIntroScene",
      "recipeFormat": null,
      "fallbackStill": "apps/portfolio/public/stills/glass-intro.png",
      "promotionCandidate": false,
      "tags": ["glass", "refraction", "wgsl"]
    },
    {
      "id": "effects-lab-grain",
      "title": "Effects Lab Procedural Pipeline",
      "route": "/lab/effects",
      "sourcePath": "apps/portfolio/src/lib/image-effects/index.ts",
      "renderer": "webgl2",
      "surfaces": ["playground"],
      "status": "experimental",
      "gpuSceneExport": null,
      "recipeFormat": "ImageRecipe@1",
      "fallbackStill": null,
      "promotionCandidate": false,
      "tags": ["effects-lab", "ascii", "dither", "grain"]
    }
  ]
}
```

### Field definitions

- `version`: literal `2`.
- `blocks[]`:
  - `id`: kebab-case identifier matching the `artifacture` registry naming convention.
  - `title`: human-readable block name.
  - `route`: portfolio URL path (`/experiments/...` or `/lab/...`).
  - `sourcePath`: repo-relative path to the block entry module.
  - `renderer`: `'dom-svg' | 'canvas-2d' | 'webgl2' | 'webgpu-vgpu'`.
  - `surfaces`: subset of `['playground', 'explainer', 'slides', 'video']`.
  - `status`: `'experimental' | 'stabilizing' | 'promoted'`. Once promoted into `@artifacture/*`, keep a stub pointer or mark `status: 'promoted'` instead of duplicating source.
  - `gpuSceneExport`: optional named export of a `GpuSceneDefinition<TParams>` from `sourcePath` (or adapter module) so Artifacture templates can mount it in `<GpuCanvas>` / `<GpuMorphCanvas>` and render Dawn PNGs with `renderSceneStill`.
  - `recipeFormat`: `'ImageRecipe@1'` when backed by `apps/portfolio/src/lib/image-effects/recipe.ts`, or `null`.
  - `fallbackStill`: repo-relative PNG still path when `renderer === 'webgpu-vgpu'`.
  - `promotionCandidate`: boolean indicating whether the block is proposed for graduation to Artifacture v2 core.

---

## 3. Interoperability Between `ImageRecipe` (`clayton-portfolio`) and `GpuSceneDefinition` (`@artifacture/gpu`)

Artifacture v2 defines WebGPU shaders with:

```ts
// packages/gpu/src/types.ts
export interface GpuSceneDefinition<TParams extends GpuSceneParams = GpuSceneParams> {
  readonly id: string;
  readonly label: string;
  readonly shader: ShaderSource;
  readonly defaultParams: TParams;
  readonly stillSize?: readonly [number, number];
  readonly stillTime?: number;
  readonly alphaMode?: 'opaque' | 'premultiplied';
  readonly clearColor?: readonly [number, number, number, number];
  setup?(gpu: Gpu, target: Target, initialParams: TParams): GpuSceneController<TParams>;
}
```

`clayton-portfolio` Effects Lab currently persists presets as `ImageRecipe`:

```ts
// apps/portfolio/src/lib/image-effects/recipe.ts
export interface ImageRecipe {
  version: 1;
  effect: Effect;
  settings: Values;
  time: number;
}
```

Rules for sharing Effects Lab shaders or playground GPU experiments with Artifacture decks/explainers without adding `open-slide` dependencies to `clayton-portfolio`:

1. Keep `ImageRecipe` untouched inside `clayton-portfolio`.
2. When an effect or shader is intended to mount inside Artifacture (`explainer`, `slides`, or `video`), author its WGSL shader cleanly with `@group(0) @binding(0) var<uniform> params: Params;` (`time`, `resolution`, numeric `f32`, or `vec2f`/`vec3f`/`vec4f` parameters) and export a zero-DOM `GpuSceneDefinition` adapter:
   - `defaultParams`: numeric/vector subset extracted cleanly from `recipeValues(effect, settings)` (skipping UI booleans/strings or mapping enums to numbers).
   - `stillTime`: set from `recipe.time`.
3. Never import `@open-slide/core` inside `clayton-portfolio`. `clayton-portfolio` depends only on `@artifacture/gpu` / `@artifacture/kit` / `@artifacture/themes` (or standalone `vgpu`) when consuming core primitives.

---

## 4. Promotion Criteria (Playground -> Core v2)

Before opening a PR to graduate a block from `clayton-portfolio` into `@artifacture/kit` or `@artifacture/gpu`, it must clear all three gates:

1. **Cross-surface reuse**: demonstrated need across **at least two** surfaces (`explainer`, `slides`, `video`) rather than a one-off hero/lab experiment.
2. **Dawn & static parity**: any shader passes `artifacture check` (`checkWgslDirectory` via Dawn) and generates a deterministic `renderSceneStill` fallback PNG matching its live WebGPU visual.
3. **Playwright verification**: passes `artifacture review` on both desktop and target surface viewports with zero console/page/HTTP errors, zero geometry violations, and verified `stddev > 0` / `rewindPixelDiff === 0` (when animated/scrubbed).

Run `artifacture playground status --repo /Users/claytonkim/dev/clayton-portfolio` at any time from Artifacture v2 to inspect manifest discovery and candidate promotion readiness.
