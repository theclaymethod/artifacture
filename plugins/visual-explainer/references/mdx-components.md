# MDX and TSX component API

Read this only when the selected card does not show the component or prop you need. Import runtime components from `REPO/visual-explainer-mdx/components.tsx`.

## Long-form artifacts

- `ExplainerShell(title, summary?, preset?, reviewTools?, chapterNav?, appearance?)`
- `Section(title, kicker?, id?, navLabel?, anchors?)`
- `ChapterRail(chapters, label?)`
- `DataTable(columns, rows, caption?, label?)`
- `StatusPill(tone, children)`
- `Badge(tone?, stroke?, glyph?, children)`
- `Legend(items, title?)`
- `Callout(children)`
- `Pipeline(steps)`
- `DecisionMatrix(rows)`
- `RiskLedger(risks)`
- `DefinitionList(children)` with `Definition(term, tone?, children)`
- `Subsection(title, id?, level?, marker?, share?, children)`
- `Disclosure(summary, meta?, id?, open?, share?, lazy?, contains?, children)`
- `Term(definition, expansion?, children)`
- `Steps(label?, children)` with `Step(id?, children)`
- `ChipLinks(items, label)`
- `Lead(children, label?)`
- `Aside(children, label?)`
- `DiagramCanvas(nodes, edges, layout?, direction?, lanes?, dates?, title?, description?, legend?)`
- `DiagramModes(simple, detailed, layout?, direction?, title?, description?)`; `direction="wrap"` sets a long flow in rows that fit the column
- `DiagramWalkthrough(nodes, edges, steps, layout?, direction?, lanes?, dates?, title?, description?)`
- `LieflatChart(spec, title, description?, source?)`
- `DataChart(data, kind?, title, description?, valueLabel?, formatValue?, source?)`
- `CodeBlock(code, language, filename?, highlightLines?, annotations?, diff?)`
- `DiffBlock(patch? | before+after, language?, filename?, mode?)`
- `TerminalBlock(content, title?, showPrompt?)`
- `JsonTree(data, collapsedDepth?)`
- `Quiz(questions)`
- `MermaidBlock(chart, caption?)`

`chapterNav` builds a chapter rail from the direct `Section` children: a sticky side rail at 1200px and wider, and a compact sticky top bar with a disclosure list below that. It marks the current chapter with `aria-current` while the reader scrolls. Links are fragment anchors, so they work from the keyboard and without script; smooth scrolling runs only without a reduced-motion preference. Give a `Section` an `id` for stable links, a short `navLabel`, and `anchors={[{id, label}]}` for the in-section targets the rail lists. With a rail, the review tool docks under it. `appearance="auto"` follows `prefers-color-scheme`; the default stays light.

`DataTable` is the scan-first table: a sticky header, subtle zebra rows, and no wrapper overflow. Column `kind` sets the treatment: `id` (monospace, unwrapped), `number` (right-aligned, tabular figures), `status` (a `StatusPill`), `tags` (badges only), or `text` (wraps). A cell is a string, a number, `null`, or `{text, href?, status?, badges?, note?}`. Give a row an `id` to make it a link target. Below 640px each row becomes a labelled card.

`StatusPill`, `Badge`, `Legend` and diagram node `tone` share one state ramp: `ok`, `info`, `warn`, `err` and `neutral`, from the `--ve-status-*` tokens, each AA in light and dark. Pair every tone with a word; color is never the only cue. A `stroke="dashed"` badge, node or key swatch is dashed and hatched: use it for a weaker evidence tier. `glyph` (`rect`, `oval`, `diamond`) carries a third category, such as a verifier kind. A `DiagramCanvas` `legend` repeats the exact tone, stroke and glyph that its nodes use.

A `Section` body has a default reading rhythm: 1rem between blocks, unclassed `h3` and `h4` headings, and list markers. `Subsection` groups content under a rule; its `title` can hold code and pills, a `marker` (such as a step number) goes before the title, `level={4}` nests it, and an `id` makes it a rail anchor. `DefinitionList` sets term and detail pairs in two columns that stack below 640px; a `Definition` `tone` colors one pair, so keep a word such as "Warning" in the term. Use these before page CSS.

