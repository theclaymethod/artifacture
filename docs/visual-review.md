# Visual review

The September 2026 refresh was compared with the original references in a browser at desktop and phone widths.

| Reference | What the comparison changed | Current preview |
|---|---|---|
| [Lieflat Charts](https://github.com/larashero3-dotcom/lieflat-charts) | Countable unit fields and rungs, observations spaced by date, area-scaled matrices, and individual record threads; these five families can be authored from JSON or MDX | [Repair story](img/examples/charts.png) |
| [Algebrica](https://algebrica.org/vectors/) | EB Garamond reading text, a calmer title scale, and a complete projection figure on mobile | [Mathematical explainer](img/examples/algebrica.png) |
| [Mono Color](https://github.com/yanliudesign/mono-color-skill) | Larger type, an offset image, visible paper, and an original two-ink repair illustration | [Editorial page](img/examples/mono-color.png) |
| [Archify](https://github.com/tt-a1i/archify) | Deterministic geometry and interactive controls, with the paper-and-charcoal editorial treatment | [System map](img/examples/archify.png) |
| [PR Lens](https://github.com/coldteadotai/pr-lens) | One moving signal on the actual route, nearby authored captions, and explicit playback controls | [Walkthrough](img/examples/animated-diagram.png) |
| [Pierrick Calvez](https://www.pierrickcalvez.com/journal/a-five-minute-guide-to-better-typography) | Shorter measures, grouped phrases, optical spacing, and aligned numeric columns | [Poster](img/examples/poster.png) |

All 15 templates were inspected in a browser, including the pages of both decks and magazines and the scenes of each video starter. New pages were checked at 1440px and 390px. Diagram review covered full labels, route clearance, arrow endpoints, theme contrast, and the first visible mobile state. Motion review covered paused, playing, stepped, completed, hidden-page, and reduced-motion behavior.

The comparisons exposed two failures that mechanical page-overflow checks alone missed: locally clipped bars looked equal, and a locally scrolling vector figure hid its projection. Both now communicate the complete comparison in their initial mobile view. Dense general-purpose graphs can still scroll locally when their content requires it.

Reference screenshots remain review material. The repository includes screenshots of Artifacture's own output and its original illustration; it does not redistribute the upstream reference images. See [source provenance](../tools/visual-sources.json).

Fresh captures of Lieflat’s Lupi, Basics, and Glance galleries exposed the first version’s limited chart forms. The replacement follows 72 illustrative repair records through five views. Every total and timeline reconciles to those records. Unit marks retain fractional remainders; matrix area and date spacing preserve the source values.

At 390px, the four quantitative figures fit the column with labels at least 14px. Threads turn vertically when there are at most four categories per stage and the labels fit, preserving all outcomes and the selected record. Denser paths scroll with an explicit cue. Exact data tables remain available in every figure. All five JSON exports were rendered in desktop and mobile browsers; invalid inputs preserved the previous output.
