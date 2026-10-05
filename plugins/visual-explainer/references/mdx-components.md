# MDX and TSX component API

Read this only when the selected card does not show the component or prop you need. Import runtime components from `REPO/visual-explainer-mdx/components.tsx`.

## Long-form artifacts

- `ExplainerShell(title, summary?, preset?, reviewTools?)`
- `Section(title, kicker?)`
- `Callout(children)`
- `Pipeline(steps)`
- `DecisionMatrix(rows)`
- `RiskLedger(risks)`
- `DiagramCanvas(nodes, edges, layout?, direction?, lanes?, dates?, title?, description?)`
- `DiagramWalkthrough(nodes, edges, steps, layout?, direction?, lanes?, dates?, title?, description?)`
- `LieflatChart(spec, title, description?, source?)`
- `DataChart(data, kind?, title, description?, valueLabel?, formatValue?, source?)`
- `CodeBlock(code, language, filename?, highlightLines?, annotations?, diff?)`
- `DiffBlock(patch? | before+after, language?, filename?, mode?)`
- `TerminalBlock(content, title?, showPrompt?)`
- `JsonTree(data, collapsedDepth?)`
- `Quiz(questions)`
- `MermaidBlock(chart, caption?)`

`DiagramCanvas` supports `flow`, `tree`, `swimlane`, and `timeline` layouts. Set `direction="auto" | "horizontal" | "vertical"` to control flow. Timeline dates order milestones; their spacing does not encode elapsed duration. Nodes support `rect`, `oval`, `diamond`, and `dot` shapes; edges support `solid`, `dashed`, and `bidirectional` styles.

For flow layouts, `auto` measures the container and uses a horizontal arrangement when it fits; otherwise it chooses the orientation with less horizontal overflow. Labels keep their full size. Explicit directions stay fixed, and server-rendered output uses the deterministic graph layout until the browser measures the container.

`DiagramWalkthrough` adds ordered `steps={[{edgeId, caption, durationMs?}]}` to the same graph. Give each referenced edge a unique `id`. Playback starts paused and stops at the end; reduced-motion and mobile list views use manual stepping. See [animated-diagrams.md](animated-diagrams.md).

`LieflatChart` is the default for editorial chart stories. Its `spec.kind` selects `rung-bars`, `unit-field`, `barcode`, `bubble-matrix`, or `threads`; the data contract follows that choice. See [charts.md](charts.md) for selection, complete contracts, and recipes. The same `{title, description?, source?, spec}` envelope exports directly from JSON with `ve:chart`; MDX is optional.

`DataChart` serves quick comparisons. It accepts `{label: string, value: number | null}[]`, `kind="bar" | "line" | "dot"`, and optional `source={{label, url?}}`. Use `formatValue={(value) => ...}` for displayed units or numeric formatting. Line points are evenly spaced categories; use `LieflatChart`'s `barcode` for actual date intervals.

Below 640px of container width, bar and dot charts put each label and value above a full-width track. Line charts keep the full trajectory visible and list exact values below it. Signed scales, zero marks, and missing-data gaps remain intact; chart text stays readable without horizontal scrolling.

Optional `kicker`, `eyebrow`, `stat`, and label props are compatibility APIs, not recommended framing. Use them only for necessary, evidenced information.

## Slides and canvases

- `SlideDeck(title, orientation?, preset?, reviewTools?)`
- `Slide(title, kicker?, tone?)`
- `PosterCanvas(eyebrow?, title, stat?, footer?, preset?, reviewTools?)`
- `GraphicCanvas(scene)` draws immutable primitives from `createDiagramScene` or `createGraphicScene`.
- `composeGraphics` places complete scene blocks, scopes their identities and motion, and returns one scene/motion pair for the same canvas, poster, slide, or video. Declare destination frames and clipping; avoid concatenating scene objects. Read `docs/graphics-and-video.md` from `REPO` for the composition contract.
- `GraphicSlide(slide)` places a shared graphic in a fixed frame created by `createSlideScene`.
- `GraphicVideo(sequence, authoredSeconds?)` samples finite motion from `sequenceSlides`; use `ve:graphic-video` for a seekable browser export.
- `NativeClip(asset, baseUrl, placement?)` embeds a native Manim or Psychopomp clip. A finite `placement` declares HyperFrames timing; otherwise it provides a normal review player.
- `NativeStill(asset, baseUrl, at?)` reuses the poster or an exact selected encoded frame in a document, poster, or slide. Read `docs/native-engines.md` for source scaffolding, optional engine setup, and the shared asset contract.

Read [graphics-and-video.md](../../../docs/graphics-and-video.md) for shared scene authoring, supported motion, and export limits.

Use the slide card for ordinary decks. For a bespoke fixed 1920×1080 presentation with navigation, drill-downs, or reusable stage chrome, read `deck-navigation-shell.md` before using:

- `PresentationDeck`, `PresentationSlide`
- `DrillCard`, `DrillChip`, `DrillSheet`, `CloseX`
- `LayerExplorer`, `LadderDiagram`, `FanoutDiagram`
- `PullQuote`, `Metric`, `StatRow`, `HairlineList`, `Stepper`, `CodePanel`
- `MonoLabel`, `DisplayText`, `IconChip`, `ShineOverlay`
- `IconBase`, `IconFile`, `IconTool`, `IconAction`, `IconLoop`, `IconGauge`, `IconTag`, `IconFit`, `IconFilter`, `IconCorpus`, `IconArrowDown`, `IconArrowRight`

## Presets

Primary explainer presets are `hairline` (default isometric illustrations) and `3b1b` (mathematical mechanisms on black). Lieflat charts use either host's tokens. Retained alternatives are `mono-color` and `algebrica`, with `mono-industrial` optional and `custom` for local tokens. The former `lieflat` palette and `oa-design`, `nothing`, `blueprint`, `editorial`, `paper-ink`, and `terminal` fail with migration guidance. New external brand names resolve through the external design-system registry. Read `docs/design-systems.md` from `REPO` when learning or using an external design system.

- `DagCanvas`: compact dependency graph with parent/child or full-lineage focus, keyboard navigation, and shared themed scene geometry. Copy with `artifacture add dag`; see `docs/dag.md` in the runtime.

- `AsciiImage`: media-to-glyph frame; explicit redraw seconds, palette, contrast and cell size.
- `AsciiSweep`: two media inputs, controlled progress 0–1, seeded glyph band, four directions.
- `AsciiObject`: prepared geometry or uncompressed glTF/GLB; explicit seconds, glyph/shaded output, shared palette.
- `VhsEffect`: media texture with authored-time grain, row drift, scanlines and RGB separation.
- `ModelView`: one factory, GLB or decoded image as shaded geometry, measured six-region ASCII, luminance ASCII or circular points; explicit seconds and awaitable capture controller.
- `OrbitalText`: controlled SVG phrase rings, alternating rotation and one accented ring.
- `TracePath`: normalized SVG path reveal from progress, with exact zero/full endpoints.

Copy selected model/vector blocks with `artifacture add shape-ascii particle-object living-forms procedural-props orbital-text trace-path`. Use `modelAsset` to bridge a reviewed img2threejs factory. Read `docs/model-visuals.md` and copied `MODEL-AUTHORING.md` for readiness, ownership, supported geometry and source closure.

Copy these with `artifacture add ascii-image ascii-sweep ascii-object vhs`. See `docs/media-effects.md` for the source contracts, video decoding ownership, CORS/WebGL constraints, and Blender authoring/export instructions. Keep teaching text after the effect.
