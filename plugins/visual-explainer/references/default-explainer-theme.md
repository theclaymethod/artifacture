# Default explainer theme

Use the `hairline` preset across new posters, diagrams, slides, and videos: warm paper, fine charcoal lines, blue emphasis, EB Garamond headings, and Montserrat text. It extends Lieflat layout and semantic `--ve-*` roles. Explicit presets and brands take precedence. [Shared themes](../../../docs/shared-themes.md) owns palette and appearance; video consumes those same roles.

## Reuse the explanation

Keep dependencies in one direction:

```text
Graphics geometry → posters and diagrams
Diagrams and scene state → animation and slides
Slides and timed scenes → video
```

Define each object and relationship once. Static formats select a scene state. Animation changes it through authored time, slides give it reading order, and video renders it on a finite, seekable timeline. Graphics do not import slide shells, video renderers, or pointer engines. Across a collection, preserve object identity, variable names, color meaning, and evidence.

## Draw meaningful objects

Choose recognizable fine-line metaphors when their shape explains a mechanism. Keep established chart, graph, and code encodings when an object would obscure the facts. Draw rounded solids with a clear silhouette, restrained creases, and honest occlusion. Compose a readable resting pose. Check thin strokes at reading size and after compression.

Use host tokens and semantic color consistently. Meaningful labels, equations, and measurements may sit outside the physical illustration. Remove ornamental labels, kickers, numbers, badges, status chips, metric tiles, fake measurements, and redundant captions.

## Choose the route

For a strict interactive figure, read [the vendored Hairline skill](../vendor/hairline-create/SKILL.md). Author only the figure. Keep `kernel.js` and `bench.html` unchanged, and run the bundled build, validator, and look workflow. Embed its self-contained HTML in an isolated, accessible iframe. Keep its palette and controls inside the fixed bench.

For video, use deterministic shared scenes and [motion choreography](motion-video-baseline.md), with [HyperFrames](hyperframes.md) as the browser video clock. Pointer springs are not a seekable clock. The requested 3Blue1Brown influence is continuous object identity and mathematical correspondence.

## Provenance

The complete Hairline skill and interactive runtime are bundled unchanged, with their [MIT license](../vendor/hairline-create/LICENSE), [pinned revision and hashes](../vendor/hairline-create/provenance.json). The [rotating-point video](../../../examples/visual-explainer-mdx/hairline-motion-baseline.tsx) uses original geometry and animation, without upstream figure code or channel assets.
