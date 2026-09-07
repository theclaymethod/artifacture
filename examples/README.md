# Examples

These sources demonstrate chart authoring, readable diagrams, and presentations. Page and chart sources export to standalone HTML; shared data remains editable beside them. Illustrative data is labeled at its source.

![A repair story told through units, timing, and individual records](../docs/img/examples/charts.png)

```bash
npm run ve:export -- examples/visual-explainer-mdx/data-charts.mdx --out dist/charts.html
npm run ve:chart -- examples/visual-explainer-mdx/lieflat-chart.json --out dist/chart.html
```

| Source | Demonstrates |
|---|---|
| [data-charts.mdx](visual-explainer-mdx/data-charts.mdx) | A repair narrative using the five Lieflat chart families |
| [repair-story-data.ts](visual-explainer-mdx/repair-story-data.ts) | Shared illustrative records and derived chart data |
| [lieflat-chart.json](visual-explainer-mdx/lieflat-chart.json) | A standalone chart authored as JSON, without MDX |
| [diagram-canvas.mdx](visual-explainer-mdx/diagram-canvas.mdx) | A cache hit and miss, complete labels, automatic routing |
| [animated-diagram.mdx](visual-explainer-mdx/animated-diagram.mdx) | An ordered walkthrough with playback and static stepping |
| [preset-gallery.mdx](visual-explainer-mdx/preset-gallery.mdx) | Lieflat, Algebrica, and Mono Color |
| [preset-artifact.tsx](visual-explainer-mdx/preset-artifact.tsx) | One queue explanation; select a theme with `?preset=algebrica` |
| [artifacture.architecture.json](visual-explainer-mdx/artifacture.architecture.json) | Archify's typed architecture and checked delivery |
| [presentation-deck.tsx](visual-explainer-mdx/presentation-deck.tsx) | Fixed-stage presentation with supporting detail |
| [slide-deck.mdx](visual-explainer-mdx/slide-deck.mdx) | A responsive reader deck |
| [magazine-deck.mdx](visual-explainer-mdx/magazine-deck.mdx) | Horizontal reading sequence |
| [explain-diff-demo.mdx](visual-explainer-mdx/explain-diff-demo.mdx) | A cache branch explained through code and a diagram |
| [visual-plan.mdx](visual-explainer-mdx/visual-plan.mdx) | An implementation plan with decisions and risks |
| [poster-card.tsx](visual-explainer-mdx/poster-card.tsx) | A Mono Color poster that stacks on narrow screens |
| [video-longform.tsx](visual-explainer-mdx/video-longform.tsx) | Static video export from editable React source |

The chart story gives each view a question: how many devices, when repairs happened, which faults and outcomes intersected, and where individual devices went. Edit the records before changing the marks. The [chart guide](../plugins/visual-explainer/references/charts.md) explains form selection and data contracts.

Archify uses its own exporter:

```bash
npm run ve:archify -- setup
npm run ve:archify -- deliver architecture examples/visual-explainer-mdx/artifacture.architecture.json dist/architecture.html --json
```

## Browser previews

[Request diagram](../docs/img/examples/diagram.png) · [Walkthrough](../docs/img/examples/animated-diagram.png) · [Themes](../docs/img/examples/presets.png) · [Poster](../docs/img/examples/poster.png) · [Presentation](../docs/img/examples/presentation-deck.png) · [Archify](../docs/img/examples/archify.png)

The [template guide](../plugins/visual-explainer/templates/README.md) covers standalone HTML starters. [Algebrica](../docs/img/examples/algebrica.png) and [Mono Color](../docs/img/examples/mono-color.png) show the new visual directions. Use the [verification workflow](../plugins/visual-explainer/references/verification.md) before sharing.
