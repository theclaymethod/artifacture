# Nothing — Instrument-Panel Aesthetic

A named alternative aesthetic for visual-explainer. Use when the user asks for "nothing", "nothing design", "Nothing OS", an "instrument-panel" feel, or a dot-matrix / Ndot look. **Not the default** — the default remains Mono-Industrial. Select Nothing only when explicitly requested.

Source: [dominikmartn/nothing-design-skill](https://github.com/dominikmartn/nothing-design-skill) (SHA `74affbb`). The tokens, motifs, and constraints below are lifted directly from that repo.

Reference templates:
- `./templates/nothing.html` — scrollable reference
- `./templates/nothing-magazine.html` — horizontal scroll-snap magazine variant

Read the spec before generating. The principles are mandatory; the templates are the canonical expression.

---

## 1. Philosophy

- **Instrument panel, not dashboard.** The page feels like a piece of measuring equipment — small type, ALL-CAPS labels, flat chrome, data over ornament.
- **OLED-black default.** Pure `#000` is the canvas. Light mode exists but it's a secondary mode, not a first-class expression.
- **Every label is in Space Mono ALL CAPS.** Nav, buttons, table headers, input labels, section kickers, unit suffixes — all of them.
- **Accent red (`#D71921`) is rare.** At most once per page. Only for urgent / destructive / error. Never decorative.
- **Status colors on values only.** Never on labels, never on row backgrounds.
- **Break the grid once per page.** Exactly one. The single break **is** the design.
- **Percussive, not fluid.** Motion is short, ease-out, opacity-only. No spring, no bounce, no slide.

---

## 2. Font System (strict)

**Three families. Every page loads these three, nothing else.**

| Family | Role | Weights | Source |
|---|---|---|---|
| **Doto** | Display / hero moment-of-surprise | 400, 700 (variable `ROND` axis available) | Google Fonts |
| **Space Grotesk** | Body, headings, UI prose | 300, 400, 500, 700 | Google Fonts |
| **Space Mono** | Every label, metadata, nav item, table header, unit suffix | 400, 700 | Google Fonts |

Doto is a dot-matrix face (closest to NDot 57). It replaces the Geist Pixel family used in Mono-Industrial — **do not load Geist Pixel on a Nothing page.** One family handles the hero moment, period.

### Loading

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Doto:wght@400;700&family=Space+Grotesk:wght@300;400;500;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
```

### Per-page limits

- **3 font sizes total.** One hero (Doto), one body (Space Grotesk), one caption (Space Mono).
- **Doto is never body.** Minimum 36px. One element per page. This is your moment of surprise.
- **Space Mono labels are ALL CAPS** with letter-spacing `0.06em` to `0.10em`. 11–12px.
- **Space Grotesk is everything else** — headings, paragraphs, card copy. Regular (400) and Medium (500) handle the full hierarchy; Bold (700) is reserved for emphasis inside paragraphs, never as a headline weight.

---

## 3. Color Tokens

The token names match across modes. Values flip.

### Dark (default / `:root`)

```css
:root {
  --black:           #000000;   /* page background */
  --surface:         #111111;   /* cards, raised chrome */
  --surface-raised:  #1A1A1A;   /* dropdowns, modals, elevated panels */
  --border:          #222222;   /* default hairline */
  --border-visible:  #333333;   /* emphasized borders, dot-grid dots */

  --text-disabled:   #666666;
  --text-secondary:  #999999;
  --text-primary:    #E8E8E8;
  --text-display:    #FFFFFF;

  --accent:          #D71921;                      /* Nothing red — rare, urgent only */
  --accent-subtle:   rgba(215, 25, 33, 0.15);

  --success:         #4A9E5C;
  --warning:         #D4A843;
  --interactive:     #5B9BF6;

  --space-xs: 4px; --space-sm: 8px; --space-md: 16px;
  --space-lg: 24px; --space-xl: 32px; --space-2xl: 48px;
  --space-3xl: 64px; --space-4xl: 96px;
}
```

### Light (override)

```css
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
    --black:           #F5F5F5;   /* warm off-white, not pure white */
    --surface:         #FFFFFF;
    --surface-raised:  #F0F0F0;
    --border:          #E8E8E8;
    --border-visible:  #CCCCCC;

    --text-disabled:   #999999;
    --text-secondary:  #666666;
    --text-primary:    #1A1A1A;
    --text-display:    #000000;

    --interactive:     #007AFF;
    /* --accent, --success, --warning are identical across modes */
  }
}
```

**Accent red does not change between modes.** `#D71921` is a brand constant — keep it untouched in both palettes.

