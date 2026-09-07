# Diagram tokens

Inherit the host page's preset. The default is `lieflat`; use a named alternative only when requested. Runtime values live in `REPO/visual-explainer-mdx/global.css`. Do not embed a second palette or force a diagram into a different aesthetic.

| Diagram role | Host role |
|---|---|
| `--paper` | Page or bounded figure background |
| `--paper-2` | Secondary surface or meaningful zone |
| `--ink` | Main readable text and marks |
| `--muted` | Secondary text with sufficient contrast |
| `--rule`, `--rule-solid` | Structural rules and connectors |
| `--accent`, `--accent-tint` | Optional focal relationship |
| `--link` | Interactive links |
| `--font-body` | Names, labels, notes, and axes |
| `--font-mono` | Literal code, identifiers, ports, or aligned values |

Use CSS variables in SVG fills and strokes. A standalone figure defines its host tokens once; embedded figures inherit them. Verify the rendered contrast in each supported theme, including hover and expanded views.

## Preset character

| Preset | Treatment |
|---|---|
| `lieflat` | Paper gray, charcoal, Inter, sparse semantic color; see [charts.md](charts.md) |
| `mono-color` | One or two inks on neutral paper; see [mono-color.md](mono-color.md) |
| `algebrica` | Warm stone/blush, charcoal, serif titles, Inter reading text; see [algebrica.md](algebrica.md) |
| `oa-design` | Ink-derived neutrals and restrained blue; explicit compatibility, see [oa-design.md](oa-design.md) |
| `mono-industrial` | Monochrome, Space Grotesk, status on factual values; see [mono-industrial.md](mono-industrial.md) |
| `nothing` | Black/off-white, restrained status color, optional Doto display; see [nothing.md](nothing.md) |
| `blueprint` | Slate and cyan with flat backgrounds and precise rules |
| `editorial`, `paper-ink` | Warm paper and serif headings; labels stay clear sans |
| `terminal` | Dark field and mono where explicitly requested |

Preserve user-requested external presets through the design-system registry rather than approximating their palettes. Semantic colors need text, shape, or line-style companions. Do not color every node merely to distinguish it.

## Invariants

- Keep figure labels at least 14px at initial rendered scale and body text at least 16px.
- Measure labels before sizing nodes; route from actual bounds.
- Use a hidden alignment grid, flat backgrounds, and independently traceable edges.
- Place masked edge labels in open canvas and keep markers clear of text.
- Add a legend only for encodings that need explanation; every entry must appear in the figure.
- Keep shape semantics, source fidelity, and the budgets in [diagram-design.md](diagram-design.md).
- Avoid uppercase framing, corner marks, decorative textures, gradients, glow, and shadows inside diagrams.

Preset choice never overrides these constraints. See [diagrams-svg.md](diagrams-svg.md) for custom geometry and [verification.md](verification.md) for delivery.
