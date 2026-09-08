# Artifacture

Charts, diagrams, and presentations from editable source.

Give a coding agent the records, repository, or argument you want to explain. Artifacture supplies components, visual defaults, exporters, and browser checks. Keep the source; open or share the exported HTML.

![A repair story told through countable units, dates, intersections, and individual paths](docs/img/examples/charts.png)

<a id="start"></a>

## Start with the question

```bash
npx skills add theclaymethod/artifacture
```

Then ask for what the reader needs to understand:

```text
Explain this repository's request path.
Show which devices were repaired, which faults they had, and which remain unresolved.
Turn this migration plan into a presentation with supporting detail on demand.
Use Algebrica to explain projection.
```

For local development, install Node 22 or newer, then:

```bash
npm install
npm run ve:export -- examples/visual-explainer-mdx/data-charts.mdx --out dist/charts.html
```

<a id="choose-the-right-tool"></a>

## Choose what to show

| Question or format | Tool | Source |
|---|---|---|
| Counts, dated activity, intersections, individual paths | `LieflatChart` | JSON / MDX / TSX |
| A few values to compare | `DataChart` | MDX / TSX |
| Compact flow, tree, swimlane, timeline | `DiagramCanvas` | MDX / TSX |
| An ordered request or message sequence | `DiagramWalkthrough` | MDX / TSX |
| Complex architecture, workflow, sequence, data flow, lifecycle | Archify | Typed JSON |
| Reader deck or horizontal magazine | `SlideDeck` | MDX / TSX |
| Fixed-stage presentation with drill-down details | `PresentationDeck` | TSX |
| Code, diffs, tables, interactive explanations | Shared components | MDX / TSX |

Diagrams size nodes from their labels and route around unrelated nodes. Flow layouts adapt to the available width without shrinking text; explicit directions stay fixed. Dense figures scroll locally, and supported layouts provide mobile alternatives.

`DiagramWalkthrough` follows authored steps along the graph's actual routes. It starts paused, stops at the end, and supports manual stepping on mobile and with reduced motion. Its original controller was informed by [PR Lens's ordered data-flow diagrams](https://github.com/coldteadotai/pr-lens). [Walkthrough API](plugins/visual-explainer/references/animated-diagrams.md).

<a id="author-charts"></a>

## Author a chart

The default `LieflatChart` offers five forms: `rung-bars`, `unit-field`, `barcode`, `bubble-matrix`, and `threads`. Units preserve counts, date positions preserve intervals, circle areas encode quantities, and paths preserve individual records. Use `DataChart` when a few bars or dots answer the question.

Edit [lieflat-chart.json](examples/visual-explainer-mdx/lieflat-chart.json) and export it:

```bash
npm run ve:chart -- examples/visual-explainer-mdx/lieflat-chart.json --out dist/chart.html
```

The JSON envelope is `{title, description?, source?, spec}`. Use the same fields as props inside a page:

```jsx
<LieflatChart
  title="Follow each device from fault to outcome"
  source={{ label: 'Illustrative data' }}
  spec={{
    kind: 'threads',
    unitLabel: 'device',
    stages: ['Fault', 'Action', 'Outcome'],
    records: [
      { id: 'A', path: ['Cable', 'Replace', 'Returned to use'] },
      { id: 'B', path: ['Battery', 'Replace', 'Returned to use'] },
      { id: 'C', path: ['Battery', 'Inspect', 'Awaiting part'] },
    ],
  }}
/>
```

Never invent records to fill a pattern. The [chart guide](plugins/visual-explainer/references/charts.md) covers each data contract. The [repair story](examples/visual-explainer-mdx/data-charts.mdx) derives all five views from one explicitly illustrative dataset.

<a id="archify"></a>

## Map a system with Archify

Artifacture integrates a pinned [Archify](https://github.com/tt-a1i/archify) release. Setup downloads the runtime once; rendering does not update it.

```bash
npm run ve:archify -- setup
npm run ve:archify -- guide "API request with cache fallback" --json
npm run ve:archify -- validate architecture examples/visual-explainer-mdx/artifacture.architecture.json --json
npm run ve:archify -- deliver architecture examples/visual-explainer-mdx/artifacture.architecture.json dist/architecture.html --json
```

The wrapper defaults to showcase quality and preserves Archify's diagnostics and atomic delivery. Set `meta.visual_preset` to `editorial` for paper and charcoal; other Archify styles remain available. Keep the JSON beside the HTML. `npm run ve:archify -- path` locates the installed schemas and examples.

<a id="visual-language"></a>

## Visual defaults

Lieflat uses paper gray, charcoal, Inter, and open spacing. Choose another theme when the content or brief calls for it:

| Theme | Suits | Treatment |
|---|---|---|
| `lieflat` | Data stories and technical explanations | Direct labels, countable marks, open layouts |
| `algebrica` | Definitions, proofs, long explanations | Warm stone, serif reading text, mathematical geometry |
| `mono-color` | Posters, covers, presentations | Neutral paper, one or two inks, asymmetric composition |

Set `preset` on `ExplainerShell`, `SlideDeck`, `PresentationDeck`, or `PosterCanvas`. Older named presets remain available. Algebrica replaces the former standalone Nothing template.

Artifacture's original themes and components draw on [Lieflat Charts](https://github.com/larashero3-dotcom/lieflat-charts), [Algebrica](https://github.com/antoniolupetti/algebrica), and [Mono Color](https://github.com/yanliudesign/mono-color-skill). They do not bundle the references' images or noncommercial source code. [Provenance and licenses](tools/visual-sources.json).

Typography follows [Pierrick Calvez's guidance](https://www.pierrickcalvez.com/journal/a-five-minute-guide-to-better-typography) on hierarchy, text measure, and spacing. See the [authoring rules](plugins/visual-explainer/references/typography.md) and [Algebrica](docs/img/examples/algebrica.png), [Mono Color](docs/img/examples/mono-color.png), and [diagram](docs/img/examples/diagram.png) previews.

## Verify and revise

```bash
npm run ve:verify -- dist/charts.html --json dist/charts.report.json --screens dist/charts-screens
npm run check:fast
npm run ve:eval
npm run ve:eval-presentation
```

Browser checks catch mechanical failures; visual review checks the brief, composition, reading order, and labels. Both required stages must pass before an artifact is verified. Edit the source and re-export after feedback.

<a id="examples"></a>

Find editable sources and export commands in [Examples](examples/README.md), standalone starters in [Templates](plugins/visual-explainer/templates/README.md), and the full review process in [Verification](plugins/visual-explainer/references/verification.md).

[Visual comparison](docs/visual-review.md) · [Presentation guide](docs/presentation-deck.md) · [Contributing](CONTRIBUTING.md)

## License

MIT. Artifacture began as a fork of [nicobailon/visual-explainer](https://github.com/nicobailon/visual-explainer). External runtimes retain their own licenses and notices.
