# Shared themes

A theme belongs to the visual objects and travels with them through posters, diagrams, slides, and videos. `visual-explainer-mdx/themes.css` owns the preset palettes, typography, semantic paint, and line weights. `global.css` imports it for browser documents. The graphic-video exporter includes it directly, without Tailwind, before the motion stylesheet. The latter contains aliases and figure styles; it has no separate palette.

New `ExplainerShell`, `PosterCanvas`, `SlideDeck`, `PresentationDeck`, and `createSlideScene` outputs default to `hairline`. This selects the host palette and typography; authors still choose and construct the explanatory geometry. Use the explicit `3b1b` preset for mathematical mechanisms and derivations. Lieflat's chart encodings work within either host. Kept presets and new external design systems keep their tokens. Unknown external slugs use the Hairline fallback and warning. Retired palette slugs fail with a migration error before external lookup.

## Choose a preset and appearance

The public theme value is `{ preset, appearance }`. The primary explainer choices are `hairline` and `3b1b`. The retained alternatives are `mono-color` and `algebrica`; `mono-industrial` remains optional, with `custom` and new external brand slugs for extensions. Hairline replaces the `lieflat` palette while preserving its chart encodings. `oa-design`, `nothing`, `blueprint`, `editorial`, `paper-ink`, and `terminal` are retired. Appearance is `light` or `dark`; Hairline defines both palettes. The `3b1b` preset has an authored black surface. Selecting a dark appearance alone does not construct a mathematical scene.

Place `data-ve-preset="hairline"` and `data-ve-appearance="dark"` on the same theme owner. Descendants inherit the resulting roles. `data-motion-theme="dark"` remains compatible for existing motion specimens. `data-ve-tone` retains its slide surface contract: `dark` selects the preset base surface, `light` selects the inverse surface, and `accent` selects its emphasis surface. Tone is independent of appearance.

```tsx
const slide = createSlideScene({
	id: 'mechanism',
	title: 'The point determines the projection',
	explanation: 'The same angle drives the point and the trace.',
	graphic: mechanism,
	preset: '3b1b',
	appearance: 'dark',
});
```

Hairline light uses white paper and neutral gray illustration lines. Readable text ink is separate from those fine lines. Both primary modes use cyan `#079fba` for the active causal object or trace. Keep small text in neutral ink; accent-filled controls use dark ink. `--ve-font-display` and `--ve-font-body` own headings and prose. `--ve-font-math` supplies STIX Two Math for notation and subscripts, while the existing monospace role remains for code. The mathematical preset keeps EB Garamond for headings. Inspect loaded fonts and exported glyphs rather than checking only the declared family.

## Keep color meaning and geometry together

Graphics consume `--ve-diagram-bg`, `--ve-diagram-ink`, `--ve-diagram-muted`, `--ve-diagram-frame`, `--ve-node-bg`, `--ve-node-stroke`, `--ve-diagram-accent-fill`, and `--ve-accent`. Motion shares their surface, guides, and accent, with separate illustration ink. Its aliases resolve at each preset, appearance, tone, and motion-stage scope. Recomputing there prevents a nested preset or inline brand override from inheriting an ancestor's already-resolved aliases.

The generic line roles are `--ve-graphic-stroke`, `--ve-graphic-detail-stroke`, and `--ve-graphic-active-stroke`. Hairline uses 0.85, 0.6, and 1.15 logical units. Hairline geometry uses `--ve-illustration-ink` and `--ve-illustration-muted`, separate from readable diagram labels. Its `--ve-illustration-stroke`, `--ve-illustration-detail-stroke`, and `--ve-illustration-active-stroke` values are 1.2, 0.65, and 1.2 in the 400 × 320 logical frame. The active state changes color, without adding a thick outline.

Chart marks, guides, and selected traces consume `--ve-chart-stroke`, `--ve-chart-detail-stroke`, and `--ve-chart-active-stroke`: 0.85, 0.55, and 1.3 for Hairline. Filled quantitative marks keep their area and counts. The mathematical preset uses 2, 0.8, and 2.6 for graphics and illustrations, and 1.5, 0.75, and 2.2 for charts. These are logical widths that scale with geometry. The strict vendor bench uses non-scaling strokes, so compare the painted output at its intended size rather than equating raw widths.

The motion stylesheet aliases these values as `--motion-ink`, `--motion-secondary`, and the corresponding stroke roles. Prose in `.motion-stage` uses `--ve-text`; `.motion-math` uses `--ve-font-math`. A theme change affects paint and typography, without changing routed connectors or authored scene data. A wider glyph can affect fit, so inspect the actual export at reading size.

A preset may intentionally give posters an inverse surface; existing named presets preserve that choice. Across formats, preserve the object denoted by the accent. One active locus may include several related edges or marks. Keep unrelated objects neutral and do not invent status colors or decorative metadata. [DESIGN.md](../DESIGN.md) defines the geometry, data, and motion requirements that accompany these tokens.

## Overrides and strict Hairline figures

Use an explicit preset for a requested design system. Local CSS or inline `--ve-*` overrides keep their normal cascade precedence. The same overrides apply to diagram objects and motion aliases; avoid introducing separate `--motion-*` palette overrides for new work.

The vendored interactive Hairline bench is a separate, fixed runtime. Its kernel, palette, and controls remain unchanged. Strict upstream figures keep that palette in an isolated accessible iframe.

An explainer wrapper may use the unchanged engine's public geometry functions and map its `.sil`, `.lo`, `.hi`, and `.dot` classes to host roles. The cyan active stroke is the user's explicit adaptation of the upstream monochrome highlight. Keep that override in the wrapper stylesheet; do not patch vendor files. This route retains rounded solids, honest occlusion, and one highlighted place. It does not claim strict upstream palette validation. See [the authoring routes](../plugins/visual-explainer/references/default-explainer-theme.md).
