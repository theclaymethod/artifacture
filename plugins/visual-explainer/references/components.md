# Mono-Industrial Components

Named, reusable patterns. Sub-agents pick from this catalog when building a section. Each component declares its **role** (which sub-agent uses it), the **HTML skeleton**, the **scoped CSS** (already prefixed under `.ve-{role}__`), and any **fonts/libraries it needs**.

Tokens used below come from `./tokens.md` and are published once on `:root` by the orchestrator. Sub-agents must not redefine them.

For the contract that connects components → sub-agents → orchestrator, see `./section-contract.md`.

---

## Hero number

**Role:** `hero` · **Fonts needed:** `["Geist Pixel Square"]` · **Libraries:** none

The one moment-of-surprise. Use exactly once per page. Pair an oversized Geist Pixel value with a Space Mono caps label and a Space Grotesk lede on the left.

```html
<section class="ve-hero">
  <div class="ve-hero__copy">
    <h1 class="ve-hero__headline">{{HEADLINE}}</h1>
    <p class="ve-hero__lede">{{LEDE}}</p>
  </div>
  <div class="ve-hero__display" aria-label="{{ARIA}}">
    {{VALUE}}
    <small>{{LABEL}}</small>
  </div>
</section>
```

```css
.ve-hero {
  padding: var(--space-6) 0;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--space-4);
  align-items: end;
}
.ve-hero__headline {
  font-size: clamp(36px, 5.5vw, 64px);
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.02;
  color: var(--text-display);
  text-wrap: balance;
  max-width: 20ch;
}
.ve-hero__lede {
  margin-top: var(--space-3);
  max-width: 52ch;
  color: var(--text-secondary);
}
.ve-hero__display {
  font-family: var(--font-display);
  font-size: var(--size-display);
  font-weight: 400;
  line-height: 0.9;
  color: var(--text-display);
  letter-spacing: -0.02em;
  justify-self: end;
  align-self: end;
}
.ve-hero__display small {
  display: block;
  margin-top: var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--size-caption);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
  text-align: right;
}
@media (max-width: 900px) {
  .ve-hero { grid-template-columns: 1fr; padding: var(--space-5) 0; }
  .ve-hero__display { justify-self: start; }
}
```

---

## Metadata row

**Role:** any (typically appears once at the top, not its own sub-agent — orchestrator emits this in the page shell) · **Fonts needed:** none extra · **Libraries:** none

Top-of-page tertiary band. Space Mono ALL CAPS, single hairline below.

```html
<header class="ve-meta">
  <span>{{LEFT}}</span>
  <span class="ve-meta__right">
    {{RIGHT_ITEMS}}
  </span>
</header>
```

```css
.ve-meta {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-4);
  font-family: var(--font-mono);
  font-size: var(--size-caption);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--rule);
}
.ve-meta__right { display: flex; gap: var(--space-4); }
```

---

## Section label

**Used by every sub-agent** as the lead-in band for its section. Numbered index in Space Mono caps + descriptor on the left, optional right-side meta.

```html
<div class="ve-section__label">
  <span><span class="ve-section__index">{{NN}}</span>&nbsp;&nbsp;{{TITLE}}</span>
  <span>{{RIGHT_META}}</span>
</div>
```

```css
.ve-section__label {
  font-family: var(--font-mono);
  font-size: var(--size-caption);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-secondary);
  padding-top: var(--space-3);
  border-top: 1px solid var(--rule);
  margin-bottom: var(--space-4);
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
}
.ve-section__index { color: var(--text-disabled); }
```

The orchestrator assigns the `{{NN}}` index based on section order in the outline. Sub-agents leave it as `{{NN}}` and the orchestrator substitutes during stitching.

---

## Mermaid container

**Role:** `diagram` · **Fonts needed:** none extra · **Libraries:** `["mermaid"]` (orchestrator adds the script tag once)

