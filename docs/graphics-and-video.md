# Reuse graphics in posters, slides, and videos

A `GraphicScene` contains immutable drawing data: logical bounds, accessible meaning, stable object IDs, and closed SVG primitives. Graphics own drawing. Diagram layout imports graphics. Slide composition imports graphics and motion. Video samples slide compositions over finite authored time.

`DiagramCanvas` uses this renderer for its desktop SVG. Its responsive layout selection and mobile reading view remain in the diagram adapter. `createDiagramScene` resolves a fixed layout with the existing `layoutDiagram`, `edgePath`, and `labelLeaderEndpoint` implementations. It does not reroute edges for video.

## Author one picture

Import the supported API from `visual-explainer-mdx/components`:

```tsx
const diagram = createDiagramScene({
	id: 'build', title: 'Source produces output', direction: 'horizontal',
	nodes: [{ id: 'source', label: 'Source' }, { id: 'output', label: 'Output' }],
	edges: [{ id: 'build-output', from: 'source', to: 'output' }],
});
const slide = createSlideScene({
	id: 'build-slide', title: 'Keep the source editable',
	explanation: 'The source remains the same when the output format changes.',
	graphic: diagram, preset: 'iso', appearance: 'light',
});
const motion = defineGraphicMotion(diagram, {
	duration: 12,
	tracks: [{ target: 'edge:build-output', property: 'reveal',
		start: 1, duration: 2, from: 0, to: 1, ease: 'smooth' }],
});
export const sequence = sequenceSlides('build-video', [{ slide, motion, duration: 12 }]);
```

Use `<GraphicCanvas scene={diagram} />` in a poster. Use `<GraphicSlide slide={slide} />` inside a fixed-stage `PresentationSlide`. Use `<GraphicVideo sequence={sequence} />` for the video's initial markup. The complete video exporter supplies its bundled browser runtime.

Text primitives accept `font: 'body' | 'display' | 'math' | 'mono'`. Stroked primitives accept `strokeRole: 'structure' | 'detail' | 'guide' | 'data' | 'active'`. These closed scalar roles survive composition, deep freezing, and JSON export. The shared renderer resolves their CSS tokens at the destination theme; an authored positive finite `strokeWidth` always wins. A guide uses the detail width, while a data path uses the regular width. Ordinary diagram geometry and native Hairline geometry retain their separate token families.

Single-line text can declare positive `textLength` for authored glyph spacing. Source cells use it with preserved literal spaces and explicit monospace columns, so a source-range rectangle follows the same geometry in every output. Ordinary text keeps its existing natural width.

The math font supports Unicode notation, including italic variables and subscripts. This text role does not parse TeX or perform formula layout. Full `MathTex` rendering and matching-term transformations remain separate engine capabilities.

The production specimens share [one source model](../examples/visual-explainer-mdx/shared-graphics-source.ts): [poster](../examples/visual-explainer-mdx/shared-graphics-poster.tsx), [slides](../examples/visual-explainer-mdx/shared-graphics-slides.tsx), and [video](../examples/visual-explainer-mdx/shared-graphics-video.tsx). The source places the same diagram block twice; only the first instance animates. The poster and video use a 1920 × 1080 frame. The poster reuses the slide's inner composition. The interactive slide keeps its presentation navigation around that same composition.

## Combine reusable blocks

A block is an ordinary `GraphicScene`, rather than a second drawing representation. `composeGraphics` places complete scenes and returns a scene with its matching finite motion:

```tsx
const composed = composeGraphics({
	id: 'two-pipelines', title: 'One block, two independent uses',
	description: 'Both copies keep their own source-to-output connection.',
	bounds: { x: 0, y: 0, width: 1200, height: 420 }, duration: 12,
	instances: [
		{ id: 'left', scene: diagram, motion,
			frame: { x: 20, y: 20, width: 550, height: 380 }, clip: 'frame' },
		{ id: 'right', scene: diagram,
			frame: { x: 630, y: 20, width: 550, height: 380 }, clip: 'frame' },
	],
});
const pose = sampleScene(composed.scene, composed.motion, 4);
// Render the same pose in a document, poster, or slide.
<GraphicCanvas scene={pose} />;
```

Author each instance's motion against its original local object IDs. The compositor binds those targets and scopes semantic identities automatically, including node order and every edge endpoint. Do not concatenate object arrays or manually construct scoped IDs. Node IDs and orders must be unique inside a source scene, and every edge must resolve to a node in that scene. Non-contiguous source orders are valid.

