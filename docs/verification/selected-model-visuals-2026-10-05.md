# Selected model visuals verification

Verified on 2026-10-05. The user's selection contains shape-aware ASCII, living forms, GLB ASCII, model/image point clouds, orbital typography, SVG path reveal and procedural props. No new test files or saved test helpers were created.

## Runtime and source-copy checks

The existing end-to-end suite passed all 25 tests. The full exporter check, TypeScript check, component registry audit and scoped lint passed. The public registry contains 50 blocks; its exports, examples, source closures, package requirements and declarations agree. The component documentation was updated for ModelView, OrbitalText and TracePath.

The bundled skill runtime was rebuilt and checked: 585 files, 3,246,380 compressed bytes. Release manifests agree at version 0.8.0. The runtime check was repeated after documentation was finalized.

A fresh consumer at `/private/tmp/artifacture-selected-consumer-final-20261005` was created by `artifacture init --no-install`, then populated with `add shape-ascii particle-object living-forms procedural-props orbital-text trace-path`. The CLI installed its declared dependencies. Its application imports the copied Arbor and trophy factories, renders shape-aware ASCII and particles, and composes OrbitalText and TracePath. Strict TypeScript and the production Vite build passed. The resulting Three.js bundle exceeds Vite's advisory 500 kB chunk threshold; this check establishes correctness, not a loading-performance budget.

The global Codex skill entry `/Users/claytonkim/.codex/skills/img2threejs` points to `/Users/claytonkim/.agents/skills/img2threejs`. The model-authoring guide preserves reference provenance, staged specifications, semantic parts and multi-view review. The gallery pump is a hand-authored factory example, not an image reconstruction.

## Browser behavior

The public galleries are `/selected-visuals/` and `/media-effects/` on the existing Cloudflare tunnel. Eight model sources rendered through shaded and particle treatments; all eight were also exercised through shape-aware ASCII, with the pump's PNG comparison recorded separately from the seven-source browser matrix. The Arbor ASCII preview rendered in Hairline, 3b1b, Mono Color and Algebrica. No component alerts were present in that matrix.

Two simultaneous views of the same pump factory reported independent authored times of 6 and 0 seconds. After the final export, the legacy AsciiObject adapter reported a completed `luminance-ascii` draw at 6 seconds with no browser warnings or errors. Its source lifecycle now belongs to the shared ModelView owner.

Actual UI PNG downloads established 6 → 0 → 6 repeatability:

| Source and treatment | Repeated 6-second PNG | SHA-256 |
| --- | ---: | --- |
| Pump, shape-aware ASCII | 68,253 bytes | `5297ed86fb33803f8994496b09bb89c7bb3694ed2700268fca6615f944564b04` |
| DNA GLB, points | 128,450 bytes | `76ec2e2f83cbe557fc625099ca1df440c86fffd92e6c007e8ef1b9b2b18e76ef` |
| Pump, 24,000 points and spread 2 after changing controls | 232,217 bytes | `6099a3d0d93c16b9afed3beb6139f55d5dea21ce2e7b742428edd4d77fa93d81` |

Each pair was byte-identical. Each corresponding 0-second PNG differed. Receipts and a contextual gallery screenshot are saved in `/Users/claytonkim/.agent/previews/artifacture-2026-10-04/` as `selected-browser-receipt.json`, `selected-seek-receipt.json`, `selected-particle-controls-receipt.json` and `selected-visuals-final.png`.

## Ownership and limits

Direct runtime probes verified semantic root/reference identity, repeated absolute-time samples, fresh independent factories, deduplicated Mesh/Line/Points resource disposal, idempotency, and abort with exactly-once disposal of a late asset. SVG probes verified path endpoints and orbital output. All six extracted form/prop factories rendered from two views; settling reaches and holds its authored endpoint.

The implementation uses standard WebGL plus a Canvas 2D six-region glyph matcher. It makes no WebGPU or TSL parity claim. Particles support rigid mesh transforms and decoded alpha-aware images, including live pixel refresh. Skinned, instanced and morph geometry requires baking before point sampling. GLB loading aborts acquisition and disposes late results; it does not cancel the underlying HTTP transfer.

CanvasUI source, shaders and assets were excluded from source-copy closures. Its public license prohibits component redistribution. The particle sampler and media effects are independently authored; selected user-owned f-explainer adaptations retain provenance. Private/demo GLB assets are not copied by the CLI.

The Blender example passed Python syntax parsing. Blender is unavailable on this host, so the example was not executed. No new encoded film was produced in this component-integration pass.
