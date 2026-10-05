# Editable models through the pipeline

Discover `model-view`, `shape-ascii`, `particle-object`, `living-forms` and `procedural-props` through `artifacture list --json`. The same ModelView owns a fresh source and presents it shaded, as measured glyphs or as circular points. The shared model runtime travels with these blocks. OrbitalText and TracePath are separate SVG leaves.

For a reference-based low-detail model, use the installed `img2threejs` skill. Run its state gate, suitability analysis, quality contract and sculpt passes. Keep the reference provenance, specification, semantic parts, reviewed views and editable model factory. Low-detail output still needs silhouette, attachment and multi-view review. This runtime does not reconstruct images automatically.

Adapt an ordinary factory through `modelAsset`:

```ts
import { modelAsset } from './model-view';
import type { ModelFactory } from './model-types';

const source: ModelFactory = () => {
  const root = createPumpModel(spec);
  const wheel = root.getObjectByName('flywheel');
  return modelAsset(root, {
    sample(seconds) {
      if (wheel) wheel.rotation.z = seconds * 1.8;
    },
  });
};
```

A factory returns fresh geometry for each view and preserves its named part references. Declare it outside a React render or memoize its inputs. Sampling overwrites animated channels from absolute seconds; it must not accumulate deltas or start RAF. Optional material bindings choose `ink` or `accent` roles, so later theme changes affect the same asset. Retain one contrastive accent.

For custom resources outside the returned hierarchy, return your own ModelAsset with an idempotent `dispose`. Respect the factory AbortSignal and release late asynchronous results. `modelAsset` releases hierarchy geometry, materials and textures; decoded image/video elements remain caller-owned.

Capture with `await createModelView(canvas, {source}).draw(frame)` for each requested time, then read pixels. Dispose the controller when complete. React rendering is asynchronous; do not capture before its reported rendered seconds matches the requested frame. The caller owns media seeking and decoding, fonts and permitted assets. Keep labels and captions outside canvas effects.

Blender is an optional source authoring tool: keep `.blend`, export uncompressed GLB with embedded textures, preserve the license, or bake simulation to prepared frames/video. No Draco/KTX decoder is fetched automatically. Point sampling initially supports static meshes and rigid transforms; bake skinned, instanced or morph geometry first.
