# Mobile Responsiveness Contract

Every page produced by this skill must pass a single rule at mobile widths: **the document body must never scroll horizontally.** Wide content (data tables, Mermaid diagrams, inline SVG graphs, pipelines, directory trees, long code) scrolls horizontally *inside its own container* instead of widening the page.

This contract applies to every explainer, magazine, longform, and slide-in-page layout. Slide decks and reels that intentionally run at `100vw × 100vh` are the only exception.

## The failure this prevents

At 390px viewport (iPhone 12/13/14/15 baseline), without this contract:

- A wide table pushes `body` to `min-content` and the whole page pans left/right as the user scrolls down.
- An inline SVG with a fixed `viewBox` forces the page width to the SVG's natural width.
- A CSS Grid with a fixed-pixel track (`grid-template-columns: 260px 1fr`) refuses to shrink below 260px + content.
- A long inline `<code>` or URL without `word-break` punches through its container.

With this contract, the page width equals the viewport width always. Individual wide elements become their own horizontal scroll zones.

## Layer 1 — Page-level overflow

Put this near the top of every page's `<style>` block:

```css
*, *::before, *::after { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  max-width: 100%;
  /* Two declarations: `hidden` is the fallback, `clip` wins where supported.
     `clip` is preferred because it does not create a new containing block for
     fixed/absolute descendants and does not establish a scroll container,
     which means `position: sticky` inside the page still works. */
  overflow-x: hidden;
  overflow-x: clip;
}

/* Every grid/flex child must be allowed to shrink below its content width. */
body :where(.grid, .flex, [class*="-grid"], [class*="-row"]) > * {
  min-width: 0;
}

/* Long URLs, unbroken identifiers, inline code: wrap instead of overflow. */
body { overflow-wrap: anywhere; }
```

**Do not** use `overflow-x: hidden` on `body` alone and stop there. It hides the overflow but the layout still computes at the wider width, and touch-scroll chrome still flashes when a child tries to blow past. The `overflow: clip` + `min-width: 0` combo is what actually keeps the layout honest.

**Do not** use `overflow-x: scroll` on body as a shortcut. That is the failure mode we are preventing.

## Layer 2 — The `.scroll-x` wrapper

Any element that is allowed to be wider than the viewport on mobile must sit inside a wrapper that owns the horizontal scroll. The wrapper's job is: clip to 100% of the container, scroll internally, expose a thin scrollbar on desktop hover, use momentum on touch.

```css
.scroll-x {
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;               /* Firefox */
  scrollbar-color: var(--border-bright, rgba(0,0,0,.25)) transparent;
  /* Optional: subtle edge fade to signal "more to the right". */
  mask-image: linear-gradient(to right,
    transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%);
  -webkit-mask-image: linear-gradient(to right,
    transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%);
}
.scroll-x::-webkit-scrollbar { height: 6px; }
.scroll-x::-webkit-scrollbar-thumb {
  background: var(--border-bright, rgba(0,0,0,.25));
  border-radius: 3px;
}

/* When the mask would hide content near the edge of the viewport (e.g. a table
   that bleeds to the edge of a narrow page), disable the fade: */
.scroll-x--no-fade { mask-image: none; -webkit-mask-image: none; }
```

### Apply `.scroll-x` to these containers

| Content type | Wrapper to add | Notes |
|---|---|---|
| `<table>` (data, comparison, audit) | `<div class="scroll-x">` around `<table>` | Combine with existing `.table-wrap`. |
| Mermaid diagram | Already wrapped by `.mermaid-wrap`. Ensure `.mermaid-wrap` has `max-width: 100%` and `overflow: auto`. See `./css-patterns.md#mermaid-containers`. |
| Inline SVG diagram with fixed `viewBox` or `min-width` | `<div class="scroll-x">` around the SVG container | Required whenever the SVG's intended width exceeds ~640px. |
| `.pipeline` (horizontal steps) | Pipeline element already uses `overflow-x: auto` — ensure `max-width: 100%` and `min-width: 0` on it. | |
| `.dir-tree` (directory listings with `├──` connectors) | `<div class="scroll-x">` around the `<pre>` | Never let tree connectors wrap. |
| `.code-block` wider than viewport | `<pre class="code-block scroll-x">` or wrap | Only if the code truly must stay on one line (e.g. CLI invocations). Otherwise prefer `white-space: pre-wrap`. |
| Long monospace equations / identifiers (e.g. the `ff-equation` pattern) | The equation element itself gets `overflow-x: auto; max-width: 100%` | |

### What NOT to wrap

