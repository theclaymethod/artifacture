# Shared themes

A theme belongs to the visual objects and travels with them through posters, diagrams, slides, and videos. `visual-explainer-mdx/themes.css` owns the preset palettes, typography, semantic paint, and line weights. `global.css` imports it for browser documents. The graphic-video exporter includes it directly, without Tailwind, before the motion stylesheet. The latter contains aliases and figure styles; it has no separate palette.

New `ExplainerShell`, `PosterCanvas`, `SlideDeck`, `PresentationDeck`, and `createSlideScene` outputs default to `hairline`. Explicit existing presets and external design systems keep their tokens. Unknown external slugs retain the established Lieflat fallback and warning.

## Choose a preset and appearance

The public theme value is `{ preset, appearance }`. Built-in presets include `hairline`, `lieflat`, `mono-color`, `algebrica`, `oa-design`, `mono-industrial`, `nothing`, `blueprint`, `editorial`, `paper-ink`, `terminal`, and `custom`. External brand slugs use the existing design-system registry. Appearance is `light` or `dark`; Hairline defines both palettes. Other presets retain their authored appearance.

Place `data-ve-preset="hairline"` and `data-ve-appearance="dark"` on the same theme owner. Descendants inherit the resulting roles. `data-motion-theme="dark"` remains compatible for existing motion specimens. `data-ve-tone` retains its slide surface contract: `dark` selects the preset base surface, `light` selects the inverse surface, and `accent` selects its emphasis surface. Tone is independent of appearance.

```tsx
const slide = createSlideScene({
  id: 'mechanism',
  title: 'Follow the same objects',
  explanation: 'One scene supplies the diagram and the video.',
  graphic: diagram,
  preset: 'hairline',
  appearance: 'dark',
});
```

Hairline light uses paper `#f5f3ed`, ink `#252a2c`, secondary ink `#60696d`, and blue `#286b8b`. Dark uses `#171d21`, `#e9e9e1`, `#b7c0c1`, and `#83c9e3`. Headings use EB Garamond and body text uses Montserrat; the existing monospace role remains for code. Font fallback remains readable when web fonts cannot load.

## Keep color meaning and geometry together

Graphics consume `--ve-diagram-bg`, `--ve-diagram-ink`, `--ve-diagram-muted`, `--ve-diagram-frame`, `--ve-node-bg`, `--ve-node-stroke`, `--ve-diagram-accent-fill`, and `--ve-accent`. The motion aliases resolve these same values at each preset, appearance, tone, and motion-stage scope. Recomputing there prevents a nested preset or inline brand override from inheriting an ancestor's already-resolved aliases.

The generic line roles are `--ve-graphic-stroke`, `--ve-graphic-detail-stroke`, and `--ve-graphic-active-stroke`. Larger fine-line illustrations use the corresponding `--ve-illustration-*` roles. Theme changes affect paint and typography, without moving routed connectors or changing the authored scene. A wider glyph can affect text fit, so inspect the actual export at reading size.

A preset may intentionally give posters an inverse surface; existing named presets preserve that choice. Across formats, preserve which object a color denotes and which stroke signals emphasis. Do not invent status colors or decorative metadata to make the collection look systematic.

## Overrides and strict Hairline figures

Use an explicit preset for a requested design system. Local CSS or inline `--ve-*` overrides keep their normal cascade precedence. The same overrides apply to diagram objects and motion aliases; avoid introducing separate `--motion-*` palette overrides for new work.

The vendored interactive Hairline bench is a separate, fixed runtime. Its kernel, palette, and controls remain unchanged. Embed strict upstream figures in an isolated accessible iframe; do not restyle their internals with these host tokens.
