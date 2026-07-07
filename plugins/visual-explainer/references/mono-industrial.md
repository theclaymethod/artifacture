# Mono-Industrial — Default Aesthetic

Canonical spec for this aesthetic. The MDX preset tokens (`visual-explainer-mdx/global.css`, `data-ve-preset='mono-industrial'`) implement it; `templates/mono-industrial.html` is a frozen legacy rendering.

Swiss typography. Monochrome canvas. Hierarchy through type, weight, and spacing — never through color. This is the default aesthetic for visual-explainer. Produce this unless the user explicitly asks for a named alternative (Blueprint, Editorial, Paper/ink, Monochrome terminal, IDE-inspired).

Inspired by Nothing, Braun, Dieter Rams, Teenage Engineering. The vibe is instrument panel, not dashboard.

Reference templates:
- `./templates/mono-industrial.html` — architecture + Mermaid + data row (scrollable)
- `./templates/mono-industrial-slides.html` — slide deck (9 slides covering all 10 slide-type roles)

Read both before generating. The principles below are mandatory; the templates are the canonical expression.

---

## 1. Philosophy

- **Subtract, don't add.** Every element earns its pixel. Default to removal.
- **Structure is ornament.** The grid and the data are the decoration. No added decoration.
- **Monochrome is the canvas.** Color is an event, not a default. Status only.
- **Type does the heavy lifting.** Scale, weight, and spacing create hierarchy. Not color, not icons, not boxes.
- **Both modes are first-class.** Dark = OLED black. Light = warm off-white. Neither is derived.
- **Percussive, not fluid.** Motion is a click, not a swoosh. Near zero on load.

---

## 2. The Three-Layer Rule

Every page has exactly three layers of importance. Not two, not five.

| Layer | Role | Treatment |
|-------|------|-----------|
| **Display** | The one thing the user sees first | Space Grotesk at display size, or Geist Pixel Square if a hero number warrants it. `--text-display`. Generous negative space around it. |
| **Primary** | Supporting context, body copy, section titles | Space Grotesk at body/heading sizes. `--text-primary`. Grouped tight to the display. |
| **Tertiary** | Metadata, labels, nav, system info | Space Mono ALL CAPS. `--text-secondary` or `--text-disabled`. Pushed to edges. |

**The squint test** — before delivering, blur your eyes. If two elements compete for "most important," one needs to shrink, fade, or move. Common failure: making everything "primary." Even spacing + even size = visual flatness.

---

## 3. Font Budget (strict)

**2 families per page + optional 1 pixel-display accent.**

| Family | Role | Load always? |
|--------|------|--------------|
| Space Grotesk | Display + body + section titles | Yes |
| Space Mono | Labels, metadata, code, zoom buttons, all ALL-CAPS treatment | Yes |
| Geist Pixel Square | One element only — a hero number, a display word, a single break-the-grid moment | **Only when used.** Otherwise do not include the `@font-face` block. |

**Per-page limits:**
- 3 font sizes maximum (one display, one body, one caption)
- 2 weights maximum (Regular 400 + either Light 300 or Medium 500). **Never Bold** except in monospace where 700 is idiomatic.
- Labels are always Space Mono, ALL CAPS, generous tracking (0.08em–0.14em).

If you reach for a new font size: it's probably a spacing problem. Add distance instead.

### Loading the fonts

Space Grotesk + Space Mono load from Google Fonts. Geist Pixel ships via npm only, so it loads from jsDelivr with `@font-face` inside the `<style>` block — Google Fonts does not host it.

```html
<!-- Always-loaded (Space Grotesk + Space Mono only) -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">

<!-- Add only when the page has a hero number / display word -->
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<style>
  @font-face {
    font-family: 'Geist Pixel Square';
    src: url('https://cdn.jsdelivr.net/npm/geist@1.7.0/dist/fonts/geist-pixel/GeistPixel-Square.woff2') format('woff2');
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }
</style>
```

### Hero font variants (named alternatives)

`Geist Pixel Square` is the default for the moment-of-surprise. Four sibling variants and one legacy alternative are available — switch only when the user asks for a specific particle shape or a softer, organic feel.

