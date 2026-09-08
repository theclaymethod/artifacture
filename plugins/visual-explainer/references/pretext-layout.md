# Measure SVG text with Pretext

When an SVG box wraps around text, use [Pretext](https://github.com/chenglou/pretext) to measure and wrap the label before sizing the box. Graph engines or manual placement still own packing, routes, and collision resolution.

Use it for multiline or mixed-script labels, responsive node widths, callouts, legends, and edge-label masks. Do not alter Mermaid's internal layout or add measurement to a stable one-line label in a known box.

## Measure, then place

1. Wait for the actual font.
2. Call `prepareWithSegments(text, font)` once per unique label.
3. Call `layoutWithLines(handle, width, lineHeight)` when the allowed width changes.
4. Use `measureLineStats(handle, width)` for `lineCount` and `maxLineWidth`.
5. Derive box dimensions and connector anchors from those metrics.

```js
await document.fonts.load(font);
await document.fonts.ready;

const handle = prepareWithSegments(text, font);
```

Measuring fallback fonts produces incorrect bounds after the intended font loads. Cache prepared handles by text, font string, and segmentation options; reuse them when the container changes width.

A layout helper can return:

```js
{
  lines,
  lineCount,
  maxLineWidth,
  contentWidth,
  boxWidth,
  boxHeight,
  anchors: { top, right, bottom, left },
}
```

Apply measurement to node labels first, then edge masks and callouts. Keep it separate from the graph layout so each can be checked independently.

## Examples and API

- [Layout lab](../../../demos/pretext-layout-lab.html): heuristic and measured wrapping side by side.
- [Layout examples](../../../demos/pretext-layout-examples.html): node heights, shapes, masks, legends, callouts, and responsive reflow.
- [Pretext API examples](https://github.com/chenglou/pretext/blob/main/README.md).