Fitting uniformly contains the declared source bounds inside the destination frame. Alignment defaults to the center; set `align: { x: 'start', y: 'end' }` when the explanation calls for another position. Geometry, text, strokes, arrowheads, label masks, and leaders scale together. Original path strings and paint order stay intact. Source bounds are authored camera limits, not bounds inferred from path data.

Choose `clip: 'frame'` to cut overflow at the destination frame. Choose `clip: 'none'` to add no frame clip; any existing block clip and the delivery viewport still apply. A composition can itself be instanced: its placements and rectangular clips fold into the same flat scene. Disjoint clip intersections paint nothing while preserving valid object and motion identity. Clip coordinates remain outside local sampled translation.

Each instance uses the composition's clock starting at zero. Its own motion can end earlier and hold; it cannot exceed the composition duration. Supply different local motions for independent timing. Whole-block placement is static. Changes inside a diagram still belong to its layout owner; individual diagram nodes cannot translate away from their routes. Cross-block connections, rotation, arbitrary clip paths, and animated instance placement require separate capability work.

The compositor clones and deeply freezes its output. It introduces no renderer, wall clock, callback, or React payload. The [architecture and cleanup plan](plans/reusable-graphics-blocks.md) records the chosen boundary and remaining migrations.

## Reuse ISO geometry

`createIsoScene` projects rounded top/front/side faces into this same primitive model. Face-local details can declare `live: true`; they use the `live` paint role and a scoped SVG halo when the owning part is highlighted. Other face marks stay neutral. `glow: true` is also available on authored primitives. See the [ISO guide](../plugins/visual-explainer/references/iso.md) for geometry, licensing and Motionmaxxing easing options.

## Reuse native Hairline solids

`createHairlineScene` accepts the unchanged engine's `HL.prism` path pairs. Author rounded geometry with its public `Cam`, `rings`, `prism`, and `fillet` functions. Pass solids in their composed back-to-front order; keep physical labels outside the figure.

```tsx
const figure = createHairlineScene({
	id: 'mechanism', title: 'One owning mechanism',
	description: 'A rounded plate supports one active spindle.',
	solids: [
		{ id: 'plate', paths: platePaths },
		{ id: 'spindle', paths: spindlePaths, active: true },
	],
});
```

The adapter preserves native silhouettes and creases, fills each silhouette with the local ground for honest occlusion, and uses separate illustration paint and line-weight roles. It allows one initially active solid; transfer that highlight with paired old-off/new-on motion tracks. Creases stay dim. The resulting immutable `GraphicScene` can use the same `GraphicCanvas`, `createSlideScene`, motion sampler, and video sequence API as a diagram. It neither rewrites the engine nor converts generic diagram boxes into Hairline figures. Resolve a new native pose in the geometry owner when a solid's shape changes.

## Export the formats

The [mathematical activation specimen](../examples/visual-explainer-mdx/math-activation.tsx) combines a weighted-neuron block and an independently reusable sigmoid block. Its one source supplies a static poster and a twelve-second 3b1b sequence. It reveals weighted inputs, bias, sum, function, and activation in causal order. It uses ordinary closed text primitives with Unicode symbols, not a TeX engine or a Manim port.

Run these commands from the repository:

```bash
npm run ve:export -- examples/visual-explainer-mdx/shared-graphics-poster.tsx --out dist/shared-poster.html
npm run ve:export -- examples/visual-explainer-mdx/shared-graphics-slides.tsx --out dist/shared-slides.html
npm run ve:graphic-video -- examples/visual-explainer-mdx/shared-graphics-video.tsx --out dist/shared-video/index.html
npm run ve:graphic-video -- examples/visual-explainer-mdx/math-activation.tsx --out dist/math-activation/index.html
```

The video source exports `sequence`. The exporter validates every slide and motion track, resolves all sequence presets, renders the first frame, and compiles one browser runtime with Vite. Its paused GSAP timeline registers synchronously under the composition ID. Every update calls the same sampler and React graphics renderer. GSAP is pinned in the package dependencies.

Attach an actual narration recording after retiming the sequence to its measured speech:

```bash
artifacture video /absolute/film.tsx --out /absolute/video/index.html \
  --audio /absolute/narration.wav --audio-start 0.6
```

`--audio` accepts WAV, MP3, M4A, OGG, or FLAC. `ffprobe` measures the audio stream. The exporter copies a content-hashed asset and adds an ID-bearing audio element with explicit start, duration, volume, and track. A recording that ends beyond the finite sequence is rejected; align and retime the source first. Up to one millisecond of duration-rounding tolerance is allowed. HyperFrames owns playback and mixing. Speech generation, alignment, captions, and MP4 encoding remain separate production steps. Silent exports need no FFmpeg installation.

