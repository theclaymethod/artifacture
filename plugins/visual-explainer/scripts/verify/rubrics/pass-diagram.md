Inputs:
- `report.json`.
- One screenshot per rendered figure, each scrolled into view.
- Extracted diagram label text.
- One-line content brief per figure.

Questions:
- [diagram-legend-matches-figure] Does every legend entry correspond to something drawn in the figure, and does every distinct visual category in the figure appear in the legend?
- [diagram-focal-single-dominant] Is there exactly one clearly dominant focal element, with no missing focal point and no two-or-more elements competing equally for primary attention?
- [diagram-proportional-honesty-visual] Do relative sizes and spacings visually match stated quantities, percentages, counts, or dates?
- [diagram-type-coherent] Does the figure read as one coherent diagram type matching its content, and if Mermaid was used, was it warranted by 15+ nodes, a uniform-shape forest, or an explicit request?
- [diagram-removal-simplicity] Does every node, label, and line carry information, with no removable padding, generic equal cards, or all-identical boxes that erase hierarchy?
- [diagram-necessity] Could the content be conveyed just as well by a short 3-column table, bulleted list, or single sentence?

Verdict JSON schema:
`{"pass":true,"findings":[{"check_id":"<check-id>","evidence":"figure 2 screenshot: ...","fix":"..."}]}`

Fail examples:
- The legend lists "cache" but no cache element appears in the figure.
- A timeline spaces a 1-day gap and a 6-month gap equally.
- A three-item list is drawn as three equal boxes with arrows and no added meaning.