Wraps a single Mermaid diagram with full zoom/pan/expand chrome. Copy the `diagram-shell` skeleton from `./templates/mermaid-flowchart.html` (or the equivalent in `./templates/mono-industrial.html` lines ~120–280) and rename top-level classes from `.diagram-shell` → `.ve-diagram__shell`, `.mermaid-wrap` → `.ve-diagram__wrap`, etc.

**Constraint:** Never use bare `<pre class="mermaid">`. Always include the zoom/pan controls and the click-to-expand handler. See SKILL.md "Mermaid containers" for the full requirement.

The diagram source goes in a `<script type="text/plain" class="ve-diagram__source">` block. The orchestrator's bottom-of-page `<script type="module">` reads all `.ve-diagram__source` elements and renders each into its sibling `.ve-diagram__canvas`.

---

## Data table

**Role:** `table` · **Fonts needed:** none extra · **Libraries:** none

Real `<table>`. Sticky header. No zebra. Hairline above each row. Numerics right-aligned in Space Mono with `tabular-nums`. Status colors on the value only.

**Below 640px the table reformats as stacked rows.** Each `<tr>` becomes a vertical group; each `<td>`'s column label appears as a Space Mono caps callout via `::before { content: attr(data-label) }`. This honors Mono-Industrial's "no cards" rule — the rows stack with hairlines between them, like instrument-panel readouts. Sub-agents **must** emit `data-label="..."` on every `<td>` for the stack pattern to work; the value is the human-readable column name (sentence case is fine — CSS uppercases it).

```html
<table class="ve-table">
  <thead>
    <tr>
      <th>{{COL_1}}</th>
      <th>{{COL_2}}</th>
      <th class="ve-table__num">{{COL_NUM}}</th>
      <th>{{COL_STATUS}}</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td data-label="{{COL_1}}">{{CELL}}</td>
      <td data-label="{{COL_2}}">{{CELL}}</td>
      <td class="ve-table__num" data-label="{{COL_NUM}}">{{NUM}}</td>
      <td data-label="{{COL_STATUS}}"><span class="ve-table__status ve-table__status--ok">{{STATUS}}</span></td>
    </tr>
  </tbody>
</table>
```

```css
.ve-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--size-body);
}
.ve-table th {
  font-family: var(--font-mono);
  font-size: var(--size-caption);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
  text-align: left;
  padding: var(--space-3) var(--space-3) var(--space-3) 0;
  border-bottom: 1px solid var(--rule);
}
.ve-table td {
  padding: var(--space-3) var(--space-3) var(--space-3) 0;
  border-top: 1px solid var(--rule);
  color: var(--text-primary);
  vertical-align: top;
}
.ve-table__num {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.ve-table__status {
  font-family: var(--font-mono);
  font-size: var(--size-caption);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.ve-table__status--ok   { color: var(--ok); }
.ve-table__status--warn { color: var(--warn); }
.ve-table__status--err  { color: var(--err); }

/* Stacked-row pattern below 640px — replaces horizontal scroll on narrow viewports.
   The `<thead>` is visually hidden but kept in the DOM for screen readers; each
   `<td>`'s data-label becomes the label callout via ::before. */
@media (max-width: 640px) {
  .ve-table thead {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }
  .ve-table, .ve-table tbody, .ve-table tr, .ve-table td {
    display: block;
    width: 100%;
  }
  .ve-table tr {
    padding: var(--space-3) 0;
    border-top: 1px solid var(--rule);
  }
  .ve-table tbody tr:last-child {
    border-bottom: 1px solid var(--rule);
  }
  .ve-table td {
    border: none;
    padding: var(--space-1) 0;
    display: grid;
    grid-template-columns: minmax(90px, 30%) 1fr;
    gap: var(--space-3);
    align-items: baseline;
  }
  .ve-table td::before {
    content: attr(data-label);
    font-family: var(--font-mono);
    font-size: var(--size-caption);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-secondary);
  }
  .ve-table__num {
    text-align: left;
  }
}
```

---

