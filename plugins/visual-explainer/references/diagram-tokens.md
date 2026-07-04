# Diagram Tokens — Aesthetic-Aware SVG Tokens

Every SVG diagram uses the same semantic token names regardless of which aesthetic is active. Only the values change. This lets the rules in `diagrams-svg.md` (shape semantics, arrow-label masking, 4px grid, focal-accent rule) stay aesthetic-independent while the visual identity adapts to whichever page the diagram lives in.

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

### Mono-Industrial (default)

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
- Dot-grid backdrop (`radial-gradient(circle, #333 1px, transparent 1px) / 16px 16px`) is the signature hero backdrop; omit it on dense diagrams where it fights with the nodes.
- Accent red (`#D71921`) is reserved — use `--warning` or `--success` drawn from content status for everything else. Hitting red means "the viewer is looking at the one urgent element on the page."
- No shadows, no blur, no gradients. Borders only.

### Editorial-Diagram (diagram-design native)

When the user explicitly asks for "editorial diagram" or "diagram-design" style, use the native palette and font stack from the upstream project.

```css
--paper:       #faf7f2;   /* warm stone; dark mode flips to #1c1917 */
--paper-2:     #f2ede4;
--ink:         #1c1917;
--muted:       #57534e;
--soft:        #78716c;
--rule:        rgba(28, 25, 23, 0.12);
--rule-solid:  rgba(120, 113, 108, 0.25);
--accent:      #b5523a;   /* rust / coral; dark mode flips to #d6724a */
--accent-tint: rgba(181, 82, 58, 0.08);
--link:        #2563eb;

--font-display: "Instrument Serif", serif;
--font-body:    "Geist", system-ui, sans-serif;
--font-mono:    "Geist Mono", ui-monospace, monospace;
```

Notes:
- This is the only aesthetic where italic Instrument Serif callouts are appropriate.
- JetBrains Mono is explicitly forbidden here.

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
- Add a faint grid background at 40px spacing using a second `<pattern>` with 1px lines at 12% opacity. This replaces the dot pattern from the default.

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

/* OR dark-first: Blueprint, Terminal, Dracula */
:root { /* dark-first values */ }
@media (prefers-color-scheme: light) { :root { /* light values */ } }
```

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

1. **Pick the diagram type** using the Type Selection Gate in `diagrams-svg.md`.
2. **Determine the host aesthetic.** If standalone: follow the aesthetic workflow in SKILL.md §1 Think. If embedded: inherit tokens from the host.
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
- Complexity budgets from `diagrams-svg.md`
- Shape semantics for flowcharts (oval/rect/diamond/dot)
- No emoji, no gradient text on titles, no animated shadows
- `box-shadow` forbidden; use 1px hairlines