A video export consists of HTML plus a local content-hashed JavaScript asset and any attached narration. Keep those files together when you move or serve the output. Raw exports preserve the shared Google Fonts stylesheet and require network access for the named web fonts. System fallbacks remain available when that request fails. HyperFrames compilation caches the requested fonts for compiled playback. This does not make the raw export wholly offline.

The bundled skill's [dynamic authoring guide](../plugins/visual-explainer/references/dynamic-video-authoring.md) maps story events to actual primitives and explains narration alignment, native clips, continuity, and encoded-film review. The smaller `video-longform.tsx` example now reveals relationships and transfers focus on authored time; `motion-review.tsx` demonstrates a continuous request, source correction, and replay.

Use [shared themes](shared-themes.md) for palettes across diagrams, posters, slides, and videos. `preset` selects the palette. `appearance` selects light or dark independently. Explicit built-in presets and registry brands remain supported. The motion stylesheet supplies stage and illustration rules, rather than another palette.

## Motion contract

`sampleScene(base, motion, authoredSeconds)` derives each frame from immutable base data. It preserves unrelated base state and object IDs. It does not accumulate deltas or read a wall clock. A finite time beyond the duration holds the final state. Negative or non-finite time fails.

The supported tracks are:

- `opacity`: interpolate a value from zero to one.
- `reveal`: draw a path-only object with normalized SVG path length. Restore its original dash and arrow styles when complete.
- `highlight`: switch semantic paint at one half. At a paired handoff's exact midpoint, the incoming object owns the highlight and the outgoing object releases it.
- `translation`: interpolate finite logical x and y coordinates on an illustration object.
- `route`: move an illustration along a prepared distance table. `prepareGraphicRoute` emits the exact same polyline for drawing and sampling; `followPath` compiles distance traversal, timestamp arrivals, explicit waits, and exact focus handoffs.
- `mask`: sample a rectangular split in resolved scene coordinates and intersect it with the object's original clip. `comparisonWipe` registers the common geometry and compiles complementary before/after masks.

Tracks accept `linear` or `smooth` easing. Scalar tracks may use `interpolation: 'step-end'` to apply the endpoint exactly at `start + duration`; highlight otherwise retains its midpoint switch. Unknown targets, unsupported properties, overlapping writes to one channel, invalid ranges, and tracks beyond their duration fail. Route and translation share one write channel; mask owns the clip channel. Translating individual diagram nodes fails because it would disconnect their routes and labels. Resolve changed diagram geometry through the diagram owner.

`createSourceScene` prepares exact character identities and versioned half-open source ranges. `editWithIdentity` keeps unchanged characters through a source edit. `focusSourceRange` activates range and consequence together at a normalized cue's start and clears both at its end. Its returned cues and bindings preserve provenance outside the drawing; save that receipt with the film manifest. See [motion presets](motion-presets.md) for the three compiler APIs and their copy boundaries, and the [worked motion review](../examples/visual-explainer-mdx/motion-review.tsx) for one shared figure used through narration.

The renderer supports rectangles, circles, polygons, paths, lines, and multiline text with semantic paints. Scene creation checks finite geometry, positive dimensions, SVG path commands, unique object/node identities, resolved edge endpoints, placement, clipping, and sampled state. Semantic IDs such as `node:source` and `edge:build-output` remain local when authoring a block and become scoped in a composition. React instance prefixes keep accessible DOM references separate between render instances.

## Verify actual frames

Run the existing diagram, presentation, and SVG accessibility suites, then typecheck and `ve:check`. Inspect the same scene in all three outputs at the final pose. Seek the video at multiple times, then seek forward and backward to an earlier time. Compare paths, reveal values, highlight paint, and stable IDs.

HyperFrames `check` remains useful for runtime, layout, and contrast review. Its `sweep_static` layout heuristic can reject a video whose only motion changes reveal and paint while object bounds stay fixed. The shared diagram specimen currently triggers that finding. This check is not a complete motion verdict. Do not claim a green timeline result from the static exporter or ignore an unexpected frozen scene. Verify the authored state changes and inspect frames directly.

This foundation supports a finite SVG scene subset. It does not convert arbitrary React slide children to video, capture deck navigation, synthesize narration, morph arbitrary paths, or provide native Manim or Psychopomp execution. Native engine adapters require their own explicit capability contract and proof.
