# Inline SVG diagram construction

Load this reference after [`diagram-design.md`](./diagram-design.md) selects the semantic pattern, visual type, output dials, and renderer. This file owns shared SVG geometry and rendered QA; `diagram-design.md` owns routing and budgets, while [`diagram-tokens.md`](./diagram-tokens.md) owns aesthetic values.

## Contents

- [Removal gate](#removal-gate)
- [Canvas and layers](#canvas-and-layers)
- [Connector contract](#connector-contract)
- [Labels and text measurement](#labels-and-text-measurement)
- [Shape semantics](#shape-semantics)
- [Editorial primitives](#editorial-primitives)
- [Accessible and safe SVG](#accessible-and-safe-svg)
- [Rendered verification](#rendered-verification)
- [Attribution](#attribution)

## Removal gate

Run this before emitting SVG:

- The selected type teaches more than prose, bullets, or a compact table.
- Every node represents a distinct idea; merge nodes that always travel together.
- Every connector carries information that layout alone does not communicate.
- One focal element dominates and the accent appears on at most two elements.
- The diagram fits the selected type budget or has been split into overview and detail.
- Every material source item is represented, merged explicitly, or listed in the fidelity ledger.

## Canvas and layers

- Derive the `viewBox` and type ramp from the size preset in `diagram-design.md`. Reserve roughly 60px of height for a bottom legend when a legend is needed.
- Use clean paper as the default background. Add the optional 22×22 dot texture only for a dedicated editorial canvas; omit it inside cards, slides, and product-page chrome.
- Place wide SVGs inside the route's horizontal-scroll wrapper. Keep the SVG responsive with `width: 100%; height: auto;` and a stable `viewBox`.
- Use a 4px construction grid for coordinates, font sizes, dimensions, gaps, and padding. Stroke widths, opacity, and the optional 22px dot pattern are exempt.

Paint in this order:

1. Background and zones.
2. Connectors, connector masks, and connector labels.
3. Nodes and node text.
4. Editorial callouts.
5. Bottom legend.

This order keeps connectors behind their endpoints while leaving connector labels visible in open canvas.

## Connector contract

### Geometry

1. Use a straight segment only when endpoints share an x or y coordinate.
2. Route off-axis connections with rounded orthogonal elbows. Use a 6–8px bend radius and avoid diagonal slants.
3. End connectors at the node boundary with a 6–10px visual air gap for the marker. Compute anchors from the node bounding box.
4. Give every connector an independently traceable path. Offset parallel routes by at least 12px.
5. Fan multiple connectors along a shared node edge. For edge length `L` and `N` connectors, position connector `k` at `L × k / (N + 1)` from the leading corner.
6. Use a bridge/hop when orthogonal routes cross. Reroute any connector that would pass behind an unrelated node.

An unavoidable transit behind a non-endpoint node is a narrow exception: use a dashed stroke, keep the label at a visible end, and land the marker only at the true destination.

### Markers and IDs

Define default, focal, and external/link arrow markers. Prefix every marker, mask, filter, pattern, gradient, clip path, title, and description id with the diagram slug. Bare ids such as `arrow`, `title`, or `clip` collide when several SVGs are inlined.

Draw each marker in the same semantic token family as its connector. Use dashed strokes for returns, optional flow, passive relationships, or asynchronous paths only when the distinction matters.

### Connector labels

- Put an opaque paper-colored mask behind every connector label.
- Leave a visible 6–10px gap between the mask and the connector stroke.
- Place vertical-segment labels to the side rather than using vertical writing mode.
- Keep the entire mask in open canvas. A mask that overlaps a later-painted node will be clipped by the node fill.
- Keep short technical connector labels concise and direct-label longer explanations as nearby notes.

## Labels and text measurement

Use sans text for human-readable names, mono for ports, commands, URLs, types, axis labels, and short connector labels, and the selected display face only for titles or bounded editorial callouts.

For wrapped node labels, notes, legends, or masks, read [`pretext-layout.md`](./pretext-layout.md). Measure the text first, then derive box width, box height, and anchors from the returned metrics. Layout engines or manual placement own graph positioning; Pretext owns text measurement.

Keep labels inside their boxes with intentional padding. Shorten or wrap copy before shrinking below the size preset's readable type ramp.

## Shape semantics

Preserve the type grammar from `diagram-design.md`. These primitives are universal where applicable:

- Start/end: oval or pill.
- Process step or ordinary component: rectangle with a restrained 4–8px radius.
- Decision: diamond with at most three exits.
- Merge: small filled dot.
- Store/state: visually distinct fill or store glyph while retaining the active token system.
- Trust or security boundary: dashed zone with a masked boundary label.

Shape communicates category; color communicates focal importance or operational state. Use hairline borders and avoid shadows.

## Editorial primitives

### Annotation callout

Use an italic display/serif note with a dashed leader and landing dot. Keep it in the margin, connect it visibly to one target, and limit a diagram to two callouts.

### Sketchy variant

Use deterministic `feTurbulence` plus `feDisplacementMap` only for narrative or essay contexts. Apply the filter to shapes, never text. Set an explicit seed and keep displacement restrained.

### Legend

Add a legend only when multiple stroke, fill, or marker meanings require decoding. Put it in a horizontal strip below the diagram body with a hairline separator. Every legend item must appear in the figure, and every non-obvious encoded state must appear in the legend.

## Accessible and safe SVG

Every meaningful SVG follows this skeleton:

```html
<svg role="img" aria-labelledby="<slug>-title <slug>-desc" viewBox="0 0 1000 660">
  <title id="<slug>-title">Short subject name</title>
  <desc id="<slug>-desc">One sentence describing the information conveyed.</desc>
  <defs>...</defs>
  ...
</svg>
```

- `<title>` is the first SVG child and `<desc>` follows it, before `<defs>`.
- IDs are unique per diagram and variant.
- The description states meaning, not a shape-by-shape narration.
- Decorative SVG uses `aria-hidden="true"`.
- Source labels are HTML-escaped and never inserted into executable elements, event attributes, `srcdoc`, or unsafe URLs.
- Static meaning is complete without JavaScript. Motion follows the reviewed route in `diagram-design.md`.

## Rendered verification

Inspect each figure individually after authoring. Use an available browser capability to navigate, resize, scroll figures into view, capture screenshots, and inspect console errors. Verify at desktop and at the route's mobile size.

For every figure, check:

- Type and semantic pattern match the content.
- `<title>`, `<desc>`, and `aria-labelledby` resolve correctly.
- Connector routes are orthogonal where off-axis, independently traceable, and free of unintended overlaps.
- Shared-edge attachment points are distinct and marker endpoints land outside node text.
- Connector labels have masks and visible separation from their strokes.
- Wrapped text remains inside measured boxes.
- Accent appears on at most two focal elements.
- Legends are complete and outside the diagram body.
- Nothing clips, overflows, overlaps, or relies on unreadably small text.
- Light and dark output remain legible under the selected aesthetic.
- Static and reduced-motion states communicate the complete meaning.
- The console and asset checks are clean.

Repair the root geometry or density issue and re-inspect. After two unsuccessful repairs, replace the figure with a simpler type, split it, or report the remaining defect accurately.

## Attribution

This technical contract paraphrases and adapts [cathrynlavery/diagram-design at `a5e3978`](https://github.com/cathrynlavery/diagram-design/tree/a5e3978088cf89c7caff5c20cabd99fbc2a301de) under the MIT License (copyright 2025 Cathryn Lavery). This repository adds host-aesthetic tokens, progressive route composition, Pretext text measurement, and its own preview workflow.
