# ISO: shared isometric visual language

Use the `iso` preset for physical mechanisms, isometric objects and thin-line diagrams. It replaces the former `hairline` theme name across posters, charts, slides, videos and new workspaces. Migrate authored preset values to `iso`; the strict upstream Hairline engine and prepared-path adapter retain their provenance names.

Combine Hairline's fine neutral outlines with [iso-figure](https://github.com/MrBongoC/ai-iso-skill)'s face projection and [iso-glow](https://isoglow.dev/)'s causal lighting: one accent, only what is live lights up. Default light appearance stays white; dark ISO uses charcoal. Keep labels readable outside the physical illustration. Do not copy reference gallery chrome, numbered plates, corner captions or palette controls into an explainer.

## Build and reuse

```sh
node "$SKILL_DIR/scripts/artifacture.mjs" list --query isometric --json
node "$SKILL_DIR/scripts/artifacture.mjs" add iso motion --cwd /absolute/project
```

Import `createIsoScene` from the copied `iso-scene` leaf. Give each part a stable ID, world origin, width/depth/height, radius and meaningful face details. `top`, `front` and `side` details are rectangles in local face coordinates; rounded paths are projected into ordinary shared primitives, so stroke widths stay uniform across face orientations. Mark windows, LEDs or an emitting surface `live: true`; at most one part is active. Generic gray boxes do not establish the style: vents, keys, openings and controls should explain what the object is and does.

The result is a `GraphicScene`: compose it with diagrams, select it for a poster, pass it to `createSlideScene`, or sample it with `defineGraphicMotion` for either browser or FFrames video. Auto-fit covers the rest pose; provide bounds that include every animated extreme. Painter order handles ordinary separate parts, not arbitrary interpenetrating geometry. Inspect occlusion when moving or stacking parts.

The host owns paints and stroke roles. Live details use a portable 2.3-unit SVG halo merged with their crisp source. Only marked live primitives receive the scoped SVG glow when their part is active. One accent continues to mean the same cause throughout a collection. Glow is a state cue, never background atmosphere or a pulse added to fill dead time. Original Hairline silhouette/crease paths remain available through the separate `hairline` block.

## Motionmaxxing on the shared clock

Discover `motion-eases`. Eight monotone curves from [Motionmaxxing](https://github.com/Tejashmakwana/motionmaxxing) extend the existing `tracks[].ease` contract:

| Intent | Curves | Useful starting duration at 30 fps |
| --- | --- | --- |
| Land and settle | `soft-land`, `snap-settle`, `glide`, `whip` | 12, 11, 10, 7 frames respectively |
| Symmetric change | `soft-in-out` | 9 frames |
| Accelerate away | `gentle-in`, `accel-exit`, `crash-out` | 9, 13, 17 frames respectively |

These are authoring options adapted from upstream observations, not timing requirements or independently reproduced performance data. Read the actual narration and visual operation before choosing duration. Existing `linear` and `smooth` tracks keep their behavior. All curves are finite, bounded and deterministic; they do not add GSAP, a simulation or another frame clock. Bounce/overshoot curves are excluded from the bounded scalar contract.

Borrow the direction, not the entire marketing-film template: build the hardest visual beat first; make each move buy understanding; land with deceleration, leave with acceleration; hand off an identifiable subject; inspect the encoded result and its ending. Respect the motion doctrine's causal events and seam direction when that workflow is available. Keep real reading and explanatory holds; do not add idle drift or glow just to satisfy Motionmaxxing's promotional-film flat-frame threshold. Preserve ISO's neutral grounds rather than imposing texture or generated imagery on every scene.

See `examples/visual-explainer-mdx/iso-source.ts`, `iso.tsx` and `iso-video.tsx` in the ready runtime: the same switch, route and receiver produce an interactive explanation and a finite film. Keep copied MIT notices and Motionmaxxing's Apache-2.0 license/NOTICE; [ISO-PROVENANCE.md](../../../visual-explainer-mdx/ISO-PROVENANCE.md) records pins and adaptations.
