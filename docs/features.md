# Features

Artifacture creates charts, diagrams, presentations, and visual explanations from editable source. The [README](../README.md) covers installation; the [example guide](../examples/README.md) links working sources.

## Source and export

Use MDX for composed pages and TSX for state, custom SVG, or video compositions. Generated HTML is disposable output: revise the source and export again. Authoring requires Node 22 or newer and the repository dependencies; readers open the exported HTML in a browser.

```bash
npm run ve:export -- examples/visual-explainer-mdx/data-charts.mdx --out dist/charts.html
npm run ve:export -- examples/visual-explainer-mdx/interactive.tsx --out dist/interactive.html
npm run ve:export-static -- examples/visual-explainer-mdx/video-longform.tsx --out dist/video/index.html
```

Shared components live in [`visual-explainer-mdx/components.tsx`](../visual-explainer-mdx/components.tsx). `ExplainerShell`, `SlideDeck`, and `PosterCanvas` include optional annotation controls; set `reviewTools={false}` when those controls are unnecessary. Apply feedback to the source before re-exporting.

Archify diagrams use typed JSON and their own validated delivery route.

## Visual language

`lieflat` is the default: paper gray, charcoal, Inter, open spacing, and directly labeled data. Algebrica and Mono Color provide named alternatives. Artifacture implements its own themes and components; see [provenance](../tools/visual-sources.json) for the visual references and their licenses.

```tsx
<ExplainerShell preset="lieflat" title="Request handling" />
<SlideDeck preset="algebrica" orientation="horizontal" title="A proof in steps" />
<PosterCanvas preset="mono-color" title="An editorial composition" />
```

| Preset | Use | Reference |
|---|---|---|
| `lieflat` | Charts, comparisons, and technical explanations | [Charts](../plugins/visual-explainer/references/charts.md) |
| `algebrica` | Definitions, proofs, and long-form explanations | [Algebrica](../plugins/visual-explainer/references/algebrica.md) |
| `mono-color` | Posters, covers, and editorial presentations | [Mono Color](../plugins/visual-explainer/references/mono-color.md) |
| `oa-design` | Explicit compatibility with the earlier default | [OA Design](../plugins/visual-explainer/references/oa-design.md) |
| `mono-industrial` | Explicit technical report styling | [Mono-Industrial](../plugins/visual-explainer/references/mono-industrial.md) |

The `nothing`, `blueprint`, `editorial`, `paper-ink`, `terminal`, and `custom` presets remain available. The standalone Algebrica template replaces the retired Nothing dashboard. Unknown preset names can resolve through the [external design-system registry](design-systems.md).

Presets change typography and palette, not factual standards. Remove decorative numbering, badges, kickers, metric tiles, and redundant captions. Keep metadata that explains state, ownership, provenance, sequence, or navigation.

## Charts and diagrams

| Content | Tool |
|---|---|
| Bar, line, or dot comparison | `DataChart` |
| Compact flow, tree, swimlane, or milestone sequence | `DiagramCanvas` |
| Complex architecture, workflow, sequence, dataflow, or lifecycle | Archify |
| Specialized visual grammar | Custom SVG or Mermaid through the diagram routing reference |

`DataChart` displays exact values, supports signed quantities, and distinguishes zero from missing data. Bars start at zero; line charts leave gaps for missing measurements. Labels stay visible without tooltips. Supply units, a useful title, and actual provenance when available. Line points are evenly spaced categories; use a continuous time scale for irregular intervals. See [charts.md](../plugins/visual-explainer/references/charts.md).

`DiagramCanvas` measures full node and edge labels, separates branches, and routes around unrelated nodes. It supports `flow`, `tree`, `swimlane`, and `timeline`, with `direction="auto"`, `"horizontal"`, or `"vertical"`. Large figures scroll locally; the mobile reading view links actual destinations. Dates order milestones rather than encode elapsed duration. Figure text stays at least 14px at natural scale.

For other diagrams, the [routing reference](../plugins/visual-explainer/references/diagram-design.md) selects among 27 visual types and seven semantic patterns. Complexity limits depend on the selected type and meaning; split crowded figures into overview and detail. Shapes and labels convey semantics. Add legends only for encodings that need explanation. Custom SVG uses [the geometry contract](../plugins/visual-explainer/references/diagrams-svg.md) and inherits [host tokens](../plugins/visual-explainer/references/diagram-tokens.md).

## Archify

Install the pinned runtime once, then keep editable JSON beside the delivered HTML:

```bash
npm run ve:archify -- setup
npm run ve:archify -- guide "API request with cache fallback" --json
npm run ve:archify -- deliver architecture examples/visual-explainer-mdx/artifacture.architecture.json dist/architecture.html --json
```

The wrapper defaults to showcase quality and preserves upstream diagnostics and atomic delivery. Set `meta.visual_preset` to `"editorial"` for Artifacture's restrained treatment; authored alternative presets remain available. Rendering checks establish layout constraints, not live operational behavior. Complete screenshot review after delivery. See [archify.md](../plugins/visual-explainer/references/archify.md).

## Code and structured content

`CodeBlock`, `DiffBlock`, `TerminalBlock`, `JsonTree`, `DecisionMatrix`, `RiskLedger`, and `Quiz` cover source excerpts, comparisons, structured data, and checks for understanding. Keep snippets focused on observable behavior. Read the [component API](../plugins/visual-explainer/references/mdx-components.md) for props and the [example guide](../examples/README.md) for usage.

## Presentations and magazines

Use `SlideDeck` and `Slide` for a reader deck. `orientation="horizontal"` provides a magazine sequence. Use `PresentationDeck` and `PresentationSlide` for a fixed stage with navigation and supporting detail.

The argument determines slide count and layout. No statistic, dark-page quota, decorative divider, or tint rotation is required. Preserve readable comparisons and reachable controls on narrow screens. See [slide patterns](../plugins/visual-explainer/references/slide-patterns.md).

An explicit `--pdf` request adds a PDF to the HTML deck. The [PDF exporter](../plugins/visual-explainer/scripts/export-slides-pdf.mjs) captures each slide as rendered, preserving diagrams and layout. Keep the interactive HTML available alongside it.

## Posters and video

`PosterCanvas` supports fixed compositions; follow [poster.md](../plugins/visual-explainer/references/poster.md) for export and canvas-fit review.

`/generate-video` authors a new video; `/render-video` adapts existing material. Editable TSX exports through `ve:export-static`, then Hyperframes renders locally. Video requires its renderer prerequisites, including FFmpeg. Long-form and reel conventions, draft review, and final rendering are defined in [hyperframes.md](../plugins/visual-explainer/references/hyperframes.md) and [reel-patterns.md](../plugins/visual-explainer/references/reel-patterns.md).

For a recorded UI demonstration, [demo capture](../plugins/visual-explainer/references/demo-capture.md) covers browser frames, `frames-to-webm.sh`, and inline media export. Media must explain the subject or supply evidence.

## Verify and revise

Use the selected artifact profile to check dimensions, containment, text, and interaction. Responsive pages need desktop and mobile review; fixed canvases need their intended display and export states. Inspect supported themes, diagram branches, labels, and every material detail state.

```bash
npm run ve:verify -- dist/charts.html --json dist/charts.report.json --screens dist/charts-screens
npm run check:fast
```

A successful export is not visual verification. Follow [verification.md](../plugins/visual-explainer/references/verification.md), retain the report and review evidence, and fix the source before regenerating affected views. Resolve only material missing choices through the host's available question tool; a complete brief does not need reconfirmation.
