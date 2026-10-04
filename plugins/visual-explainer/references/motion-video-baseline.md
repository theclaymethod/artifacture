# Motion video baseline

Use the [default explainer theme](default-explainer-theme.md) across formats. This reference adds motion choreography and documents the original rotating-point specimen. An explicit brand, design spec, or requested look takes precedence. Deck-to-video work retains the source's meaningful visual encodings.

The default combines Hairline's fine-line objects with the explanatory approach requested from 3Blue1Brown. A physical or geometric illustration carries the explanation. Motion exposes a relationship, preserves the identity of the subject, and leaves a complete, readable result.

## Visual language

New reusable illustrations follow the host roles in [default-explainer-theme.md](default-explainer-theme.md). The original specimen's tokens and SVG classes live in [hairline-motion-theme.css](../templates/hairline-motion-theme.css). Inline [themes.css](../../../visual-explainer-mdx/themes.css) first, then the motion stylesheet. Set `data-ve-preset="hairline"` and `data-ve-appearance="dark"` on the composition root for the dark alternative. `data-motion-theme` remains an appearance compatibility attribute. These specimen values do not override an explicit theme or the shared `--ve-*` roles.

| Role | Specimen |
|---|---|
| Canvas | Warm paper `#f5f3ed`; flat, without decorative texture |
| Outline | Charcoal `#252a2c`; rounded caps and joins |
| Inner crease | Muted `#60696d`; thinner than the silhouette |
| Construction | `#b3b8b6`; subordinate to the object |
| Active relationship | Blue `#286b8b`; consistent meaning throughout |
| Statement | EB Garamond, regular; 72–96px at 1920 × 1080 |
| Supporting text | Montserrat, regular; 28–36px at 1920 × 1080 |
| Strokes | Silhouette 2.8px, crease 1.6px, active 3.8px at 1920 × 1080 |

Let the illustration occupy most of the frame. Use a small number of meaningful objects, rounded solids, honest occlusion, and a stronger outer silhouette than inner construction. Begin with a composed resting pose. Preserve recognizable object features rather than substituting generic boxes. Inspect at the intended playback size; increase stroke weight when compression or a smaller viewport obscures the relationship.

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

## Reference composition

[hairline-motion-baseline.tsx](../../../examples/visual-explainer-mdx/hairline-motion-baseline.tsx) demonstrates a point rotating on a fine-line instrument, a change from oblique to planar view, and the point's height traced over time. The same phase drives the rotating point, projection line, trace head, and wave. The continuous drawing stays in one scene for 16 seconds.

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