| Variant | Particle | When to use | Path |
|---|---|---|---|
| **Geist Pixel Square** *(default)* | Solid square | Default hero. Most architectural, most legible at large sizes. | `…/geist-pixel/GeistPixel-Square.woff2` |
| Geist Pixel Grid | Outlined square | Slightly lighter feel; engineering / schematic vibe | `…/geist-pixel/GeistPixel-Grid.woff2` |
| Geist Pixel Circle | Solid dot | Closest to Doto; softer, friendlier | `…/geist-pixel/GeistPixel-Circle.woff2` |
| Geist Pixel Triangle | Solid triangle | Aggressive, directional, brand-y | `…/geist-pixel/GeistPixel-Triangle.woff2` |
| Geist Pixel Line | Hairline strokes | Most delicate; works as oversized words, less so as numbers | `…/geist-pixel/GeistPixel-Line.woff2` |
| Doto | Variable dot-matrix (legacy) | Use only if the user explicitly asks for Doto. Loads from Google Fonts: `family=Doto:wght@400;700`. | Google Fonts |

To switch variants: change the `@font-face` `src` URL and rename the `font-family` to match (or alias `--font-display` to whichever variant you loaded).

---

## 4. Color System

Grayscale carries hierarchy. **Status is the only color on the page** — success, warning, error — applied to the **value**, never to row backgrounds, section fills, or labels.

### Dark (default)

```css
:root {
  --bg: #000000;
  --fg: #f2ede5;
  --text-display:   rgba(242, 237, 229, 1.00);
  --text-primary:   rgba(242, 237, 229, 0.90);
  --text-secondary: rgba(242, 237, 229, 0.58);
  --text-disabled:  rgba(242, 237, 229, 0.36);
  --rule:        rgba(242, 237, 229, 0.14);
  --rule-strong: rgba(242, 237, 229, 0.28);
  --ok:   #6bd48e;
  --warn: #f0b05a;
  --err:  #ef7b7b;
}
```

### Light

```css
@media (prefers-color-scheme: light) {
  :root {
    --bg: #f6f4f0;     /* warm off-white */
    --fg: #16130f;     /* near-black */
    --text-display:   rgba(22, 19, 15, 1.00);
    --text-primary:   rgba(22, 19, 15, 0.90);
    --text-secondary: rgba(22, 19, 15, 0.56);
    --text-disabled:  rgba(22, 19, 15, 0.36);
    --rule:        rgba(22, 19, 15, 0.12);
    --rule-strong: rgba(22, 19, 15, 0.24);
    --ok:   #2f7a3e;
    --warn: #b36b00;
    --err:  #a51818;
  }
}
```

**Whether dark-first or light-first depends on content.** Executive / presentation output → dark-first. Reviewer / reading output → light-first. Just pick one at the top and invert via `prefers-color-scheme`.

**Forbidden:** gradients in chrome, gradient text, colored cards, colored borders (except status), colored row backgrounds, accent-dim washes. Nothing tinted. If you're about to add an accent color because the page feels "too quiet," the page is working. Leave it.

### Theme toggle (light / dark / auto) — required on every page

Every Mono-Industrial page ships with a three-option selector (`Light` · `Dark` · `Auto`) docked to the top-right corner. The active state uses `--fg` (monochrome) because the whole aesthetic forbids accent color in chrome.

- **Icons are inline SVG**, not Unicode glyphs (`○ ● ◐` drift across fonts). All three share `r=5` at viewBox `16×16`, rendered at `12×12`, so the outer bounds line up pixel-for-pixel.
- **Dock**: desktop fixed top-right (`top: 24px; right: 24px`); tablet/phone swap to bottom-right with 44px touch targets; narrow phone stretches full-width across the bottom.
- **Collapse at rest**: on hover-capable devices the pill collapses to the active indicator only; unfurls on `:hover` / `:focus-within`. Touch devices keep all three labels visible (no hover affordance).
- **Active tint**: `color-mix(in srgb, var(--fg) 10%, transparent)`. Never a new color. The label flips to `var(--text-display)`.
- **Persistence**: writes the choice to `localStorage` under `mono-industrial-theme`. `"system"` removes the key and falls back to `prefers-color-scheme`. A saved preference wins over the markup default.
- **Mermaid re-renders on toggle change.** Diagrams read their palette from `effectiveMode()` (which checks `data-theme` first, then the OS). On toggle click, the script clears `data-processed`, restores each block's stashed source, and calls `mermaid.run()` so nodes flip color without a page reload.
- **Live OS tracking in system mode.** The script listens to `matchMedia('(prefers-color-scheme: dark)')` and re-themes Mermaid if the OS flips while `data-theme` is unset.
- **Page-level default** (optional): `<html lang="en" data-theme="light">` or `"dark"` in the markup pins the default, but a user's saved preference still wins on return visits.