`Disclosure` keeps detail (code, evidence, long lists) behind a 44px summary row; `meta` holds a count or a pill at the end of the row. A fragment link to a `Disclosure`, or to an element inside it, opens it and each enclosing block, and scrolls the target under its headline. Opening a block that has an `id` writes its fragment to the address, and the page keeps the open blocks for the session. `share` adds a copy-link control to a `Disclosure` or a `Subsection`. `lazy` renders the body only after the first open; list in `contains` each id inside it that a link can target. `Term` marks a glossary word in running text: hover, focus or tap shows its `definition`, and `expansion` spells out an abbreviation at its first use. Give `StatusPill` and a `ChipLinks` item a `meaning`, so each state word has a tooltip and screen-reader text. `Steps` numbers run steps that hold rich content, in two columns from 1024px. `Legend layout="list"` sets one swatch, word and sentence per line. `DataTable density="compact"` makes each row a short card below 640px. Diagrams shrink to fit their column, to three quarters of their size at most, and render only the variant that the screen shows. Edges with one label that merge into one node, or fan out from one node, carry the label once. `DiagramModes` shows one architecture diagram in two modes. `simple` holds about four to six boxes in plain words; `detailed` names the same boxes by their real modules and may add a few. Each simple node id is also a detailed node id, so a node keeps its place when the reader switches. The Simple / Detailed control switches every `DiagramModes` on the page, and the page remembers the choice. `ChipLinks` shows in-page links as 44px chips, each with an optional `status` word and `tone`. A plain text link in a `Section` body also gets a 44px target. `Lead` opens a level with its answer in plain words: one or two sentences, one step larger than body text, after the run-in label "In plain words". `Aside` holds a two-sentence note, by default "Why this matters". Explainer pages take their spacing, measure and type sizes from the `--ve-space-*`, `--ve-measure` and `--ve-text-*` tokens of themes.css; a page never sets its own CSS.

`CodeBlock` and `DiffBlock` highlight with Shiki at export. Token colors come from the preset's `--ve-syntax-*` ramp on the code surface. Diff rows use `--ve-code-add` and `--ve-code-remove` with a `+`/`-` gutter. Escape `<` and `>` in code strings as `\u003c` and `\u003e`; the preflight decodes them before highlighting, and Shiki escapes the output. The preflight also runs on each `.mdx` module that the entry imports from its own directory tree, so a long explainer can keep one self-contained chapter per file.

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
- `PunctumReadout(text, weight?, roundness?, size?, accent?)` uses the optional bundled variable font for short display text. Await `awaitPunctumFont(text)` before capture. Copy with `artifacture add punctum-readout`; retain its OFL notice.
- `createDotMatrixScene`, `createCharacterRoll`, and `createColumnScan` prepare glyph cells and finite motion for the same canvas, composition, slide, or video. Scan sound comes from `synthesizeScanWav(scan.events, {duration: scan.motion.duration})`; use the audio currentTime to drive preview visuals. Read [punctum.md](../../../docs/punctum.md) for the copy entries, bounds, font boundary, and examples.
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

Primary explainer presets are `iso` (default isometric illustrations) and `3b1b` (mathematical mechanisms on black). Lieflat charts use either host's tokens. Retained alternatives are `mono-color` and `algebrica`, with `mono-industrial` optional and `custom` for local tokens. The former `lieflat` palette and `oa-design`, `nothing`, `blueprint`, `editorial`, `paper-ink`, and `terminal` fail with migration guidance. New external brand names resolve through the external design-system registry. Read `docs/design-systems.md` from `REPO` when learning or using an external design system.

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

## Original source figures

- `DiagramDesignFigure(example, height?, title?, seconds?)`: all 204 original Diagram Design HTML documents; native controls or optional shared time.
- `PrLensFigure(example, height?, seconds?)`: original renderer SVG and SMIL pulses.
- `ChalkboardFigure(example, height?, seconds?)`: original nine documents; shared time only where the original has `paint(t)`. Its separately licensed font is not included.
- `NativeLivingForm(form, seconds?, settings?)`: original Strata, Arbor and Resonance TSL renderer and source scene.
- `NativeProceduralProp(kind, seconds?, label?, reveal?)`: original clay trophy geometry/scene and 720 ms reveal.
- `SourceFigure(asset, seconds?, height?, onFrame?)`: unchanged HTML preview or thin native-clock wrapper. `seekSourceFrame` awaits capture acknowledgement.

Import original Hairline figures from `hairline-figures`; they retain their native pointer/spring interaction. See [source-fidelity.md](source-fidelity.md) for vendor boundaries, licensing, explicit time and MP4/still export.
