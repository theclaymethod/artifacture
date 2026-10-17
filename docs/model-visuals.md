# Selected model and vector visuals

The selected f-explainer capabilities now use editable factories and explicit time. Install them with the source-copy CLI:

```sh
artifacture add shape-ascii particle-object living-forms procedural-props orbital-text trace-path --cwd ./explainer
```

`ModelView` owns loading, fitting, model sampling and disposal. One fresh source produces shaded output, shape-aware glyphs or circular points. The [gallery](../examples/visual-explainer-mdx/selected-visuals.tsx) uses the same palette and clock for all selected components; its pump is a hand-authored factory example, not a claimed image reconstruction.

```tsx
import { ModelView } from './artifacture/model-view';
import { createLivingForm } from './artifacture/living-forms';

const arbor = createLivingForm('arbor');

<ModelView source={arbor} treatment="shape-ascii" seconds={seconds}
  palette={palette} label="Branching process" />
```

Factories are stable declarations that create fresh resources per view. Their optional sampler overwrites all animated channels from absolute seconds. Semantic mesh references, pivots and closures remain attached to the original factory; no graph clone or cache revision is required. Optional `ink`/`accent` material bindings follow palette changes. GLB inputs keep authored materials unless the source explicitly supplies paint bindings.

| Entry | Use |
| --- | --- |
| model-view | `ModelView`, `createModelView`, `modelAsset`; all model presentation treatments |
| shape-ascii | Six-region measured glyph contours; font, exposure, contrast and source reveal |
| particle-object | Original seeded triangle-area and alpha-aware image sampling; point size and analytic spread |
| living-forms | `createLivingForm('strata' \| 'arbor' \| 'resonance')`; editable metaphors |
| procedural-props | `createProceduralProp(...)`; three selected soft props and finite settling |
| orbital-text | `OrbitalText`; concentric SVG phrase rings with one accent |
| trace-path | `TracePath`; normalized SVG reveal with exact hidden/full endpoints |

## Capture a requested frame

Use the imperative controller for capture. A successful draw means the requested frame is ready, including source and font preparation:

```ts
const view = createModelView(canvas, { source: arbor, width: 960, height: 540 });
try {
  await view.draw({ seconds: 2, palette, treatment: 'shape-ascii' });
  const png = canvas.toDataURL('image/png');
  // Save png in the consumer's capture pipeline.
} finally {
  await view.dispose();
}
```

React presentation draws asynchronously. The output canvas records its completed `data-ve-rendered-seconds`; match the requested frame before reading pixels. A mount callback alone does not establish readiness for later video frames. Caller-owned video/canvas sources must already contain the decoded requested frame. Effects never seek media or advance time themselves.

## Shape and point treatments

The shape matcher measures up to 16 unique glyphs, including whitespace, in a real font atlas. It compares six regional coverage values against each source cell using squared Euclidean distance. This is separate from the original luminance ramp; `AsciiObject` retains its existing ramp behavior through the same model lifecycle. Both share one standard WebGL source renderer. The shape matcher uses Canvas 2D, so it requires no WebGPU backend or experimental DOM capture.

Points sample triangle area without brightness rejection. Bindings preserve rigid mesh transforms. Skinned, instanced and morph geometry must be baked before point sampling; unsupported input reports an error. Image points include alpha-covered dark pixels and retain source color. Live canvases/videos refresh from their caller-decoded pixels. Count is bounded to 64–24,000; larger counts and point sizes are deliberate visual choices, not invented data.

Geometry factories, glyph matching and point sampling use bounded modules beneath the same owner. Any model block carries the complete shared runtime closure; this is transparent in `artifacture list --json`. SVG typography/path leaves copy independently and have no Three dependency. Canvas output is media; it is not represented as editable GraphicScene vectors. Reuse factories for figures inside a diagram, poster, slide or video and keep explanatory labels outside effects.

## Reference-based low-detail models

The global `img2threejs` skill authors reviewed procedural Three.js factories from reference images. It is available to Codex through the canonical shared installation. [The authoring guide](../plugins/visual-explainer/references/procedural-models.md) preserves its state gates, quality contract, semantic parts and multi-view evidence. Low-detail style reduces geometry detail; it does not waive silhouette or attachment checks. Connect its result with `modelAsset`, as shown in the copied [MODEL-AUTHORING.md](../visual-explainer-mdx/MODEL-AUTHORING.md).

For Blender, retain `.blend` source and export uncompressed GLB or baked frames/video. See [media effects](media-effects.md) for the starter, optional native tooling and decoding ownership.

Adapted user-owned source has [recorded provenance](../visual-explainer-mdx/F-EXPLAINER-PROVENANCE.md). No CanvasUI component source, shader, demo GLB, footage or external font enters these copy blocks. Point sampling is independently authored because CanvasUI excludes component redistribution and ports.