### Token gating for the toggle

The standard `prefers-color-scheme` media query must be gated with `:not([data-theme="opposite-mode"])` so the toggle can override the OS. Then add an explicit `:root[data-theme="light|dark"]` override block that beats the media query either way.

```css
/* Dark page, light inversion — the pattern used in mono-industrial-slides.html */
:root { /* dark values */ }

@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) { /* light values */ }
}

:root[data-theme="light"] { /* light values (duplicated — explicit override) */ }
```

The reverse applies if the page is light-first (`:root` = light, `@media (prefers-color-scheme: dark)` gated with `:not([data-theme="light"])`, `:root[data-theme="dark"]` explicit override).

The reference templates (`./templates/mono-industrial.html` and `./templates/mono-industrial-slides.html`) show the full wiring — CSS tokens, chrome, markup, and script.

---

## 5. Spacing as Structure

Fixed tiers, used as rhythm.

```css
--space-1: 4px;   /* tight: icon+label, number+unit */
--space-2: 8px;   /* tight: adjacent labels */
--space-3: 16px;  /* medium: sibling list items */
--space-4: 32px;  /* wide: section break */
--space-5: 64px;  /* wide-to-vast: major sections */
--space-6: 96px;  /* vast: context shift (hero → body) */
```

**If two things need a divider, the spacing is wrong.** Use a divider only when you've exhausted spacing (data rows, nav items that must be visually parallel). Most sections need only a single hairline `1px solid var(--rule)` between them.

---

## 6. Container Strategy (lightest-first)

Default to the lightest tier that works. Never box the most important element.

| Tier | When | Appearance |
|------|------|------------|
| 1. Spacing alone | Default. Use this. | No border, no fill. Proximity groups items. |
| 2. Single hairline rule | Between sibling sections | `border-top: 1px solid var(--rule);` |
| 3. Border outline | Mermaid containers, code blocks, data wrappers | `1px solid var(--rule)`, no fill |
| 4. Surface card | Almost never | Border + background — reserved for isolated interactive elements like zoom controls |

Current templates in this skill default to tier 4 (rounded cards, elevated shadows). Mono-Industrial **inverts that default to tier 1**. Cards are an escape hatch, not a layout primitive.

---

## 7. Motion

**Near zero on load.** No `fadeUp`, no staggered reveal, no `translateY` entrance, no `scale` entrance, no `opacity: 0 → 1`. The page is fully composed at paint.

**User-triggered only:**
- Hover: instant opacity or color swap, `transition: opacity 120ms ease-out` max
- Focus rings: immediate
- Mermaid zoom / pan: existing behavior preserved
- Slide transitions: **instant cut** (no fade, no slide, no scale) — scroll-snap handles the step

**Forbidden:**
- `animation: fadeUp`, `@keyframes glow`, animated shadows, pulsing effects
- `cubic-bezier` curves longer than 300ms
- Any spring / bounce easing
- Scroll-driven reveal, parallax, lazy fade-in

`prefers-reduced-motion: reduce` changes nothing for this aesthetic, because there's nothing to reduce.

---

## 8. The One Moment of Surprise

Every Mono-Industrial page breaks its own pattern in **exactly one place**. That one break IS the design. Without it: sterile grid. With more than one: visual noise.

Candidates for the surprise (pick one per page):
- A Geist Pixel display number (events/sec, version, page count)
- A vast gap where everything else is tight
- A single oversized Geist Pixel word ("END.", "01.", "NOW")
- A circular element among rectangles
- A slide that aligns against the grid rather than with it

Never make the surprise a color, an icon, or a gradient. It's always a typographic or compositional move.

---

## 9. Compositional Balance

**Asymmetry > symmetry.** Centered layouts feel generic. Favor deliberate imbalance:

- **Left-heavy, right-sparse** — oversized headline left, metadata stack right
- **Top-heavy** — big display near top, vast air below
- **Edge-anchored** — metadata pinned to corners, negative space in the middle

Balance a heavy element with empty space, not with another heavy element.

---

## 10. Per-Template Translation

When generating output in Mono-Industrial, translate the usual patterns:

| Usual pattern | Mono-Industrial replacement |
|---|---|
| Card with border + bg + shadow | Spacing-grouped item, no container |
| Color-coded section borders | Space Mono ALL CAPS label above the section |
| Role-colored nodes in Mermaid | Grayscale nodes, labels carry the role |
| Zebra striping in tables | No zebra; row-top hairline only |
| Colored badges | Space Mono ALL CAPS text with `--ok` / `--warn` / `--err` |
| KPI card with gradient number | Bare Geist Pixel or Space Mono number with ALL-CAPS label above |
| Animated KPI reveal | Static, instant |
| Emoji section headers | Numbered index in Space Mono: `<span class="index">01</span>` |

---

## 11. Mermaid Theming (Mono-Industrial)

Grayscale only. Apply color via `classDef` **only** when a node or edge semantically represents a success, warning, or error state. See `./libraries.md` → "Mono-Industrial Mermaid Theme" for the exact `themeVariables` block.

```js
const isDark = matchMedia('(prefers-color-scheme: dark)').matches;
const nodeFill   = isDark ? '#000000' : '#ffffff';
const nodeBorder = isDark ? 'rgba(242, 237, 229, 0.58)' : 'rgba(22, 19, 15, 0.56)';
const nodeText   = isDark ? 'rgba(242, 237, 229, 0.95)' : 'rgba(22, 19, 15, 0.95)';
const edgeColor  = isDark ? 'rgba(242, 237, 229, 0.40)' : 'rgba(22, 19, 15, 0.40)';

mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  look: 'classic',
  layout: 'elk',
  themeVariables: {
    fontFamily: "'Space Grotesk', system-ui, sans-serif",
    fontSize: '15px',
    primaryColor: nodeFill,
    primaryBorderColor: nodeBorder,
    primaryTextColor: nodeText,
    secondaryColor: nodeFill,
    secondaryBorderColor: nodeBorder,
    secondaryTextColor: nodeText,
    tertiaryColor: nodeFill,
    tertiaryBorderColor: nodeBorder,
    tertiaryTextColor: nodeText,
    lineColor: edgeColor,
    noteBkgColor: nodeFill,
    noteTextColor: nodeText,
    noteBorderColor: nodeBorder,
  }
});
```

**Status on specific edges only:** add `classDef warn stroke:#b36b00,stroke-width:2px` (light) / `#f0b05a` (dark) and apply via `:::warn` on the specific edge or node that represents a degraded path. Do not status-color nodes that simply participate in the flow.

Edge labels: Space Mono, ALL CAPS, 11px. Node labels: Space Grotesk, 15px (presentation decks may bump to 20px).

---

## 12. Data Tables

- No zebra. No vertical cell borders. Only a single hairline above each row.
- Header row: Space Mono, ALL CAPS, 11px, `--text-secondary`.
- Numeric columns: right-aligned, `font-variant-numeric: tabular-nums`, `--font-mono`.
- Status values: `--ok` / `--warn` / `--err` on the **value only**. Never the row, never the label.
- Long text: wrap naturally. Never truncate.

See the `data-row` pattern in `./templates/mono-industrial.html` lines ~280.

---

## 13. Empty, Error, and Loading States

Inline Space Mono, ALL CAPS, square-bracketed. No illustrations, no multi-paragraph messages, no toast popups.

- `[NO DATA]`
- `[EMPTY]`
- `[LOADING...]`
- `[ERROR: timeout]`
- `[SAVED]`

---

## 14. Microcopy Voice

Instrument-style. Terse. Space Mono, ALL CAPS. Avoid sentence-case metadata labels.

| Yes | No |
|---|---|
| `LAST UPDATED` | `Last updated` |
| `SOURCE` | `Source:` |
| `OWNER · PLATFORM` | `Owned by the platform team` |
| `V 2.4.0` | `Version 2.4.0 (stable)` |
| `P99 / 24H` | `p99 latency over the last 24 hours` |

Date format in metadata rows: `2026 · 04 · 16` (dots, spaces, no slashes).

---

## 15. Responsive Behavior

- Below 768px: collapse splits to one column, keep the hero intact, shrink secondary and tertiary faster than primary. The three-layer hierarchy must survive.
- The hero should be full-width, not shrunk into a card.
- Spacing scales with `clamp()` on padding; type sizes with `clamp()` on font-size.

---

## 16. Code Blocks — Terminal Dark with Syntax Highlighting

