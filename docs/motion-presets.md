# Reuse motion on one scene clock

Install the three compilers together or separately:

```bash
artifacture add follow-path comparison-wipe source-range-focus --cwd ./explainer
```

They return ordinary immutable `GraphicScene` and `GraphicMotion` data. Sample at explicit seconds with `sampleScene`, render with `GraphicCanvas`, and place the same result in a poster, slide, or video. JSON transport retains prepared route tables and all tracks. The [worked review](../examples/visual-explainer-mdx/motion-review.tsx) traces a cached zero through a defaulting bug and its correction using a single persistent figure.

## Traverse a route

`prepareGraphicRoute({ start, segments, tolerance })` accepts lines, quadratic curves, and cubic curves. Bounded deterministic subdivision produces one `M/L` polyline and cumulative distance table. Draw `route.d`; the marker follows that exact drawing. Zero-length routes, overflow, and a tolerance that cannot be met within 20 subdivision levels or 65,536 points fail.

```ts
const motion = followPath(scene, {
  duration: 12, target: 'carrier', route, trace: 'route', initialFocus: 'request',
  traversal: { mode: 'timestamp', keys: [
    { at: 0, distance: 0 },
    { at: 3, distance: .3, focus: 'cache' },
    { at: 5, distance: .3 },
    { at: 9, distance: 1, focus: 'storage' },
  ] },
});
```

Repeated distance authors a wait; decreasing distance authors reverse traversal. A distance-mode traversal instead accepts `start`, `duration`, optional `from`/`to`, and `arrivalFocus`. Linear easing gives constant distance speed per interval; smooth easing settles at authored arrivals. Focus changes exactly at arrival. The endpoint holds through the master duration and later queries.

The carrier is an illustration drawn around an optional anchor. A trace must contain only the exact prepared path, have the same placement as the carrier, and have no translation. Composition transforms their shared placement once while keeping route geometry local. Route and linear translation cannot overlap on the same carrier.

## Compare aligned figures

`comparisonWipe` accepts before/after scenes, a nonempty `registration` list of common object IDs, finite `duration`, `start`, `transition`, split fractions `from`/`to`, and optional `axis`/`ease`. Bounds must match exactly. All registered objects retain their structural geometry, physical node outlines, text origins and metrics including `textLength`. Paint and label strings may change within that shared geometry.

At split zero the before scene is visible; at one the after scene is visible. Independently scoped copies receive complementary masks. Each sampled mask intersects the original static clip and any composition frame clip, including when nested. Empty clips stay empty. No route or layout morph is implied; author the shared layout once before comparing it.

## Bind exact source ranges to narration

`createSourceScene` accepts a shared bounds/layout, ordered versions of semantic text parts, and exact versioned ranges. Parts contain printable ASCII and explicit spaces; empty lines use empty arrays. Reusing a part ID means exactly unchanged text. Each literal character has a stable injective identity, even if its line or column moves. Explicit column width becomes the SVG cell's `textLength`, with preserved spaces.

Ranges use one-based line and column insertion positions and an exclusive end. Preparation resolves ordered character IDs and one rectangle for each nonempty selected row. Empty or newline-only selections reject. There is no lexer, substring search, tab expansion, or DOM font measurement.

`editWithIdentity(source, { duration, edits })` compiles an ordered version chain into translation and opacity tracks. Unchanged cells keep their identity and character; entering and retiring parts fade. A source range can focus only while its complete cue interval belongs to a stable version, outside edits.

`focusSourceRange(source, diagram, { duration, cues, edits, bindings })` binds `cueId`, `rangeId`, and one diagram `target`. Marker opacity and consequence highlight switch exactly over the normalized cue's half-open `[start, end)` interval. Focus clears at the end. An explanation that needs a longer hold must own a longer cue interval.

The returned `cues` and `bindings` are an immutable nonvisual receipt. Keep their measured/estimated/authored alignment, source, and original source intervals in the narration manifest beside the exported video. Those receipts are not embedded automatically in a slide sequence. Narration generation and timing measurement remain separate from the compiler.

## Boundaries

Every track belongs to one finite master clock. Direct and reverse seeks recompute from base data. `defineGraphicMotion` deep-clones, validates, and freezes route points, distance arrays, anchors, masks, and interpolation fields. Scalar opacity/reveal and highlight tracks support `interpolation: 'step-end'`; existing defaults remain unchanged. No compiler starts playback or introduces a renderer or dependency.