- Prose paragraphs — they should wrap, not scroll.
- Grid layouts of cards (use 1-column fallback at breakpoint instead).
- Anything inside the hero — hero content should use `clamp()` typography and collapse to single column.
- Navigation — use the mobile nav pattern in `./responsive-nav.md`.

## Layer 3 — Mobile breakpoint standards

Use **768px** as the default mobile breakpoint. Use **820px** only when the layout has a sidebar / TOC that needs to collapse earlier. Do not introduce additional breakpoints unless the layout genuinely demands it.

```css
@media (max-width: 768px) {
  body { padding: 16px; }

  /* Fixed-column grids collapse to single column */
  .arch-grid,
  .comparison,
  .diff-panels,
  .dir-compare,
  [class$="-grid"] {
    grid-template-columns: 1fr;
  }

  /* Pipelines: let them scroll horizontally rather than wrap
     (wrapping breaks the left-to-right reading cue). */
  .pipeline { flex-wrap: nowrap; }

  /* KPI rows: shrink minimum column width, not number of columns. */
  .kpi-row { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }

  /* Hero display type already uses clamp(); no override needed. */
}
```

For 2-column hero layouts (the `grid-template-columns: minmax(0,1fr) 160px` pattern common in magazine layouts), collapse to a single column at the same breakpoint. Always use `minmax(0, 1fr)` rather than `1fr` for grid tracks containing wide children — `1fr` defaults to `minmax(auto, 1fr)` which refuses to shrink.

## Layer 4 — Aesthetic-specific adaptations

The contract is aesthetic-agnostic, but a few named aesthetics have known mobile quirks:

- **Mono-Industrial**: The three-layer typographic rhythm compresses but is retained. The `margin-left` of section labels drops to 0 below 768px.
- **Nothing**: Its oversized display type already uses `clamp()` — no override needed. The grid lines disappear below 640px.
- **Magazine / Poster**: These run at fixed canvases (e.g. 1080×1350, 1280×720). They are *not* responsive. Do not apply this contract to slide or poster layouts — they are viewed at their native canvas.

## Layer 5 — Verification

Every page must pass this at 390×844 (iPhone 14/15 width):

1. `document.documentElement.scrollWidth === window.innerWidth` — the page is exactly viewport-wide.
2. No horizontal scrollbar on `body`.
3. Every wide element (tables, diagrams, SVGs, pipelines) is either reflowed to fit OR horizontally scrollable inside its own container, with the scrollbar/edge-fade visible near the right edge.
4. No text is clipped by `overflow: clip` — if text is getting cut, the element needs `.scroll-x`, not broader clipping.
5. No content is hidden behind the theme toggle or other fixed-position UI.

### Playwright MCP verification snippet

```javascript
await browser_resize({ width: 390, height: 844 });
await browser_navigate({ url: `file://${absolutePath}` });
const overflow = await browser_evaluate({
  function: `() => ({
    docWidth: document.documentElement.scrollWidth,
    viewWidth: window.innerWidth,
    bodyWidth: document.body.scrollWidth,
    overflowingElements: [...document.querySelectorAll('*')]
      .filter(el => el.scrollWidth > el.clientWidth + 1 &&
                    getComputedStyle(el).overflowX === 'visible')
      .slice(0, 10)
      .map(el => ({ tag: el.tagName, cls: el.className, w: el.scrollWidth }))
  })`
});
```

If `docWidth > viewWidth` or `overflowingElements.length > 0`, the page fails. Find the offending element in the list and either add `.scroll-x`, set `min-width: 0`, or apply `max-width: 100%`.

## Common failure patterns and fixes

| Symptom | Root cause | Fix |
|---|---|---|
| Whole page pans left/right on mobile | A wide descendant without `.scroll-x` | Identify via the Playwright snippet above; wrap in `.scroll-x`. |
| Grid column refuses to shrink | `grid-template-columns: 260px 1fr` (1fr = minmax(auto, 1fr)) | Change to `grid-template-columns: 260px minmax(0, 1fr)`. |
| Table gets cut off mid-column on mobile | Body `overflow: clip` is hiding the table overflow | Wrap table in `.scroll-x` so overflow is the table's, not the body's. |
| Inline SVG stretches the page | SVG has a large fixed `width` attribute | Add `max-width: 100%; height: auto` to the SVG, OR wrap in `.scroll-x` if the SVG has a minimum readable size. |
| Text hidden behind `overflow: clip` | Prose element has an accidental fixed width | Remove the fixed width; prose should use `max-width: <N>ch`. |
| Flex child won't shrink | `min-width: auto` on flex item | Add `min-width: 0` to the flex child. |
| `position: sticky` breaks after the contract | Applied `overflow-x: hidden` to an ancestor instead of `overflow-x: clip` | Replace `hidden` with `clip` on the ancestor. |
