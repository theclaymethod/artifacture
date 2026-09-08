Inputs:
- `report.json`.
- One screenshot per rendered figure, each scrolled into view.
- Extracted diagram label text.
- One-line content brief per figure.

Questions:
- [diagram-legend-matches-figure] Does every legend entry correspond to something drawn in the figure, and does every non-obvious encoding have an explanation? Do not require a legend for self-explanatory labels or symbols. Compare category identity by the visible labels and symbols; do not require equal styling, equal emphasis, or a special muted treatment when every category is present in both the figure and legend.
- [diagram-focal-single-dominant] Is the main relationship clear, with supporting detail subordinate where appropriate? Do not force a focal node when the comparison depends on equivalent peers.
- [diagram-proportional-honesty-visual] Do relative sizes and spacings visually match stated quantities, percentages, counts, or dates? For an explicitly scaled comparison, verify the visible geometry against the stated ratio. Correctly proportional bars are a pass even without a drawn axis; do not flag them merely because the containers are unequal or because the chart is sparse.
- [diagram-type-coherent] Does the figure read as one coherent diagram type matching its content, and if Mermaid was used, does it follow the renderer selection in diagram-design.md: explicit request, editable Mermaid source, or unsupported grammar that benefits from automatic layout?
- [diagram-removal-simplicity] Does every node, label, and line carry information, with no removable padding, generic equal cards, or all-identical boxes that erase hierarchy?
- [diagram-necessity] Could the content be conveyed just as well by a short 3-column table, bulleted list, or single sentence?

Verdict JSON schema:
`{"pass":true,"findings":[{"check_id":"<check-id>","evidence":"figure 2 screenshot: ...","fix":"..."}]}`

Fail examples:
- The legend lists "cache" but no cache element appears in the figure.
- A timeline claims elapsed-time spacing but draws a 1-day gap and a 6-month gap equally.
- A three-item list is drawn as three equal boxes with arrows and no added meaning.
