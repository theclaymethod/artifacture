# Diagram Tokens — Aesthetic-Aware SVG Tokens

Every SVG diagram uses the same semantic token names regardless of which aesthetic is active. Only the values change. This lets the rules in `diagrams-svg.md` (shape semantics, arrow-label masking, 4px grid, focal-accent rule) stay aesthetic-independent while the visual identity adapts to whichever page the diagram lives in.

## Contents

- [The ten tokens](#the-ten-tokens)
- [Per-aesthetic mappings](#per-aesthetic-mappings)
- [Light / dark inversion](#light--dark-inversion)
- [Host-page detection](#host-page-detection)
- [Integration with the skill workflow](#integration-with-skillmd-workflow)
- [Aesthetic-independent rules](#whats-aesthetic-independent)

---

## The Ten Tokens

| Role | Purpose | Example uses |
|---|---|---|
| `--paper` | Primary background | SVG `<rect>` fill behind everything |
| `--paper-2` | Secondary background (inset panels, alt rows) | Subgraph fills, alternate layer stack rows |
| `--ink` | Primary foreground | Node names, titles, main stroke color |
| `--muted` | Secondary foreground | Descriptions, sublabels, non-focal arrows |
| `--soft` | Tertiary foreground | Legend items, tick labels |
| `--rule` | Low-contrast line | Legend dividers, very subtle borders |
| `--rule-solid` | Slightly stronger line | Node borders, lane dividers, grid ticks |
| `--accent` | Focal color (used on ≤ 2 elements) | Happy path, focal node, primary success response |
| `--accent-tint` | Accent at low alpha | Accent-focal fill backgrounds |
| `--link` | Cross-reference color | Links, URLs, "see elsewhere" pointers |

Font tokens:

| Role | Purpose |
|---|---|
| `--font-display` | Titles and italic callouts (typically serif) |
| `--font-body` | Node names, descriptions (typically sans) |
| `--font-mono` | Technical content, arrow labels, eyebrow kickers |

---

## Per-Aesthetic Mappings

### OA Design (default)

OA diagrams use a clean inset canvas with one ink-derived neutral system. The hidden 4px coordinate grid still governs geometry, but no dot, graph-paper, scanline, or ruled background is rendered.

```css
--paper:       #f6f6f6;
--paper-2:     #ffffff;
--ink:         #292929;
--muted:       #6d6d6d;
--soft:        rgba(41, 41, 41, 0.52);
--rule:        rgba(41, 41, 41, 0.08);
--rule-solid:  rgba(41, 41, 41, 0.12);
--accent:      #305dde;
--accent-tint: rgba(48, 93, 222, 0.07);
--link:        #305dde;

--font-display: "Inter Tight", system-ui, sans-serif;
--font-body:    "Inter Tight", system-ui, sans-serif;
--font-mono:    "Geist Mono", ui-monospace, monospace;
```

Notes:
- All label and heading weights stop at 500.
- Surface corners use the shared squircle radius; action chips are pills.
- Spend blue on the focal path only. Semantic colors are text or small-dot roles and always include labels.

### Mono-Industrial

Diagrams inside an MI page inherit MI's grayscale-plus-status-colors rule. The "accent" in an MI diagram is a status color drawn from the content itself — `--ok` for healthy paths, `--warn` for degraded, `--err` for failure. Neutral accent fallback is `--ink` at 100% opacity on an otherwise softened diagram.

```css
--paper:       #f6f4f0;   /* light mode; dark mode flips to #000000 */
--paper-2:     #efe9df;
--ink:         #16130f;
--muted:       #57534e;
--soft:        #78716c;
--rule:        rgba(22, 19, 15, 0.08);
--rule-solid:  rgba(22, 19, 15, 0.18);
--accent:      var(--ok, #2f7d3b);     /* or --warn, --err, depending on content */
--accent-tint: rgba(47, 125, 59, 0.08);
--link:        #1a5fb4;

--font-display: "Space Grotesk", system-ui, sans-serif;
--font-body:    "Space Grotesk", system-ui, sans-serif;
--font-mono:    "Space Mono", ui-monospace, monospace;
```

Notes:
- MI does **not** allow a serif display face inside diagrams. Titles and callouts use Space Grotesk weight 600 instead of Instrument Serif italic.
- Status colors replace the coral accent — follow the MI rule that color only ever lands on values that actually have status.
- No emoji, no gradient text, no animated shadows.

### SubQ / Subquadratic

Diagrams inside a SubQ page inherit SubQ's pixel-block accent system. The accent rotates through SubQ's four fixed colors based on content semantics; the focal rule still caps accent use at 2 elements per diagram.

```css
--paper:       #000000;   /* dark-first; light mode flips to #f7f0e4 */
--paper-2:     #111111;
--ink:         #f5ead6;
--muted:       rgba(245, 234, 214, 0.65);
--soft:        rgba(245, 234, 214, 0.40);
--rule:        rgba(245, 234, 214, 0.12);
--rule-solid:  rgba(245, 234, 214, 0.25);
--accent:      #f6d242;   /* yellow; or subq-blue #3a66ff, subq-orange #ff7a2a, subq-green #7ee787 */
--accent-tint: rgba(246, 210, 66, 0.10);
--link:        #60a5fa;

--font-display: "Roboto Serif", serif;
--font-body:    "Manrope", system-ui, sans-serif;
--font-mono:    "Roboto Mono", ui-monospace, monospace;
```

Notes:
- SubQ's "accent" lands on the focal node AND optionally its matching legend cell — pixel blocks in the legend share the accent color. Still ≤ 2 focal elements in the diagram body.
- Cross-mark corner anchors (SubQ motif) can optionally appear at SVG corners at 8px from each edge.

### Nothing

Diagrams inside a Nothing page carry the instrument-panel look: OLED-black canvas, status-color accents, and the segmented progress bar as the dominant data-viz motif. Doto is available for exactly one hero glyph per diagram (a focal number on a dashboard/layer stack). The accent (`#D71921` Nothing red) is reserved for a single critical node — otherwise default to `--warning` / `--success` drawn from content.

```css
--paper:       #000000;   /* dark-first; light mode flips to #F5F5F5 */
--paper-2:     #111111;
--ink:         #E8E8E8;
--muted:       #999999;
--soft:        #666666;
--rule:        #222222;
--rule-solid:  #333333;
--accent:      var(--warning, #D4A843);   /* default focal; escalate to #D71921 only for critical */
--accent-tint: rgba(212, 168, 67, 0.10);
--link:        #5B9BF6;

--font-display: "Doto", "Space Mono", monospace;   /* load only when a hero glyph appears */
--font-body:    "Space Grotesk", system-ui, sans-serif;
--font-mono:    "Space Mono", ui-monospace, monospace;
```

Notes:
- Every text node label in a Nothing diagram is **Space Mono ALL CAPS** with `letter-spacing: 0.08em`. Body-copy callouts use Space Grotesk.
- **No zebra fills** on layer stacks or swimlanes. Use hairline dividers only.
- **Segmented progress bars substitute for bar charts** wherever applicable (2px gaps, square ends, status-color fills).
- Keep diagram canvases flat black; do not add dot-grid or scanline backdrops.
- Accent red (`#D71921`) is reserved — use `--warning` or `--success` drawn from content status for everything else. Hitting red means "the viewer is looking at the one urgent element on the page."
- No shadows, no blur, no gradients. Borders only.

### Editorial-Diagram (diagram-design native)

When the user explicitly asks for "editorial diagram" or "diagram-design" style, use the palette pinned from upstream revision `a5e3978`. Use the host page's deliberate font stack unless the user also requests the upstream typography.

```css
--paper:       #f5f5f5;   /* dark mode: #2d3142 */
--paper-2:     #ececec;   /* dark mode: #393e53 */
--ink:         #2d3142;   /* dark mode: #f5f5f5 */
--muted:       #4f5d75;   /* dark mode: #bfc0c0 */
--soft:        #7a8399;   /* dark mode: #8e98ac */
--rule:        rgba(45, 49, 66, 0.12);   /* dark: rgba(245, 245, 245, 0.12) */
--rule-solid:  #bfc0c0;   /* dark: rgba(191, 192, 192, 0.25) */
--accent:      #eb6c36;   /* dark mode: #f08a59 */
--accent-tint: rgba(235, 108, 54, 0.08); /* dark: rgba(240, 138, 89, 0.10) */
--link:        #2e5aa8;   /* dark mode: #6a95d8 */

--series-1:    #7c8f6f;   /* dark: #9caf8f */
--series-2:    #5e7a9b;   /* dark: #82a0c0 */
--series-3:    #b8915a;   /* dark: #d3ad7a */
--series-4:    #9c6b50;   /* dark: #b88670 */
--series-5:    #6e6479;   /* dark: #8d8298 */

--font-display: "Instrument Serif", serif;
--font-body:    "Geist", system-ui, sans-serif;
--font-mono:    "Geist Mono", ui-monospace, monospace;
```

Notes:
- Series colors are data encodings, not decorative accents; use direct labels and non-color distinctions.
- Instrument Serif callouts are appropriate only when the user requests the full upstream editorial treatment.
- JetBrains Mono is not part of the pinned upstream stack.

### Blueprint

Technical-drawing feel. Deep slate canvas with cyan accent. Monospace-heavy.

```css
--paper:       #0f1b2e;
--paper-2:     #13233a;
--ink:         #e8eef6;
--muted:       rgba(232, 238, 246, 0.72);
--soft:        rgba(232, 238, 246, 0.50);
--rule:        rgba(102, 179, 255, 0.15);
--rule-solid:  rgba(102, 179, 255, 0.28);
--accent:      #5fd0ff;   /* cyan */
--accent-tint: rgba(95, 208, 255, 0.10);
--link:        #85c7ff;

--font-display: "DM Sans", system-ui, sans-serif;
--font-body:    "DM Sans", system-ui, sans-serif;
--font-mono:    "Fira Code", ui-monospace, monospace;
```

Notes:
- Keep the blue canvas flat. Use precise rules and node geometry for the technical-drawing character, never a rendered grid field.

### Paper/ink

Warm cream, terracotta accent, informal feel.

```css
--paper:       #faf7f5;
--paper-2:     #f0e9df;
--ink:         #2d2119;
--muted:       #6b584b;
--soft:        #8b7868;
--rule:        rgba(45, 33, 25, 0.10);
--rule-solid:  rgba(45, 33, 25, 0.22);
--accent:      #c2410c;   /* terracotta */
--accent-tint: rgba(194, 65, 12, 0.08);
--link:        #1e40af;

--font-display: "Instrument Serif", serif;
--font-body:    "IBM Plex Sans", system-ui, sans-serif;
--font-mono:    "IBM Plex Mono", ui-monospace, monospace;
```

### Monochrome Terminal

Green or amber on near-black, monospace everything.

```css
--paper:       #0a0a0a;
--paper-2:     #141414;
--ink:         #4ade80;   /* green; swap for #fbbf24 amber variant */
--muted:       rgba(74, 222, 128, 0.70);
--soft:        rgba(74, 222, 128, 0.45);
--rule:        rgba(74, 222, 128, 0.15);
--rule-solid:  rgba(74, 222, 128, 0.28);
--accent:      #fbbf24;   /* complementary amber */
--accent-tint: rgba(251, 191, 36, 0.10);
--link:        #60a5fa;

--font-display: "IBM Plex Mono", ui-monospace, monospace;
--font-body:    "IBM Plex Mono", ui-monospace, monospace;
--font-mono:    "IBM Plex Mono", ui-monospace, monospace;
```

Notes:
- Terminal is the only aesthetic where mono is allowed as body. The "mono for technical only" rule relaxes here because the entire page is terminal.

### IDE-inspired (Dracula / Nord / Catppuccin / Solarized / Gruvbox / One Dark / Rosé Pine)

Map the named palette directly. Pick one and commit. Don't approximate.

Example — Dracula:

```css
--paper:       #282a36;
--paper-2:     #1e1f29;
--ink:         #f8f8f2;
--muted:       #bd93f9;   /* purple */
--soft:        #6272a4;   /* comment */
--rule:        rgba(248, 248, 242, 0.12);
--rule-solid:  rgba(248, 248, 242, 0.22);
--accent:      #ff79c6;   /* pink */
--accent-tint: rgba(255, 121, 198, 0.10);
--link:        #8be9fd;   /* cyan */

--font-display: "JetBrains Mono", ui-monospace, monospace;
--font-body:    "JetBrains Mono", ui-monospace, monospace;
--font-mono:    "JetBrains Mono", ui-monospace, monospace;
```

---

## Light / Dark Inversion

Every aesthetic defines both modes. Inversions use the standard `prefers-color-scheme` media query:

```css
:root { /* light-first: MI, paper/ink, Editorial-Diagram */ }
@media (prefers-color-scheme: dark) { :root { /* dark values */ } }

/* OR dark-first: SubQ, Blueprint, Terminal, Dracula */
:root { /* dark-first values */ }
@media (prefers-color-scheme: light) { :root { /* light values */ } }
```

For SubQ specifically, the pixel-block accents (`#f6d242`, `#3a66ff`, `#ff7a2a`, `#7ee787`) do **not** invert. They stay constant across modes. Everything else inverts.

---

## Host-Page Detection

When the diagram is embedded in a larger page (not rendered stand-alone), it should inherit the host page's tokens rather than define its own.

**Recommended pattern:**

```html
<!-- Host page defines tokens on :root -->
<style>
  :root {
    --paper: #f6f4f0;
    --ink: #16130f;
    /* ... */
  }
</style>

<!-- Diagram SVG references them via fill="var(--paper)" etc. -->
<svg viewBox="0 0 1000 660">
  <rect width="100%" height="100%" fill="var(--paper)" />
  <!-- ... -->
</svg>
```

When the diagram is a standalone page, it defines its own `:root` tokens based on the chosen aesthetic.

---

## Integration With SKILL.md Workflow

1. **Pick the semantic pattern and visual type** using `diagram-design.md`.
2. **Determine the host aesthetic.** If standalone, follow the aesthetic route in `SKILL.md`. If embedded, inherit tokens from the host.
3. **Apply the per-aesthetic mapping from this file.**
4. **Author SVG with semantic token names** (`var(--ink)`, `var(--accent)`, etc.) — never hard-coded hex.
5. **Run the Removal Test** from `diagrams-svg.md`.
6. **Emit.**

---

## What's Aesthetic-Independent

These rules apply to every aesthetic and cannot be overridden:

- The 4px grid (every coordinate divisible by 4)
- Arrows drawn before nodes (z-order)
- Arrow labels on paper-colored masking rects
- Legend as horizontal strip at bottom
- ≤ 2 focal uses of the accent color per diagram
- Complexity budgets from `diagram-design.md`
- Shape semantics for flowcharts (oval/rect/diamond/dot)
- No emoji, no gradient text on titles, no animated shadows
- `box-shadow` forbidden; use 1px hairlines
