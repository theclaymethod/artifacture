# Default explainer theme

Use `iso` as the default host across new posters, diagrams, slides, and videos: white paper or charcoal, fine gray isometric geometry, readable neutral text, and one cyan accent. [ISO](iso.md) combines Hairline linework, iso-figure projection and iso-glow causal lighting. Use `3b1b` for mathematical mechanisms: black paper, white and gray geometry, large arrowheads, and serif notation. Lieflat supplies the data encodings within either host. Explicit presets and brands take precedence. [Shared themes](../../../docs/shared-themes.md) owns the shared paint and typography roles.

## Reuse the explanation

Keep dependencies in one direction:

```text
Graphics geometry → posters and diagrams
Diagrams and scene state → animation and slides
Slides and timed scenes → video
```

Define each object and relationship once. Static formats select a scene state. Animation changes it through authored time, slides give it reading order, and video renders it on a finite, seekable timeline. Graphics do not import slide shells, video renderers, or pointer engines. Across a collection, preserve object identity, variable names, color meaning, and evidence.

## Draw meaningful objects

Choose a recognizable object whose action explains the mechanism. Use the shared `iso` block for projected face geometry and live details. For the original rounded silhouette language, use Hairline's public `Cam`, `proj`, `rings`, `prism`, `rrect`, and `fillet` through the separate prepared-path adapter. Start that route at `Cam(45, 0.5, S)`. Draw an opaque ground-colored silhouette and one inset crease. Omit vertical corners and hidden edges. Paint back to front, fit the extreme pose, and compose a complete rest pose.

The host's outline, crease, and active widths are 1.2, 0.65, and 1.2 in Hairline's 400 × 320 logical frame. Diagram outlines and routes use 0.85 logical units; chart marks use 0.85, with finer guides at 0.55. The silhouette must read at 240px wide. Selection changes color. Check the actual reading size and compressed video. Generic boxes with different colors or corner radii do not become Hairline illustrations.

Use cyan only for the active causal object, selected edge, or resulting trace. One object's related parts may share the highlight. Keep other geometry neutral and small labels in readable text ink. Put meaningful labels, equations, and measurements outside the physical illustration. Remove ornamental labels, kickers, numbers, badges, metric tiles, fake measurements, and redundant captions.

## Show the mathematical relationship

For `3b1b`, author axes, quantities, operations, and their consequences. Give arrowheads enough size to show direction at viewing scale. One model drives every related mark: an angle controls the rotating point and projection; the same projection produces the trace. Keep variable identities through staged notation changes. Use real observations or explicitly stated illustrative parameters.

A black canvas and circles do not establish this mode. Show the operation, preserve the objects through it, and leave a readable result. The browser composition uses original geometry and seekable sampling; choosing `3b1b` does not install a native Manim backend.

## Keep the data encoding

Use `LieflatChart` for fixed-unit rungs, countable unit fields, actual-date barcodes, area-scaled bubble matrices, and individual record threads. Each mark keeps its declared unit or record. Use `DataChart` for a small comparison. Never invent records or redistribute dates to make an attractive pattern. Preserve the host's neutral ink and single focal accent. See [charts.md](charts.md) for the contracts.

## Choose the route

For a strict interactive figure, read [the vendored Hairline skill](../vendor/hairline-create/SKILL.md). Author only the figure. Keep `kernel.js` and `bench.html` unchanged and run the bundled build, validator, and look workflow. Its fixed bench retains the upstream monochrome palette.

For an explainer that uses the native geometry, load the unchanged engine and put the adaptation in the host wrapper. The wrapper maps `.sil`, `.lo`, `.hi`, and `.dot` to the shared illustration roles. Only the active stroke or dot receives cyan. This user-requested color adaptation does not change the vendored skill or claim strict upstream palette conformance. Keep annotations outside the physical figure.

For video, sample the authored pose from absolute time and use [HyperFrames](hyperframes.md) as the browser clock. Pointer springs are not a seekable clock. Reuse the same model in static views and prove backward-seek equality. Use [motion choreography](motion-video-baseline.md) for narration timing and continuity. Move objects to explain an operation; remove idle wobble and decorative progress indicators.

## Provenance

The complete Hairline skill and interactive runtime are bundled unchanged, with their [MIT license](../vendor/hairline-create/LICENSE), [pinned revision and hashes](../vendor/hairline-create/provenance.json). The [rotating-point video](../../../examples/visual-explainer-mdx/hairline-motion-baseline.tsx) uses original geometry and animation, without upstream figure code or channel assets.
