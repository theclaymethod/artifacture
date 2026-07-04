Inputs:
- Source inventory: sections, subsections, decision cards, table rows, collapsible details, footnotes, and feature/demo intent.
- Extracted rendered text: headings, bullets, table rows, cards, slide text, and demo summary.
- No page screenshots.

Questions:
- [deck-content-completeness] Reading the source document and extracted deck text side by side, list any source item with no corresponding slide or rendered content.
- [demo-adds-value] Does this demo convey interaction or motion information that a single annotated screenshot could not?

Verdict JSON schema:
`{"pass":true,"findings":[{"check_id":"<check-id>","evidence":"source table row ... missing from deck text","fix":"..."}]}`

Fail examples:
- A source decision card is absent from every slide heading, bullet, card, and speaker-visible text extract.
- A source table has 12 rows and the deck renders only 7 without grouping or explanation.
- A demo only shows a cursor moving and one static click state; a labeled still would communicate the same information.
