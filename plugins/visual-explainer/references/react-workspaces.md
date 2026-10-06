# Reusable React graphics and motion

Use this route for a React app, an editable component library, or scenes reused across posters, slides, and video. Standalone exported explanations still use the ordinary MDX/TSX route.

## Start from the installed skill

Use the bundled CLI from the installed skill directory. It handles runtime setup, consumer packages, and stylesheet imports:

```bash
node "$SKILL_DIR/scripts/artifacture.mjs" list --query focus --json
node "$SKILL_DIR/scripts/artifacture.mjs" init ./explainer
cd explainer
npm run dev
```

The starter provides React, TypeScript, Vite, horizontal and vertical compositions, and direct time seeking. Edit `src/visual.ts` for geometry and motion. `src/artifacture/` is editable source owned by the consumer, with its license. `artifacture.json` controls the relative source directory.

For an existing React project, use `add` rather than `init`:

```bash
node "$SKILL_DIR/scripts/artifacture.mjs" add hairline charts slides video --cwd /absolute/project --dry-run
node "$SKILL_DIR/scripts/artifacture.mjs" add hairline charts slides video --cwd /absolute/project
```

The CLI installs missing npm packages and imports the required styles. Use `--no-install` to retain manual package management or `--entry <file>` for a custom app entry. Exact reruns preserve files; a conflict stops the whole plan before writing. Reconcile consumer edits rather than overwriting them. The CLI requires paths without symlink ancestors.

## Discover the implemented library

Use `list --query <capability-or-API> --json` before choosing a block. The index comes from the same registry as `add`: results contain leaf exports, constraints, runnable example paths relative to `REPO`, copied dependency closure, package versions, CSS, and copy commands. Read variant values and their parameter paths from discovery rather than guessing props. `defaultImport` is relative to a caller in `src`; adjust it for a configured destination.

| Block | Owned capability |
| --- | --- |
| graphics | Validated, frozen scene data and accessible SVG primitives |
| diagram | Node and relationship layout adapted to a scene |
| dag | Multi-parent dependency minimap, lineage focus and a shared-scene reveal |
| native-clip, manim-clip, psychopomp-clip | Validated rendered clips and selected frames, with optional native source starters |
| hairline | Prepared `HL.prism` silhouette and crease pairs; native kernel stays separate |
| axonometric-plan, exploded-axonometric | Model-coordinate plans, rounded physical parts, tray occlusion and finite phase/lift motion; read [axonometric.md](axonometric.md) |
| charts | Lieflat rung bars, unit fields, barcode, bubble matrix, and record threads |
| motion | Finite opacity, path reveal, highlight, and illustration translation |
| composition | Fit complete scene instances into frames; scope identities and share time |
| slides | Title, explanation, theme, graphic, and finite slide sequence |
| video | Initial React host and a paused GSAP clock with playback, seeking, and disposal |
| diagram-canvas, diagram-walkthrough | Flow/tree/swimlane/timeline and an interactive packet trace |
| data-chart, thread-plot | Bar/line/dot measurements and selectable individual record traces |
| code-block, diff-block, terminal-block, json-tree, quiz | Annotated source, unified/split edits, transcripts, expandable data, and feedback |
| pipeline, decision-matrix, risk-ledger | Ordered steps, real choice criteria, and concrete failure signals |
| sequence-scene, state-scene, layer-scene | Messages, transition loops, and nested ownership as GraphicScene data |
| plot-scene, token-scene, playhead-scene, grid-scene | Numeric line/scatter, discrete decisions, timed events, and fraction-filled scalar cells |
| reveal-in-order, focus-in-order | Ordered tracks on the existing finite sampler |
| video-frames | Explicit encoded frame times and separate exact-endpoint loop inspection |
| authored-values | Dependency-free monotone scalar/vector parameter tracks sampled at authored seconds |
| narration-cues | Dependency-free absolute-second cues with provenance and SRT/WebVTT serialization |

Search an API such as `CodeBlock`, `createSequenceScene`, or `focusInOrder` to
obtain its actual copy boundary and variants. Use the live catalog as the
complete inventory.

