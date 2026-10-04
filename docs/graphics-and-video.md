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
	graphic: diagram, preset: 'hairline', appearance: 'light',
});
const motion = defineGraphicMotion(diagram, {
	duration: 12,
	tracks: [{ target: 'edge:build-output', property: 'reveal',
		start: 1, duration: 2, from: 0, to: 1, ease: 'smooth' }],
});
export const sequence = sequenceSlides('build-video', [{ slide, motion, duration: 12 }]);
```

Use `<GraphicCanvas scene={diagram} />` in a poster. Use `<GraphicSlide slide={slide} />` inside a fixed-stage `PresentationSlide`. Use `<GraphicVideo sequence={sequence} />` for the video's initial markup. The complete video exporter supplies its bundled browser runtime.

The production specimens share [one source model](../examples/visual-explainer-mdx/shared-graphics-source.ts): [poster](../examples/visual-explainer-mdx/shared-graphics-poster.tsx), [slides](../examples/visual-explainer-mdx/shared-graphics-slides.tsx), and [video](../examples/visual-explainer-mdx/shared-graphics-video.tsx). The poster and video use a 1920 × 1080 frame. The slide reuses the existing interactive presentation engine while delivery video excludes navigation chrome.

## Export the formats

Run these commands from the repository:

```bash
npm run ve:export -- examples/visual-explainer-mdx/shared-graphics-poster.tsx --out dist/shared-poster.html
npm run ve:export -- examples/visual-explainer-mdx/shared-graphics-slides.tsx --out dist/shared-slides.html
npm run ve:graphic-video -- examples/visual-explainer-mdx/shared-graphics-video.tsx --out dist/shared-video/index.html
```

The video source exports `sequence`. The exporter validates every slide and motion track, resolves all sequence presets, renders the first frame, and compiles one browser runtime with Vite. Its paused GSAP timeline registers synchronously under the composition ID. Every update calls the same sampler and React graphics renderer. GSAP is pinned in the package dependencies.

A video export consists of HTML plus a local content-hashed JavaScript asset. Keep those files together when you move or serve the output. Raw exports preserve the shared Google Fonts stylesheet and require network access for the named web fonts. System fallbacks remain available when that request fails. HyperFrames compilation caches the requested fonts for compiled playback. This does not make the raw export wholly offline.

Use [shared themes](shared-themes.md) for palettes across diagrams, posters, slides, and videos. `preset` selects the palette. `appearance` selects light or dark independently. Explicit built-in presets and registry brands remain supported. The motion stylesheet supplies stage and illustration rules, rather than another palette.

## Motion contract

`sampleScene(base, motion, authoredSeconds)` derives each frame from immutable base data. It preserves unrelated base state and object IDs. It does not accumulate deltas or read a wall clock. A finite time beyond the duration holds the final state. Negative or non-finite time fails.

The supported tracks are:

- `opacity`: interpolate a value from zero to one.
- `reveal`: draw a path-only object with normalized SVG path length. Restore its original dash and arrow styles when complete.
- `highlight`: switch semantic paint when the interpolated value reaches one half.
- `translation`: interpolate finite logical x and y coordinates on an illustration object.

Tracks accept `linear` or `smooth` interpolation. Unknown targets, unsupported properties, overlapping tracks for one property, invalid ranges, and tracks beyond their duration fail. Translating individual diagram nodes fails because it would disconnect their routes and labels. Resolve changed diagram geometry through the diagram owner.

The renderer supports rectangles, circles, polygons, paths, lines, and multiline text with semantic paints. Scene creation checks finite geometry, positive dimensions, SVG path commands, unique IDs, and valid sampled state. Semantic IDs such as `node:source` and `edge:build-output` survive reuse. React instance prefixes keep accessible DOM references separate between render instances.

## Verify actual frames

Run the existing diagram, presentation, and SVG accessibility suites, then typecheck and `ve:check`. Inspect the same scene in all three outputs at the final pose. Seek the video at multiple times, then seek forward and backward to an earlier time. Compare paths, reveal values, highlight paint, and stable IDs.

HyperFrames `check` remains useful for runtime, layout, and contrast review. Its `sweep_static` layout heuristic can reject a video whose only motion changes reveal and paint while object bounds stay fixed. The shared diagram specimen currently triggers that finding. This check is not a complete motion verdict. Do not claim a green timeline result from the static exporter or ignore an unexpected frozen scene. Verify the authored state changes and inspect frames directly.

This foundation supports a finite SVG scene subset. It does not convert arbitrary React slide children to video, capture deck navigation, synthesize narration, morph arbitrary paths, or provide native Manim or Psychopomp execution. Native engine adapters require their own explicit capability contract and proof.
