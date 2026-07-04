# Mono-Industrial Tokens

Raw design values. Every sub-agent reads this to build its CSS scoped to a section. **Do not redefine these tokens inside a sub-agent's scoped CSS.** The orchestrator publishes them once on `:root` in the page shell.

For the principles behind these values, see `./mono-industrial.md`. For named patterns that use them, see `./components.md`.

---

## Fonts

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
```

```css
/* Geist Pixel Square — only when the page has a hero/display moment.
   The orchestrator includes this @font-face only if any sub-agent's
   fonts_needed array contains "Geist Pixel Square". */
@font-face {
  font-family: 'Geist Pixel Square';
  src: url('https://cdn.jsdelivr.net/npm/geist@1.7.0/dist/fonts/geist-pixel/GeistPixel-Square.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

:root {
  --font-body: 'Space Grotesk', system-ui, sans-serif;
  --font-mono: 'Space Mono', 'SF Mono', Consolas, monospace;
  --font-display: 'Geist Pixel Square', 'Space Grotesk', system-ui, sans-serif;
}
```

**Variant alternatives** (orchestrator may swap based on user request): `Geist Pixel Grid`, `Geist Pixel Circle`, `Geist Pixel Triangle`, `Geist Pixel Line`. Same path, different filename. `Doto` (Google Fonts, `family=Doto:wght@400;700`) remains as a legacy organic alternative.

---

## Color (Light, default)

```css
:root {
  --bg: #f6f4f0;
  --fg: #16130f;

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
```

## Color (Dark, via prefers-color-scheme)

```css
@media (prefers-color-scheme: dark) {
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
}
```

**Status is the only color.** Apply on the value, never the row, label, or background. Do not introduce other accents.

---

## Spacing scale

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 16px;
  --space-4: 32px;
  --space-5: 64px;
  --space-6: 96px;
}
```

| Tier | When |
|---|---|
| `--space-1` (4px) | icon+label, number+unit |
| `--space-2` (8px) | adjacent labels |
| `--space-3` (16px) | sibling list items |
| `--space-4` (32px) | section break |
| `--space-5` (64px) | major section |
| `--space-6` (96px) | context shift (hero → body) |

---

## Type scale (3 sizes max per page)

```css
:root {
  --size-display: clamp(72px, 12vw, 144px);
  --size-section: 28px;
  --size-body: 15px;
  --size-caption: 11px;
}
```

| Token | Use |
|---|---|
| `--size-display` | Hero number / display word only |
| `--size-section` | Section titles |
| `--size-body` | Body, descriptions |
| `--size-caption` | Space Mono ALL CAPS labels and metadata |

**Weights:** 400 + one of (300, 500). Never 700 in sans-serif. 700 is fine in Space Mono.

**Tracking on caps:** 0.08em–0.14em.

---

## Mermaid palette tokens

```css
:root {
  --mermaid-node-fill: #ffffff;
  --mermaid-node-stroke: rgba(22, 19, 15, 0.56);
  --mermaid-line: rgba(22, 19, 15, 0.40);
  --mermaid-container: #ffffff;
}

@media (prefers-color-scheme: dark) {
  :root {
    --mermaid-node-fill: #0c0c0c;
    --mermaid-node-stroke: rgba(242, 237, 229, 0.58);
    --mermaid-line: rgba(242, 237, 229, 0.40);
    --mermaid-container: #0c0c0c;
  }
}
```

The orchestrator passes these through to Mermaid's `themeVariables` when initializing, see `./libraries.md` → "Mono-Industrial Mermaid Theme".

---

## Motion

Near zero. No on-load animation. Only interactive transitions, capped at 120ms ease-out.

```css
a, button, .linkish {
  transition: opacity 120ms ease-out, color 120ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
```

Sub-agents must not introduce `@keyframes`, `animation:` properties, or `transition:` durations beyond the above. Spring/bounce easings are forbidden.
