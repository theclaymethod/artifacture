# Motion video baseline

Use the [default explainer theme](default-explainer-theme.md) across formats. This reference adds motion choreography and documents the original rotating-point specimen. An explicit brand, design spec, or requested look takes precedence. Deck-to-video work retains the source's meaningful visual encodings.

The primary languages are Hairline isometric mechanisms on white and explicit `3b1b` mathematical mechanisms on black. Both combine Lieflat's data encodings with one cyan causal accent. A physical object or a mathematical relationship carries the explanation; motion shows how it works and preserves its identity.

## Visual language

New illustrations follow [default-explainer-theme.md](default-explainer-theme.md). Inline [themes.css](../../../visual-explainer-mdx/themes.css) before [hairline-motion-theme.css](../templates/hairline-motion-theme.css). Set `data-ve-preset="hairline"` for physical mechanisms, or `data-ve-preset="3b1b"` for mathematical mechanisms. A dark Hairline appearance remains available; selecting black alone does not construct a mathematical explanation. `data-motion-theme` remains an appearance compatibility attribute.

| Role | Hairline / 3b1b |
|---|---|
| Canvas | White / black; flat, without decorative texture |
| Illustration outline | Neutral gray `#8a8d98` / white `#f5f5f5`; rounded caps and joins |
| Inner crease | Dim gray `#b7b9c3` / `#747884`; thinner than the silhouette |
| Text | Readable neutral ink, separate from illustration lines |
| Active relationship | Cyan `#079fba`; the same causal meaning throughout |
| Statement | Inter / EB Garamond; 64–96px at 1920 × 1080 |
| Supporting text | Inter; 28–36px at 1920 × 1080 |
| Math | Serif notation through `--ve-font-math` |
| Hairline strokes | Silhouette 1.2, crease 0.65, active 1.2 in the engine's 400 × 320 frame |

Let the illustration occupy most of the frame. Use meaningful object features, rounded solids, honest occlusion, and a stronger silhouette than crease. Use the unchanged Hairline engine's public projection and rounded-solid functions. Keep physical labels outside its SVG and anchor them to projected features. For mathematics, use real functions, geometry transformations, arrowheads, and notation. Keep Lieflat mark size tied to declared units or actual records. Inspect the compressed result at playback size.

Keep statements and mathematical labels outside the physical illustration. Direct labels may identify variables or relationships when needed. Do not add ornamental labels, badges, numbering, fake measurements, status chips, or decorative captions.

## Explanatory motion

- Begin with a visible object or relationship, then introduce the question in direct language.
- Change one relevant variable at a time. Derive coupled motion from one model so cause and consequence agree on every frame.
- Keep a subject alive through a transformation. Prefer drawing, projection, correspondence, rearrangement, and meaningful camera moves over unrelated scene replacements.
- Draw only lines that carry meaning. Keep the construction subordinate to the result.
- Use constant speed for an actual constant-speed process, and a restrained ease for repositioning. Avoid decorative wobble, bounce, glow, particles, and arbitrary camera drift.
- Put a brief pause before a consequence or conclusion. Hold the completed relationship long enough to read it.
- Let the explanation determine duration and narration. A baseline specimen can be silent; longer explanations should use narration when requested or required by the video command.
- Use a paused, finite, seekable HyperFrames timeline. Pointer springs from interactive figures are not a video clock. Render from authored time, and verify seeking in both directions.
- Offer a paused or manually controlled preview. Reduced motion should show the complete explanatory state rather than an incomplete entrance.

Strict interactive Hairline figures use the [vendored skill](../vendor/hairline-create/SKILL.md), its unmodified kernel and bench, single highlight, pointer behavior, fixed camera, and validation workflow. Mathematical videos may need planar geometry and meaningful labels outside the physical object. Those adaptations serve the explanation and are reviewed as video scenes, not as strict interactive figures.

## Earlier reference composition

[hairline-motion-baseline.tsx](../../../examples/visual-explainer-mdx/hairline-motion-baseline.tsx) is an earlier rotating-point specimen, retained as an authored-time example. It is not the acceptance reference for native Hairline solids. The same phase drives its rotating point, projection line, trace head, and wave over 16 seconds.

```bash
npm run ve:export-static -- examples/visual-explainer-mdx/hairline-motion-baseline.tsx --out ~/.agent/videos/hairline-motion-baseline/index.html
cd ~/.agent/videos/hairline-motion-baseline
npx hyperframes check --snapshots
npx hyperframes preview --background
```

Export the dark alternative from the same source with `ARTIFACTURE_MOTION_THEME=dark npm run ve:export-static -- examples/visual-explainer-mdx/hairline-motion-baseline.tsx --out <project>/index.html`.

The sample uses the pinned GSAP URL shown in its source; HyperFrames bundles it for playback. Keep the TSX and shared theme as the editable source. Review proof frames, the complete timeline, and the dark alternative before encoding a delivery video.

## Sources

Hairline's [skill](https://hairline.lucasmarkes.com/skill) and [source](https://github.com/lucasmarkes/hairline) inform the illustration language. Artifacture bundles the complete unchanged skill and interactive runtime from revision `c3692e0c797956268847d843949f79714b6f7a41`, with its MIT license and [file hashes](../vendor/hairline-create/provenance.json). The original reference composition includes neither that runtime nor an upstream figure.

[3Blue1Brown](https://www.3blue1brown.com/) and the author's [Manim repository](https://github.com/3b1b/manim) are the requested references for visual mathematical explanation. The geometry and animation here are original; no channel assets, characters, footage, or music are reused.
