# Pretext for SVG Diagram Layout

Canonical rule for inline-SVG diagrams in this skill: when a box wraps around measured text, route the label through [`chenglou/pretext`](https://github.com/chenglou/pretext) rather than hand-guessing geometry. Pretext handles text measurement and wrapping; everything else (graph routing, packing, collision resolution) stays with ELK / dagre / manual placement.

## Why this library is relevant here

Our diagram system already has two strong layout modes:

- **Inline SVG** for editorial figures where we want exact control.
- **Mermaid** for graphs where auto-layout is more valuable than hand placement.

The weak spot is the space **between content generation and box placement**. For SVG diagrams, we often know the node width we want, but we do not know the honest label height until the text is measured and wrapped. That uncertainty leaks into:

- guessed node heights
- brittle line breaks
- edge anchors tied to hard-coded Y values
- oversized or undersized mask rectangles behind arrow labels

`pretext` fits exactly at that layer. It does **text measurement and wrapping**, not graph layout.

## Recommended use

Use `pretext` for SVG-first diagrams when any of these are true:

- labels can run 2+ lines
- labels include mixed scripts or non-Latin text
- node width changes responsively
- callouts or legend items need shrink-wrap widths
- edge-label masks should match the rendered text instead of a guessed rectangle

Good targets in this repo:

- architecture nodes
- flowchart step labels
- sequence-note boxes
- legend items in tight canvases
- annotation callouts that need measured width before placing the dashed leader

## What not to use it for

- **Not** Mermaid internals. Mermaid still owns Mermaid.
- **Not** graph packing, routing, or collision resolution. Keep ELK/dagre/manual placement for that.
- **Not** one-line labels inside known fixed-size boxes where the current rules are already stable.

## Practical integration shape

Build a single helper around the `pretext` API and keep everything else downstream of it.

Suggested return shape:

```js
{
  lines,
  lineCount,
  maxLineWidth,
  contentWidth,
  boxWidth,
  boxHeight,
  anchors: {
    top,
    right,
    bottom,
    left,
  },
}
```

Suggested flow:

1. Wait for the actual font to load.
2. `prepareWithSegments(text, font)` once per unique label.
3. `layoutWithLines(handle, width, lineHeight)` whenever the allowed width changes.
4. `measureLineStats(handle, width)` to get `lineCount` and `maxLineWidth`.
5. Derive the node box and connector anchors from those numbers.

## Caching guidance

The prepared handle should be cached by:

- text
- font string
- segmentation options, if any

That gives us a cheap hot path for responsive reflow:

- prepare once
- re-layout many times as width changes

This is the main reason `pretext` is a good fit for our HTML demo pages, where the same figure can render at desktop and mobile widths.

## One important implementation detail

Prepare labels **after fonts are ready**. If we prepare against fallback fonts and then the intended font loads later, the measured widths will be wrong and every downstream box calculation will drift.

Minimal pattern:

```js
await document.fonts.load(font);
await document.fonts.ready;

const handle = prepareWithSegments(text, font);
```

## Lowest-risk adoption path

1. Start with a non-invasive utility used only by new SVG demos.
2. Apply it to node labels first.
3. Then use the same utility for edge-label masks and callout widths.
4. Only after that consider folding it into the default SVG diagram generation path.

This keeps the experiment reversible while proving whether the added dependency meaningfully improves layout quality.

## Related artifact

See [`demos/pretext-layout-lab.html`](../../../demos/pretext-layout-lab.html) for a side-by-side exploration:

- left: heuristic wrapping
- right: `pretext`-driven wrapping and box sizing

See [`demos/pretext-layout-examples.html`](../../../demos/pretext-layout-examples.html) for a broader gallery:

- measured node heights
- flowchart shape sizing
- edge-label masks
- legend strip widths
- callout boxes
- responsive re-layout

## Source

- GitHub: <https://github.com/chenglou/pretext>
- README API examples: <https://github.com/chenglou/pretext/blob/main/README.md>
