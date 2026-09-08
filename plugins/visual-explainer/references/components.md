# HTML fragment components

Use these patterns for independent raw HTML sections. Each names its worker role, markup, scoped CSS, and dependencies. Ordinary pages use the shared MDX/TSX components.

Tokens used below come from `./tokens.md` and are published once on `:root` by the orchestrator. Sub-agents must not redefine them.

Follow `section-contract.md` for worker output and parent integration.

---

## Hero number

**Role:** `hero`. Lead with a concrete title and useful introductory sentence. A large value is optional and must be sourced, labeled with its unit and context, and central to the explanation. Use the host display face; do not load a pixel font or invent a number for visual impact.

## Metadata row

Omit by default. Add a source, ownership, date, or state only when it is factual and changes interpretation or operation. Prefer placing it beside the content it qualifies rather than creating a repeated top band.

## Section label

Use a semantic heading that names the section. Do not add `{{NN}}` or a second uppercase descriptor unless the number communicates actual sequence or navigation. `{{NN}}` remains a supported fragment placeholder for those cases.

## Mermaid container

**Role:** `diagram` · **Fonts needed:** none extra · **Libraries:** `["mermaid"]` (orchestrator adds the script tag once)

Wraps a single Mermaid diagram with full zoom/pan/expand chrome. Copy the `diagram-shell` skeleton from `../templates/mermaid-flowchart.html` (or the equivalent in `../templates/mono-industrial.html` lines ~120–280) and rename top-level classes from `.diagram-shell` → `.ve-diagram__shell`, `.mermaid-wrap` → `.ve-diagram__wrap`, etc.

**Constraint:** Never use bare `<pre class="mermaid">`. Always include the zoom/pan controls and the click-to-expand handler. See [css-patterns.md](css-patterns.md) → "Mermaid Containers" for the control shell.

The diagram source goes in a hidden inert `<pre class="ve-diagram__source">` element as escaped text. The orchestrator's bottom-of-page module reads each source element with `textContent` and renders it into its sibling `.ve-diagram__canvas`.

---

## Data table

**Role:** `table` · **Fonts needed:** none extra · **Libraries:** none

Use a real `<table>` with a sticky header and a hairline above each row, without zebra striping. Right-align numeric values in the host numeric font with `tabular-nums`; apply status colors only to the values they describe.

**Below 640px the table reformats as stacked rows.** Each `<tr>` becomes a vertical group; each `<td>`'s column label appears as a readable label via `::before { content: attr(data-label) }`. Sub-agents **must** emit `data-label="..."` on every `<td>` for the stack pattern to work; the value is the human-readable column name (preserve sentence case).

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
  font-family: var(--font-body);
  font-size: var(--size-caption);
  letter-spacing: 0.08em;
  text-transform: none;
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
  font-family: var(--font-body);
  font-size: var(--size-caption);
  letter-spacing: 0.08em;
  text-transform: none;
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
    font-family: var(--font-body);
    font-size: var(--size-caption);
    letter-spacing: 0.08em;
    text-transform: none;
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
  text-transform: none;
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

Use discrete blocks only when units or thresholds justify the segments. Keep 2px gaps, true proportions, and labeled values. Status color belongs only to actual overflow.

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

Plain text naming the actual state; bracket styling is optional. Use for empty/error/loading states. No mascots, no toasts, no multi-paragraph copy.

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
  text-transform: none;
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
4. Follow the active preset, readable type minimums, and `verification.md`. Keep static content visible.
