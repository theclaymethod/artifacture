Inputs:
- `report.json`.
- Standard screenshots: 1440x900 light, 1440x900 dark, 390x844 light, 390x844 dark.
- Candidate element lists named in the report for table-like div grids, clipping, fixed chrome, repeated-track layouts, slide screenshots, composition strips, sparse diagram slides, and demo frames when present.

Questions:
- [real-table-for-tabular-data] Does this div-grid present row/column tabular data such as a comparison, audit, or status matrix that should be a semantic `<table>`, rather than a card grid, KPI row, or feature grid?
- [hierarchy-squint-test] In the blurred 1440x900 light view, is there a clear dominant focal region with quieter subordinate regions, or does the page read uniformly flat with no visual hierarchy?
- [text-visibly-clipped] In the 390x844 light and dark screenshots, is any real content text visibly cut off by a container edge, with characters chopped or a sentence truncated without intentional ellipsis? Do not flag a narrow but fully readable label, a scrollable table whose content is not visibly chopped, or ordinary responsive wrapping.
- [fixed-ui-obscures-content] In the 390x844 screenshots, does fixed-position chrome such as a theme toggle, nav, or counter hide readable text or block a clickable target?
- [slide-single-focal-point] For each applicable slide screenshot, does the slide present one clear focal element, or do three or more elements compete for attention?
- [layout-repeated-track-symmetry] Only when a composition visibly uses repeated columns or rows: do equivalent tracks have balanced widths, aligned dividers/baselines, and intentional whitespace? When the supplied truth says rows are direct/equivalent counterparts, flag visible baseline or divider drift even if the cards look otherwise intentional. Stay silent when the truth identifies an evidence rail, compact control cluster, independent editorial items, or another supported hierarchy; do not treat those content-driven widths as a symmetry violation merely because peers are unequal. This is a registered rubric criterion under the `layout` pass, not an always-on catalog scan.
- [composition-variety-visual] In the flagged consecutive slide screenshot strip, do the slides look spatially repetitive, with the same alignment and whitespace balance, rather than genuinely varied?
- [sparse-diagram-slide] In the flagged slide screenshot, does the slide read as sparse or empty, such as a tiny diagram floating in a large viewport with no supporting content? Do not flag intentional reading space when the supplied evidence identifies an evidence rail or subordinate control area.

Verdict JSON schema:
`{"pass":true,"findings":[{"check_id":"<check-id>","evidence":"390-dark screenshot: ...","fix":"..."}]}`

Fail examples:
- A mobile heading loses its final word at the right edge and there is no ellipsis.
- A floating theme toggle covers a paragraph link at 390px width.
- Four consecutive slides reuse the same centered title, centered chart, and bottom caption layout.
- A three-column input/router/output slide gives the middle track a different width and breaks row alignment even though all three regions are peers.