Code blocks are the one container in Mono-Industrial that breaks the grayscale rule, and they do it loudly: a near-black background (`#0a0a0a`) with a restrained four-color token palette, regardless of whether the page is in dark or light mode. Treat every code block as a terminal pane embedded in the page — not a surface card, not a light-mode inversion.

**Rationale.** Code is already its own language with its own visual conventions. A warm-cream code block on a light-mode page looks like a citation; a dark terminal block reads as *this is executable material*. The contrast against a light page is intentional.

**Required setup** (see `./libraries.md` → "Prism.js — Syntax Highlighting" for the full CSS):

- Load Prism core + autoloader from jsDelivr.
- Mark up as `<pre class="code-block"><code class="language-ts">…</code></pre>`.
- Apply the **Mono-Industrial Terminal Theme** token CSS from `libraries.md`. Do not use any stock Prism theme — they all introduce palettes that clash with the rest of the page.

**Token palette (from the page's existing variables, no new colors):**

| Token role | Color | Source variable |
|---|---|---|
| Keywords, function / class names | Warm off-white | `--fg` |
| Variables, identifiers | Off-white 90% | `--text-primary` |
| Operators, punctuation | Off-white 58% | `--text-secondary` |
| Strings, numbers, attribute values | Amber | `--warn` |
| Constants, tags, deletions | Red | `--err` |
| Insertions (diffs) | Green | `--ok` |
| Comments | Off-white 36%, italic | `--text-disabled` |

The entire palette uses only variables already defined for status colors. No new hues, no syntax-highlight-specific tokens — the same red/amber/green that indicates warnings and errors elsewhere is doing double duty in the code block, which keeps the page visually coherent.

**File header is optional and goes above the block**, never inside it. Use the `code-file` + `code-file__cap` pattern from `libraries.md`. Style: Space Mono ALL CAPS, 11px, `--text-secondary`, with the filename slightly brighter than the language label. The terminal rectangle stays undivided — no chrome, no three-dot buttons, no inline tabs.

**No line numbers, no line highlighting, no copy buttons** unless the user explicitly asks for them. These add visual weight without adding information.

**Diff blocks** use `language-diff` or `diff-*` prefixes. Additions get a 10%-alpha green background on the line; deletions get a 10%-alpha red. Never use solid green/red row fills — the tint is subtle, the text color carries the signal.

**Snippets stay short.** Terminal code blocks dominate visually; a 60-line dump will blow out the page hierarchy. For anything over ~20 lines, wrap in `<details>` or use the file-structure-with-descriptions pattern from `css-patterns.md` → "Implementation Plans: Don't Dump Full Files."

---

## 17. Pre-render Gate (check these before writing HTML)

Run through this list before generating. If any answer is no, stop and revise.

- [ ] Do I have exactly 3 layers of importance? (display / primary / tertiary)
- [ ] Am I using at most 2 font families + optional 1 Geist Pixel (or named alternative) accent?
- [ ] Am I using at most 3 sizes and 2 weights?
- [ ] Is every color on the page either grayscale or a status value?
- [ ] Is there zero on-load motion?
- [ ] Is there exactly one moment of surprise on the page?
- [ ] Does the squint test pass (hierarchy legible even when blurred)?
- [ ] Did I default to spacing over containers, and hairlines over boxes?
- [ ] Do my metadata labels read like instrument panel callouts (Space Mono, ALL CAPS)?
- [ ] Does the page ship the Light / Dark / Auto toggle (top-right desktop, bottom-right mobile), wired to `localStorage` and `data-theme` overrides?
- [ ] Are the color tokens gated so the toggle's `data-theme` actually beats `prefers-color-scheme`?
- [ ] Does Mermaid re-render on toggle change (theme read from `effectiveMode()`, `data-processed` cleared, sources stashed)?
- [ ] Have I verified the page in BOTH modes before delivering?

---

## 18. When NOT to Use Mono-Industrial

Mono-Industrial is the default, but some requests imply a different aesthetic:

- User says "use Blueprint" / "use Editorial" / etc. → honor the named aesthetic
- User provides a specific palette or typographic direction → follow their direction
- The output is a creative/expressive piece (poster, brand page, illustration-heavy) → use a different aesthetic

Anything else — architecture, diff review, plan review, project recap, fact check, data tables, slide decks, documentation — produces Mono-Industrial by default.

No rotation. No varying the choice. Mono-Industrial every time.
