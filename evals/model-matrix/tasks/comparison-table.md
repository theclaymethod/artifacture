# Task: Comparison Table

Create a visual comparison table for choosing a rendering strategy for an internal documentation tool. Use the fixed data below. Show the tradeoffs clearly and include a short recommendation.

## Options And Criteria

| Option | Setup Complexity | Runtime Portability | Visual Fidelity | Interactivity | Export Reliability | Best Fit |
| --- | --- | --- | --- | --- | --- | --- |
| Static HTML | Low: one generated file | Excellent: opens anywhere | Medium: CSS and SVG only | Low: basic links and toggles | High: deterministic file output | Durable diagrams and reports |
| React MDX | Medium: build step required | Good: exports to static HTML | High: component system and charts | Medium: local state and controls | Medium: bundler can fail on bad imports | Rich explainers with reusable pieces |
| Slide Deck | Medium: authoring constraints | Good: browser or PDF | Medium: strong hierarchy, less detail | Low: mostly sequential | High: fixed viewport makes capture stable | Reviews and narrative walkthroughs |
| Canvas App | High: custom rendering loop | Fair: depends on browser APIs | Very high: precise drawing and animation | High: direct manipulation | Low: screenshot timing is fragile | Dense spatial simulations |
| Video Composition | High: timeline and media pipeline | Excellent: MP4/WebM playback | Very high: motion and sound | None after export | Medium: render settings can drift | Launch demos and async updates |

## Decision Context

The team needs a default for weekly architecture notes. The artifacts must be easy to share in chat, stable under automated verification, and expressive enough for diagrams plus small tables. Occasional interactivity is useful, but deterministic export matters more.

## Output Goals

- Preserve the exact five options and six criteria.
- Make the recommended default obvious.
- Call out the main reason not to choose each non-default option.
