# What Artifacture makes

Artifacture exports editable source as standalone HTML. Readers need a browser; authors need Node 22 or newer and the repository dependencies. [Install](installation.md) or [open an example](../examples/README.md).

## Data stories

`LieflatChart` provides five forms: countable units, rung bars, dated activity, bubble matrices, and individual paths. Several figures can use the same records. The [repair example](../examples/visual-explainer-mdx/data-charts.mdx) follows 72 illustrative devices from intake to outcome.

Write a chart as JSON or place it in an MDX or TSX document:

```bash
npm run ve:chart -- examples/visual-explainer-mdx/lieflat-chart.json --out dist/chart.html
npm run ve:export -- examples/visual-explainer-mdx/data-charts.mdx --out dist/charts.html
```

Unit marks retain fractional remainders, dated marks preserve time intervals, and circle area encodes quantity. Each thread represents one record. Figures include their exact data, and missing observations stay distinct from zero. The [chart guide](../plugins/visual-explainer/references/charts.md) defines the inputs and shows complete recipes.

For a quick bar, line, or dot comparison, use `DataChart`. It supports signed values and missing measurements, starts bars at zero, and leaves line gaps where data is missing. Its line points are evenly spaced categories; use a continuous time scale for irregular dates. Supply units, a factual title, and a source when available. Values remain readable without hover.

## Diagrams

Use `DiagramCanvas` for a flow, tree, swimlane, or timeline. It measures full labels, separates branches, and routes around unrelated nodes. Direction can be automatic, horizontal, or vertical. Dense figures scroll locally, and the mobile reading view links the actual destinations. Timeline dates order milestones; they do not encode elapsed duration. Figure labels stay at least 14px at natural scale.

`DiagramWalkthrough` adds an authored sequence to the diagram. It starts paused and supports playback, manual steps, and reduced motion. [Walkthrough guide](../plugins/visual-explainer/references/animated-diagrams.md).

Use the pinned Archify runtime for architecture, workflow, sequence, data-flow, or lifecycle diagrams:

```bash
npm run ve:archify -- setup
npm run ve:archify -- guide "API request with cache fallback" --json
npm run ve:archify -- deliver architecture examples/visual-explainer-mdx/artifacture.architecture.json dist/architecture.html --json
```

Keep the JSON beside the exported HTML. The wrapper defaults to showcase quality and preserves Archify's diagnostics and atomic delivery. Set `meta.visual_preset` to `"editorial"` for paper and charcoal. Inspect screenshots after delivery; layout checks do not establish a live system's behavior. [Archify guide](../plugins/visual-explainer/references/archify.md).

The [diagram guide](../plugins/visual-explainer/references/diagram-design.md) covers 27 visual types and seven semantic patterns, including custom SVG and Mermaid. Split a crowded figure into overview and detail. Custom SVG follows the [geometry contract](../plugins/visual-explainer/references/diagrams-svg.md) and [host tokens](../plugins/visual-explainer/references/diagram-tokens.md).

## Pages, decks, and posters

Use MDX for composed documents and TSX for state or custom SVG. `CodeBlock`, `DiffBlock`, `TerminalBlock`, `JsonTree`, `DecisionMatrix`, `RiskLedger`, and `Quiz` cover code, structured data, decisions, and checks for understanding. [Component API](../plugins/visual-explainer/references/mdx-components.md).

`SlideDeck` with `Slide` creates a scrolling reader deck. Set `orientation="horizontal"` for a magazine. `PresentationDeck` with `PresentationSlide` creates a fixed stage with navigation and supporting detail. Choose the slide count and layout for the argument; there is no quota for statistics, dark slides, dividers, or tint changes. Keep comparisons readable and controls reachable on narrow screens. [Slide patterns](../plugins/visual-explainer/references/slide-patterns.md).

An explicit `--pdf` request adds a PDF captured from the rendered deck. Keep the interactive HTML alongside it. `PosterCanvas` creates a fixed composition; follow the [poster guide](../plugins/visual-explainer/references/poster.md) for export and fit checks.

## Themes

Lieflat is the default: paper gray, charcoal, Inter, and directly labeled data. Algebrica provides serif reading text and mathematical figures. Mono Color uses limited inks and asymmetric composition. These are original implementations; [source provenance](../tools/visual-sources.json) records the references and licenses.

```tsx
<ExplainerShell preset="lieflat" title="Request handling" />
<SlideDeck preset="algebrica" orientation="horizontal" title="A proof in steps" />
<PosterCanvas preset="mono-color" title="Mouse repair" />
```

For existing artifacts, `oa-design`, `mono-industrial`, `nothing`, `blueprint`, `editorial`, `paper-ink`, `terminal`, and `custom` remain available. The standalone Algebrica starter replaces the former Nothing dashboard. Other preset names can resolve through the [external design-system registry](design-systems.md).

Keep metadata that explains state, ownership, provenance, sequence, or navigation. Remove decorative numbers, badges, kickers, metric tiles, and repeated captions.

## Video

`/generate-video` creates a video; `/render-video` adapts existing material. TSX exports through `ve:export-static`, then Hyperframes renders locally with its prerequisites, including FFmpeg:

```bash
npm run ve:export-static -- examples/visual-explainer-mdx/video-longform.tsx --out dist/video/index.html
```

The [Hyperframes guide](../plugins/visual-explainer/references/hyperframes.md) and [reel patterns](../plugins/visual-explainer/references/reel-patterns.md) cover composition, draft review, and rendering. For recorded UI, [demo capture](../plugins/visual-explainer/references/demo-capture.md) covers browser frames, `frames-to-webm.sh`, and inline media export.

## Review and revise

`ExplainerShell`, `SlideDeck`, and `PosterCanvas` include optional annotation controls. Set `reviewTools={false}` to omit them. Apply feedback to the source and export again; generated HTML is replaceable output.

Check the selected artifact profile, dimensions, text, containment, and interactions. Review responsive pages at desktop and mobile widths, and fixed canvases at their intended display and export sizes. Include supported themes, diagram branches, and detail states.

```bash
npm run ve:verify -- dist/charts.html --json dist/charts.report.json --screens dist/charts-screens
npm run check:fast
```

Keep the report and screenshot evidence. Follow the [verification guide](../plugins/visual-explainer/references/verification.md), fix the source, and regenerate affected views. Ask only for choices that materially affect the result; a complete brief does not need reconfirmation.
