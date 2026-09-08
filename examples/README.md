# Examples

Start with the source closest to your question. Page sources export to standalone HTML; chart JSON has its own exporter. Keep shared data beside the source and replace illustrative data before making factual claims.

![A repair story told through units, timing, and individual records](../docs/img/examples/charts.png)

```bash
npm run ve:export -- examples/visual-explainer-mdx/data-charts.mdx --out dist/charts.html
npm run ve:chart -- examples/visual-explainer-mdx/lieflat-chart.json --out dist/chart.html
```

## Data and systems

| Source | What to learn |
|---|---|
| [data-charts.mdx](visual-explainer-mdx/data-charts.mdx) | Five views of one illustrative repair dataset |
| [repair-story-data.ts](visual-explainer-mdx/repair-story-data.ts) | Derive chart values from shared records |
| [lieflat-chart.json](visual-explainer-mdx/lieflat-chart.json) | Export a chart without MDX |
| [diagram-canvas.mdx](visual-explainer-mdx/diagram-canvas.mdx) | Explain a cache hit and miss with automatic routing |
| [animated-diagram.mdx](visual-explainer-mdx/animated-diagram.mdx) | Author an ordered walkthrough with playback and static stepping |
| [artifacture.architecture.json](visual-explainer-mdx/artifacture.architecture.json) | Author and validate an Archify architecture |
| [explain-diff-demo.mdx](visual-explainer-mdx/explain-diff-demo.mdx) | Connect a code change to its effect on the request path |
| [visual-plan.mdx](visual-explainer-mdx/visual-plan.mdx) | Present implementation decisions and risks |

The repair story follows counts, timing, faults, and outcomes. Edit its records before changing its marks. The [chart guide](../plugins/visual-explainer/references/charts.md) explains each encoding and data contract.

Archify uses its own exporter:

```bash
npm run ve:archify -- setup
npm run ve:archify -- deliver architecture examples/visual-explainer-mdx/artifacture.architecture.json dist/architecture.html --json
```

## Themes and formats

| Source | What to learn |
|---|---|
| [preset-gallery.mdx](visual-explainer-mdx/preset-gallery.mdx) | Compare Lieflat, Algebrica, and Mono Color |
| [preset-artifact.tsx](visual-explainer-mdx/preset-artifact.tsx) | Theme one queue explanation with `?preset=algebrica` |
| [presentation-deck.tsx](visual-explainer-mdx/presentation-deck.tsx) | Use a fixed stage with supporting detail |
| [slide-deck.mdx](visual-explainer-mdx/slide-deck.mdx) | Build a responsive reader deck |
| [magazine-deck.mdx](visual-explainer-mdx/magazine-deck.mdx) | Arrange a horizontal reading sequence |
| [poster-card.tsx](visual-explainer-mdx/poster-card.tsx) | Stack a Mono Color poster on narrow screens |
| [video-longform.tsx](visual-explainer-mdx/video-longform.tsx) | Export a static video composition from React |

[Request diagram](../docs/img/examples/diagram.png) · [Walkthrough](../docs/img/examples/animated-diagram.png) · [Themes](../docs/img/examples/presets.png) · [Poster](../docs/img/examples/poster.png) · [Presentation](../docs/img/examples/presentation-deck.png) · [Archify](../docs/img/examples/archify.png) · [Algebrica](../docs/img/examples/algebrica.png) · [Mono Color](../docs/img/examples/mono-color.png)

For standalone HTML, use the [template guide](../plugins/visual-explainer/templates/README.md). Complete [verification](../plugins/visual-explainer/references/verification.md) before sharing.