---

## 4. Signature Motifs (this is what makes it Nothing)

A page is only recognizably Nothing when at least **three** of these six motifs appear. Use the list as a checklist before you ship.

### 4.1 Dot-matrix hero in Doto

Exactly one per page. 48px minimum, 96–144px ideal. Tight negative letter-spacing (`-0.02em`). Pure white on black (or pure black on cream). Never for body. Never multiple.

```css
.hero-doto {
  font-family: 'Doto', 'Space Mono', monospace;
  font-size: clamp(72px, 12vw, 144px);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-display);
  line-height: 1;
}
```

### 4.2 Space Mono ALL-CAPS instrument labels

Every label. No exceptions.

```css
.label {
  font-family: 'Space Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
}
```

Use these for: `LAST UPDATED`, `STATUS`, `REGION`, `P99`, section eyebrows, nav items, button text. The page should read like the top of a synth panel.

### 4.3 Segmented progress bars

Discrete rectangular blocks with 2px gaps. Square ends — no `border-radius`. Filled with the relevant status color. The signature Nothing data-viz motif.

```html
<div class="progress">
  <span class="seg seg--on"></span>
  <span class="seg seg--on"></span>
  <span class="seg seg--on"></span>
  <span class="seg seg--off"></span>
  <span class="seg seg--off"></span>
</div>
```

```css
.progress { display: flex; gap: 2px; }
.seg { flex: 1; height: 12px; background: var(--border); }
.seg--on { background: var(--success); }        /* or --warning, --accent */
.seg--off { background: var(--border); }
```

### 4.4 Dot-grid backgrounds

Radial-gradient pattern, 12–16px grid, very low opacity. Used on hero sections and empty states to imply the underlying coordinate system.

```css
.dot-grid {
  background-image: radial-gradient(circle, var(--border-visible) 1px, transparent 1px);
  background-size: 16px 16px;
}
.dot-grid-subtle {
  background-image: radial-gradient(circle, var(--border) 0.5px, transparent 0.5px);
  background-size: 12px 12px;
}
```

### 4.5 Bracket-notation UI states

System messages, loading states, empty states, close buttons — all wrapped in brackets. No toasts. No skeletons. No spinners.

Examples: `[LOADING…]`, `[SAVED]`, `[ERROR: TIMEOUT]`, `[ X ]`, `[ — ]`, `[NO DATA]`.

Set in Space Mono, same size as the content it replaces. The brackets are part of the word, not decoration around it.

### 4.6 The one grid break

Every page gets exactly one element that breaks the grid. An oversized date, a stat that crosses the column gutter, a block of Doto that ignores the column rhythm, a card that bleeds to the edge. This is the "moment of surprise" — without it, the page looks like a spreadsheet. With more than one, the instrument-panel feel collapses.

---

## 5. Components

### Buttons

All buttons share a shape: Space Mono, 13px, ALL CAPS, `letter-spacing: 0.06em`, `padding: 12px 24px`, min-height 44px (touch).

| Variant | Look |
|---|---|
| **Primary** | White bg, black text, pill `border-radius: 999px`. Use once per screen. |
| **Secondary** | Transparent bg, `1px solid var(--border-visible)` border, primary text color. Pill or technical (`border-radius: 4px`) — pick one and stick with it. |
| **Ghost** | Text only, underline on hover. For tertiary actions. |

No filled icons. No emoji. Chevron glyphs, yes. A small inline dot indicator, yes.

### Cards

Flat. Border only. No shadows, no blur, no gradients.

```css
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;        /* 12–16px; never > 16 */
  padding: 24px;
}
```

Elevated variant uses `var(--surface-raised)` + `border: 1px solid var(--border-visible)`. That's it. No shadow step.

### Stat rows

Label left, value right — canonical Nothing treatment.

```html
<div class="stat-row">
  <span class="label">P99 LATENCY</span>
  <span class="value">
    <span class="num">248</span>
    <span class="unit">MS</span>
  </span>
</div>
```