There are 52 copyable entries in the same registry; supported variants are searchable.
The broad MDX API contains additional presentation components and icons that have
not all been extracted as copyable leaves. Do not count referenced upstream types
as installed components. Read `REPO/docs/component-catalog.md` and the real
`component-catalog.tsx` example for the available contracts.

Hairline is the default. `3b1b`, `mono-color`, and `algebrica` retain geometry and data contracts. Browser mathematical scenes use Unicode with STIX Two Math. For native formula typesetting and matching-shape transforms, read [native-engines.md](native-engines.md) and use Manim Community. Interactive charts remain React components. Numeric plot and scalar-grid builders provide a scene route for authored output.

`authored-values` and `narration-cues` retain their adapted LemoLab MIT notice as `LEMO-LICENSE` beside the copied source. They add no npm dependencies or clock. Keep actual audio duration and alignment provenance when compiling cues. Overlap repair and clipping padded ASR starts require explicit options; clipped cues retain the original source interval.

Import `themes.css` once in the app entry. Slides and video also need `hairline-motion-theme.css`; chart leaves import their own chart CSS. Read `REPO/docs/shared-themes.md` for token roles and `REPO/docs/graphics-and-video.md` for full scene and delivery contracts. Native pointer-driven Hairline figures use the vendored skill instead of this sampler.

## Author and inspect motion

Build each reusable scene once, then use `composeGraphics` to place instances into frames. Do not concatenate scoped IDs. Choose separately authored wide and narrow layouts before sampling. Posters use `sampleScene(scene, motion, seconds)` at a selected beat; slides and video wrap the same geometry.

```ts
const motion = defineGraphicMotion(scene, {
  duration: 4,
  tracks: [
    { target: "detail", property: "opacity", start: 0.4,
      duration: 0.8, from: 0, to: 1 },
    { target: "connection", property: "reveal", start: 0.4,
      duration: 0.8, from: 0, to: 1 },
  ],
});
const frame = sampleScene(scene, motion, 0.8);
```

Targets must exist. Reveal requires path-only objects; translation supports illustration objects. Paired highlight tracks transfer focus at their midpoint. Motion is sampled from immutable base data, so seeking backward does not accumulate changes. There is no spring simulation. Hold a completed pose long enough to read it.

Render one `GraphicVideo` host, register it after mount with `registerGraphicVideo(sequence)`, then control `time(seconds, false)`, `play()`, and `pause()`. Registration draws synchronously, so defer it until after a parent React commit. In a React effect use this lifecycle:

```tsx
useEffect(() => {
  let timeline: ReturnType<typeof registerGraphicVideo> | undefined;
  const task = requestAnimationFrame(() => {
    timeline = registerGraphicVideo(sequence);
  });
  return () => {
    cancelAnimationFrame(task);
    if (timeline) disposeGraphicVideo(timeline);
  };
}, [sequence]);
```

Keep the sequence stable between playback updates. Disposal kills its clock and releases the nested React root after the parent's commit. The runtime currently supports one host per document. A slide is a fixed authored stage: fit that stage in the host, and choose typography and geometry for a separate narrow layout rather than shrinking a wide frame until its labels are unreadable.

For a complete working source, read the catalog's `shared-graphics-source.ts`, `shared-graphics-video.tsx`, and `primitives-tour-source.ts` examples in `REPO/examples/visual-explainer-mdx`. Export a source with a named `sequence` using `npm --prefix "$REPO" run ve:graphic-video -- /absolute/source.tsx --out /absolute/video.html`. Keep the generated local runtime JavaScript beside the HTML.

## Prove the consumer works

Run the consumer's existing build check and inspect the app in a browser at desktop and narrow widths. Seek zero, a transition midpoint, the completed pose, and then backward to the same times. Check focus, containment, theme changes, play/pause, and host removal for console errors. For exported artifacts, use the skill's normal verification route as well. Report incomplete checks; do not create test files unless the user approves them.