## Module strip (spacing-grouped, no cards)

**Role:** `dashboard` (also reused by `prose` for feature lists) · **Fonts needed:** none extra · **Libraries:** none

3–4 module descriptions in a row, no boxes — proximity groups them.

```html
<div class="ve-modules">
  <div class="ve-modules__item">
    <div class="ve-modules__tag">{{TAG}}</div>
    <div class="ve-modules__name">{{NAME}}</div>
    <div class="ve-modules__desc">{{DESC}}</div>
  </div>
  <!-- repeat -->
</div>
```

```css
.ve-modules {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-4);
}
.ve-modules__tag {
  font-family: var(--font-mono);
  font-size: var(--size-caption);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin-bottom: var(--space-2);
}
.ve-modules__name {
  font-size: 18px;
  font-weight: 500;
  color: var(--text-display);
  margin-bottom: var(--space-2);
}
.ve-modules__desc {
  color: var(--text-secondary);
}
```

---

## Segmented progress bar

**Role:** `dashboard` · **Fonts needed:** none extra · **Libraries:** none

Discrete blocks with 2px gaps. No rounded corners. Status color on overflow segments only. Lifted from the Nothing design language.

```html
<div class="ve-bar" data-filled="7" data-total="10" aria-label="{{ARIA}}">
  <div class="ve-bar__seg ve-bar__seg--on"></div>
  <!-- repeat per segment, status modifier when over limit -->
</div>
```

```css
.ve-bar {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 2px;
  height: 14px;
}
.ve-bar__seg {
  background: var(--rule);
}
.ve-bar__seg--on   { background: var(--text-display); }
.ve-bar__seg--over { background: var(--err); }
.ve-bar__seg--warn { background: var(--warn); }
```

---

## Bracketed system message

**Role:** any · **Fonts needed:** none extra · **Libraries:** none

Inline Space Mono ALL CAPS, square-bracketed. Use for empty/error/loading states. No mascots, no toasts, no multi-paragraph copy.

```html
<span class="ve-sysmsg">[NO DATA]</span>
<span class="ve-sysmsg ve-sysmsg--err">[ERROR: timeout]</span>
<span class="ve-sysmsg ve-sysmsg--ok">[SAVED]</span>
```

```css
.ve-sysmsg {
  font-family: var(--font-mono);
  font-size: var(--size-caption);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
}
.ve-sysmsg--ok  { color: var(--ok); }
.ve-sysmsg--err { color: var(--err); }
```

---

## Prose accent: lead paragraph

**Role:** `prose` · **Fonts needed:** none extra · **Libraries:** none

A single oversized intro paragraph that sets context before the visual sections. Used sparingly — at most once per page.

```html
<p class="ve-lead">{{LEAD_PARAGRAPH}}</p>
```

```css
.ve-lead {
  font-size: clamp(20px, 2.4vw, 28px);
  line-height: 1.4;
  color: var(--text-primary);
  max-width: 60ch;
  margin: var(--space-5) 0 var(--space-4);
}
```

---

## Prose accent: pull quote

**Role:** `prose` · **Fonts needed:** none extra · **Libraries:** none

```html
<blockquote class="ve-pull">{{QUOTE}}</blockquote>
```

```css
.ve-pull {
  font-size: clamp(20px, 2.2vw, 26px);
  line-height: 1.4;
  color: var(--text-display);
  max-width: 48ch;
  margin: var(--space-5) auto;
  padding-left: var(--space-3);
  border-left: 2px solid var(--text-display);
}
```

---

## Adding new components

Anything new must:
1. Use only tokens from `./tokens.md`. No new colors, no new fonts, no new spacing values.
2. Prefix every class with `.ve-{role}__` so it cannot collide with another sub-agent's output.
3. Declare which `fonts_needed` and `libraries_needed` it requires (so the orchestrator can dedup imports).
4. Pass the pre-render gate in `./mono-industrial.md` (three-layer rule, font budget, motion = 0).