```css
.stat-row { display: flex; justify-content: space-between; align-items: baseline; padding: 12px 0; border-bottom: 1px solid var(--border); }
.num  { font-family: 'Space Grotesk'; font-size: 28px; font-weight: 500; color: var(--text-display); font-variant-numeric: tabular-nums; }
.unit { font-family: 'Space Mono'; font-size: 11px; letter-spacing: 0.08em; color: var(--text-secondary); margin-left: 6px; }
```

### Nav

Bracket-style with the active item marked by a dot or underline:

```
[ HOME ] · GALLERY · INFO
```

Or for a tab bar, Space Mono items separated by `·` with the active item at `--text-display` and the rest at `--text-secondary`.

### Tables

No zebra stripes. Row separation via `1px solid var(--border)`. Column headers in Space Mono caps. Numeric columns right-aligned with `font-variant-numeric: tabular-nums`.

### Code blocks

OLED-black (`#0a0a0a`) with Space Mono content. Prism.js syntax highlighting uses the same restrained palette as Mono-Industrial — strings/numbers in `--warning`, deletions/tags in `--accent`, additions in `--success`, everything else at three levels of foreground opacity.

---

## 6. Motion

**Short, opacity-first, ease-out.**

- Duration: **150–250ms** for micro-interactions (hover, focus, toggle). **300–400ms** for view transitions.
- Easing: `cubic-bezier(0.25, 0.1, 0.25, 1)` — subtle ease-out. No spring, no bounce, no elastic.
- Prefer `opacity` transitions over `transform: translate`. Elements **fade in**, they do not slide.
- Hover feedback: border brightens (`--border` → `--border-visible`) or text color steps up (`--text-primary` → `--text-display`). Never `transform: scale()`, never `box-shadow`.
- On-load motion: near zero. A single fade-up over 300ms on the hero, maybe. Nothing else.

```css
.transitionable {
  transition: color 180ms cubic-bezier(0.25, 0.1, 0.25, 1),
              border-color 180ms cubic-bezier(0.25, 0.1, 0.25, 1),
              opacity 180ms cubic-bezier(0.25, 0.1, 0.25, 1);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
```

---

## 7. Forbidden (hard no)

- **Gradients** in UI chrome. The only gradient allowed is a radial vignette behind a hero — and it's optional.
- **Shadows** on anything. Border separation only.
- **Blur / backdrop-filter** except on the nav-dots chrome for a magazine deck.
- **Border-radius > 16px** on cards. Buttons are either pill (`999px`) or technical (`4–8px`) — those two shapes only.
- **Skeleton loading screens.** Use `[LOADING…]` text instead.
- **Toast popups.** Inline bracket messages only.
- **Zebra striping** in tables.
- **Filled icons, multi-color icons, emoji** as UI.
- **Mascots, sad-face illustrations, multi-paragraph empty states.** An empty state is `[NO DATA]` and a sentence.
- **Parallax, scroll-jacking, spring / bounce easing.** None of it.
- **Differentiating chart series by color alone.** Opacity or pattern first; color as a last resort.
- **Accent red anywhere that isn't urgent.** Not for decoration. Not for brand flair. Not "because it needs a pop."

---

## 8. When to use Nothing

Pick Nothing when:
- The user explicitly asks for "nothing", "Nothing design", "Nothing OS", "Ndot", "dot-matrix", or "instrument panel"
- The content is operations-facing: status pages, observability dashboards, telemetry recaps, incident reviews
- The content has genuine numeric density — percentages, timings, counts, thresholds
- The user wants a dark, technical, product-launch feel

Do **not** pick Nothing when:
- The content is editorial / essay-first (use Editorial or Paper/ink)
- The content needs a different named brand system
- The user hasn't named it — default stays Mono-Industrial

---

## 9. Verification

Before delivery:
- **Squint test.** The hero (Doto) dominates. Instrument labels recede. The one grid-break is clearly the focal moment.
- **Swap test.** Replace Doto with Geist Pixel and Space Mono labels with Inter caps — if the page still reads as Nothing, you haven't committed to the aesthetic. Doto + ALL-CAPS Space Mono are non-negotiable.
- **Both themes.** Toggle `prefers-color-scheme`. Accent red must be identical in both modes. Canvas flips black ↔ `#F5F5F5`, surfaces flip accordingly.
- **Accent audit.** Count every use of `#D71921` on the page. More than one? Remove all but the most urgent.
- **Motion audit.** No `translate`, no `scale`, no `box-shadow` in any `transition` declaration. Opacity and color only.
